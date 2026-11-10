    function WorkbenchDocumentEditor({ t, state, document: record, mutate, busy, onUpdate, onDirty }) {
      const localKey = `dsh-todos.document-draft.${record.id}`;
      const [initialLocal] = useState(() => {
        try { const raw = JSON.parse(wbStorage.get(localKey)); return raw && typeof raw.content === 'string' ? raw : null; } catch { return null; }
      });
      const [content, setContent] = useState(initialLocal?.content ?? record.content ?? '');
      const [dirty, setDirty] = useState(initialLocal !== null && initialLocal.content !== record.content);
      const [sourceRevision, setSourceRevision] = useState(initialLocal?.baseRevisionId ?? record.currentRevisionId);
      const [message, setMessage] = useState(null);
      const [versionId, setVersionId] = useState('');
      const [action, setAction] = useState({ title: '', successCriteria: '', dueDate: '', projectId: record.projectIds?.length === 1 ? record.projectIds[0] : '' });
      useEffect(() => {
        onDirty(dirty);
        if (dirty) wbStorage.set(localKey, JSON.stringify({ content, baseRevisionId: sourceRevision }));
        else wbStorage.remove(localKey);
        return () => {};
      }, [dirty, content, sourceRevision]);
      useEffect(() => {
        if (!dirty) { setContent(record.content ?? ''); setSourceRevision(record.currentRevisionId); }
      }, [record.currentRevisionId, record.content, dirty]);
      useEffect(() => {
        if (!dirty) return undefined;
        const warn = (event) => { event.preventDefault(); event.returnValue = ''; };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
      }, [dirty]);
      const save = async (status) => {
        const result = await mutate({ op: 'document.save', id: record.id, content, status, baseRevisionId: sourceRevision });
        if (result?.data?.document) { setDirty(false); onDirty(false); wbStorage.remove(localKey); onUpdate(result.data.document); setMessage(wb(t, 'saved')); }
      };
      const regenerate = async () => {
        const result = await mutate({ op: record.type === 'review' ? 'review.generate' : 'report.generate', documentId: record.id });
        if (result?.data?.document) { onUpdate(result.data.document); setVersionId(result.data.revision?.id ?? ''); setMessage(wb(t, 'generatedRevision')); }
      };
      const exportDocument = () => {
        const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const anchor = window.document.createElement('a');
        anchor.href = url; anchor.download = `${String(record.title || 'report').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').slice(0, 120)}.md`;
        window.document.body.appendChild(anchor); anchor.click(); anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      };
      const copy = async () => {
        try { await navigator.clipboard.writeText(content); setMessage(wb(t, 'copied')); }
        catch { setMessage(wb(t, 'copyFailed')); }
      };
      const revisions = wbList(record.revisions);
      const selectedVersion = revisions.find((version) => version.id === versionId);
      const facts = selectedVersion?.facts ?? record.facts ?? revisions.find((version) => version.id === record.currentRevisionId)?.facts;
      const saveAction = async (event) => {
        event.preventDefault();
        const result = await mutate({ op: 'review.action', documentId: record.id, ...action, projectId: action.projectId || null, dueDate: action.dueDate || null });
        if (result?.data?.document) { onUpdate(result.data.document); setAction({ ...action, title: '', successCriteria: '', dueDate: '' }); setMessage(wb(t, 'actionCreated')); }
      };
      const recordStatus = record.status === 'final' ? 'final' : record.type === 'review' ? 'pendingReview' : 'draft';
      return h('section', { className: 'dsh-wb-card dsh-wb-editor' },
        h('div', { className: 'dsh-wb-sectionHead' }, h('h2', null, record.title), h('span', { className: 'dsh-wb-badge' }, wb(t, recordStatus))),
        h('p', { className: 'dsh-wb-hint' }, `${record.startDate} — ${wbDateShift(record.endDate, -1)} · ${record.timezone ?? state.settings?.timezone ?? ''}`),
        h('p', { className: 'dsh-wb-hint' }, wb(t, record.type === 'review' ? 'privateReview' : 'reportHint')),
        dirty && record.currentRevisionId !== sourceRevision ? h('p', { className: 'dsh-wb-warning', role: 'alert' }, wb(t, 'changedElsewhere')) : null,
        h(WBField, { label: wb(t, 'content') }, h('textarea', { className: 'dsh-todos-input dsh-wb-documentContent', value: content, rows: 20, maxLength: 60000,
          onChange: (event) => { setContent(event.target.value); setDirty(true); setMessage(null); } })),
        dirty ? h('p', { className: 'dsh-wb-hint', role: 'status' }, wb(t, 'unsaved'), ' · ', wb(t, 'localDraft')) : null,
        message ? h('p', { className: 'dsh-wb-hint', role: 'status' }, message) : null,
        h('div', { className: 'dsh-wb-actions' },
          dirty ? h(WBButton, { onClick: () => { setContent(record.content); setSourceRevision(record.currentRevisionId); setDirty(false); onDirty(false); wbStorage.remove(localKey); } }, wb(t, 'discard')) : null,
          h(WBButton, { onClick: exportDocument, disabled: !content }, wb(t, 'export')),
          h(WBButton, { onClick: () => void copy(), disabled: !content }, wb(t, 'copy')),
          h(WBButton, { onClick: () => void save(record.type === 'review' ? 'pending' : 'draft'), disabled: busy || !content.trim() }, wb(t, 'saveDraft')),
          h(WBButton, { onClick: () => void save('final'), primary: true, disabled: busy || !content.trim() }, wb(t, record.type === 'review' ? 'finalizeReview' : 'finalize'))),
        h('details', { className: 'dsh-wb-disclosure', open: Boolean(versionId) }, h('summary', null, wb(t, 'history'), ` · ${revisions.length}`),
          h('p', { className: 'dsh-wb-hint' }, wb(t, 'versionHint')),
          h('div', { className: 'dsh-wb-inline' }, h('select', { className: 'dsh-todos-input', value: versionId, 'aria-label': wb(t, 'history'), onChange: (event) => setVersionId(event.target.value) },
            h('option', { value: '' }, wb(t, 'firstSelect')), ...revisions.map((revision, index) => h('option', { key: revision.id, value: revision.id },
              `${wb(t, 'version', { value: index + 1 })} · ${wbFormatTime(revision.at, state, t)}${revision.id === record.currentRevisionId ? ` · ${wb(t, 'selected')}` : ''}`))),
            h(WBButton, { disabled: busy || dirty, onClick: () => void regenerate() }, wb(t, 'regenerate'))),
          selectedVersion ? h('div', { className: 'dsh-wb-versionPreview' }, h('pre', null, selectedVersion.content ?? ''),
            h(WBButton, { disabled: busy || dirty, onClick: async () => {
              const result = await mutate({ op: 'document.restore', id: record.id, revisionId: selectedVersion.id, baseRevisionId: record.currentRevisionId });
              if (result?.data?.document) { onUpdate(result.data.document); setVersionId(''); setMessage(wb(t, 'saved')); }
            } }, wb(t, 'restoreVersion'))) : null),
        h('details', { className: 'dsh-wb-disclosure' }, h('summary', null, wb(t, 'evidence')),
          h('p', { className: 'dsh-wb-hint' }, wb(t, 'evidenceHint')),
          facts ? h('ul', { className: 'dsh-wb-timeline' },
            ...wbList(facts.completed).map((item) => h('li', { key: item.sourceId ?? item.id ?? item.taskId }, h('span', { className: 'dsh-wb-badge' }, wb(t, 'complete')), ' ', item.title,
              h('small', null, facts.projectNames?.[item.projectId || 'unassigned'] ?? wbProjectName(state, item.projectId, t), ' · ', wbFormatTime(item.completedAt, state, t)))),
            ...wbList(facts.logs).map((log) => h('li', { key: log.id }, h('span', { className: 'dsh-wb-badge' }, wb(t, `log.${log.kind}`)), ' ', log.text,
              h('small', null, wbFormatTime(log.at, state, t)))),
            !facts.activityCount ? h('li', null, wb(t, 'noRecords')) : null) : h(WBEmpty, null, wb(t, 'noRecords'))),
        record.type === 'review' ? h('div', { className: 'dsh-wb-actionSection' }, h('h3', null, wb(t, 'actions')),
          wbList(record.actions).length ? h('ul', { className: 'dsh-wb-plainList' }, ...record.actions.map((item) => h('li', { key: item.taskId },
            h('span', null, item.title, h('small', null, item.successCriteria || '', item.checkDate ? ` · ${item.checkDate}` : '')),
            h('span', { className: 'dsh-wb-badge' }, wb(t, `status.${state.items.find((task) => task.id === item.taskId)?.status ?? 'todo'}`))))) : null,
          h('form', { className: 'dsh-wb-form', onSubmit: saveAction }, h('div', { className: 'dsh-wb-formGrid' },
            h(WBField, { label: wb(t, 'actionTitle'), wide: true }, h('input', { className: 'dsh-todos-input', value: action.title, required: true, maxLength: 200, onChange: (event) => setAction({ ...action, title: event.target.value }) })),
            h(WBField, { label: wb(t, 'project') }, h(WBProjectSelect, { t, state, value: action.projectId, onChange: (value) => setAction({ ...action, projectId: value }) })),
            h(WBField, { label: wb(t, 'actionCheck') }, h('input', { className: 'dsh-todos-input', type: 'date', value: action.dueDate, onChange: (event) => setAction({ ...action, dueDate: event.target.value }) })),
            h(WBField, { label: wb(t, 'actionCriteria'), wide: true }, h('input', { className: 'dsh-todos-input', value: action.successCriteria, maxLength: 2000, onChange: (event) => setAction({ ...action, successCriteria: event.target.value }) }))),
            h('div', { className: 'dsh-wb-actions' }, h(WBButton, { type: 'submit', primary: true, disabled: busy || !action.title.trim() }, wb(t, 'addAction'))))) : null);
    }

    function WorkbenchRoutineForm({ t, state, mutate, busy, routine, defaultProjects, onClose }) {
      const [fields, setFields] = useState(() => ({ name: routine?.name ?? '', kind: routine?.kind ?? 'report', reportKind: routine?.reportKind ?? 'weekly',
        projectIds: routine?.projectIds ?? defaultProjects ?? [], tags: (routine?.tags ?? []).join(', '), frequency: routine?.frequency ?? 'weekly',
        interval: routine?.interval ?? 1, unit: routine?.unit ?? 'day', weekdays: routine?.weekdays ?? [1], monthDay: routine?.monthDay ?? 1,
        time: routine?.time ?? '09:00', anchorDate: routine?.anchorDate ?? state.todayDate, timezone: routine?.timezone ?? state.settings?.timezone ?? 'UTC',
        coverage: routine?.coverage ?? 'previous', windowDays: routine?.windowDays ?? 7, template: routine?.template ?? '',
        enabled: routine?.enabled ?? true, mode: routine?.mode ?? 'draft' }));
      const [preview, setPreview] = useState(routine?.nextRuns ?? []);
      const change = (key) => (event) => { setFields((current) => ({ ...current, [key]: event.target.value })); setPreview([]); };
      const request = () => ({ ...(routine ? { id: routine.id } : {}), ...fields, tags: parseTags(fields.tags), interval: Number(fields.interval),
        monthDay: fields.monthDay === 'last' ? 'last' : Number(fields.monthDay), windowDays: Number(fields.windowDays) });
      const save = async (event) => { event.preventDefault(); const result = await mutate({ op: 'routine.save', ...request() }); if (result) onClose(); };
      const doPreview = async () => { const result = await mutate({ op: 'routine.preview', ...request() }); if (result) setPreview(result.data?.nextRuns ?? []); };
      const locale = String(t('zen.locale')).startsWith('en') ? 'en-US' : 'zh-CN';
      const weekdayNames = Array.from({ length: 7 }, (_, index) => new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 10, 8 + index))));
      return h('form', { className: 'dsh-wb-card dsh-wb-form', onSubmit: save },
        h('h2', null, wb(t, routine ? 'editRoutine' : 'newRoutine')),
        h('div', { className: 'dsh-wb-formGrid' },
          h(WBField, { label: wb(t, 'routineName'), wide: true }, h('input', { className: 'dsh-todos-input', value: fields.name, maxLength: 200, required: true, onChange: change('name') })),
          h(WBField, { label: wb(t, 'documentType') }, h('select', { className: 'dsh-todos-input', value: fields.kind, onChange: change('kind') },
            h('option', { value: 'report' }, wb(t, 'reports')), h('option', { value: 'review' }, wb(t, 'reviews')))),
          h(WBField, { label: wb(t, 'range') }, h('select', { className: 'dsh-todos-input', value: fields.reportKind, onChange: change('reportKind') },
            ...['daily', 'weekly', 'monthly'].map((value) => h('option', { key: value, value }, wb(t, fields.kind === 'review' ? `${value}Review` : value))))),
          h(WBField, { label: wb(t, 'frequency') }, h('select', { className: 'dsh-todos-input', value: fields.frequency,
            onChange: (event) => { const value = event.target.value; setFields({ ...fields, frequency: value, coverage: value === 'interval' ? 'rolling' : 'previous' }); setPreview([]); } },
            ...[['daily', 'everyDay'], ['weekly', 'everyWeek'], ['monthly', 'everyMonth'], ['interval', 'everyInterval']].map(([value, label]) => h('option', { key: value, value }, wb(t, label))))),
          h(WBField, { label: wb(t, 'time') }, h('input', { className: 'dsh-todos-input', type: 'time', value: fields.time, required: true, onChange: change('time') })),
          h(WBField, { label: wb(t, 'timezone') }, h('input', { className: 'dsh-todos-input', value: fields.timezone, required: true, onChange: change('timezone') })),
          h(WBField, { label: wb(t, 'mode') }, h('select', { className: 'dsh-todos-input', value: fields.mode, onChange: change('mode') },
            h('option', { value: 'draft' }, wb(t, 'modeDraft')), h('option', { value: 'remind' }, wb(t, 'modeRemind')))),
          fields.frequency === 'monthly' ? h(WBField, { label: wb(t, 'monthDay') }, h('select', { className: 'dsh-todos-input', value: fields.monthDay, onChange: change('monthDay') },
            ...Array.from({ length: 31 }, (_, index) => h('option', { key: index + 1, value: index + 1 }, index + 1)), h('option', { value: 'last' }, wb(t, 'monthLast')))) : null,
          fields.frequency === 'interval' ? h(WBField, { label: wb(t, 'interval') }, h('input', { className: 'dsh-todos-input', type: 'number', value: fields.interval, min: 1, max: 365, required: true, onChange: change('interval') })) : null,
          fields.frequency === 'interval' ? h(WBField, { label: wb(t, 'unit') }, h('select', { className: 'dsh-todos-input', value: fields.unit, onChange: change('unit') }, h('option', { value: 'day' }, wb(t, 'day')), h('option', { value: 'week' }, wb(t, 'week')))) : null,
          fields.frequency === 'interval' ? h(WBField, { label: wb(t, 'anchorDate') }, h('input', { className: 'dsh-todos-input', type: 'date', value: fields.anchorDate, required: true, onChange: change('anchorDate') })) : null,
          h(WBField, { label: wb(t, 'coverage') }, h('select', { className: 'dsh-todos-input', value: fields.coverage, onChange: change('coverage') },
            h('option', { value: 'previous' }, wb(t, 'previousPeriod')), h('option', { value: 'current' }, wb(t, 'currentPeriod')), h('option', { value: 'rolling' }, wb(t, 'rollingPeriod')))),
          fields.coverage === 'rolling' ? h(WBField, { label: wb(t, 'windowDays') }, h('input', { className: 'dsh-todos-input', type: 'number', min: 1, max: 1095, value: fields.windowDays, required: true, onChange: change('windowDays') })) : null,
          h(WBField, { label: wb(t, 'tagScope'), hint: wb(t, 'tagScopeHint'), wide: true }, h('input', { className: 'dsh-todos-input', value: fields.tags, onChange: change('tags') }))),
        fields.frequency === 'weekly' ? h('fieldset', { className: 'dsh-wb-scope' }, h('legend', null, wb(t, 'weekdays')),
          h('div', { className: 'dsh-wb-checks' }, ...weekdayNames.map((name, day) => h('label', { key: day, className: 'dsh-wb-checkLabel' },
            h('input', { type: 'checkbox', checked: fields.weekdays.includes(day), onChange: (event) => { setFields({ ...fields, weekdays: event.target.checked ? [...fields.weekdays, day] : fields.weekdays.filter((value) => value !== day) }); setPreview([]); } }), name)))) : null,
        h(WBProjectScope, { t, state, value: fields.projectIds, onChange: (value) => { setFields({ ...fields, projectIds: value }); setPreview([]); }, disabled: busy }),
        h('details', { className: 'dsh-wb-disclosure' }, h('summary', null, wb(t, 'template')),
          h(WBField, { label: wb(t, 'templateHint') }, h('textarea', { className: 'dsh-todos-input dsh-wb-textarea', value: fields.template, rows: 4, maxLength: 5000, onChange: change('template') }))),
        h('label', { className: 'dsh-wb-checkLabel' }, h('input', { type: 'checkbox', checked: fields.enabled, onChange: (event) => setFields({ ...fields, enabled: event.target.checked }) }), wb(t, 'enabled')),
        h('p', { className: 'dsh-wb-hint' }, wb(t, 'previewHint')),
        preview.length ? h('ol', { className: 'dsh-wb-runPreview' }, ...preview.map((run, index) => h('li', { key: run.scheduledAt ?? index },
          h('strong', null, wbFormatTime(run.scheduledAt, { settings: { timezone: fields.timezone } }, t)), h('span', null, ` ${run.startDate} — ${run.endDate} · ${fields.timezone}`)))) : null,
        h('div', { className: 'dsh-wb-actions' }, h(WBButton, { onClick: onClose }, wb(t, 'cancel')),
          h(WBButton, { onClick: () => void doPreview(), disabled: busy }, wb(t, 'preview')),
          h(WBButton, { type: 'submit', primary: true, disabled: busy || !fields.name.trim() || (fields.frequency === 'weekly' && !fields.weekdays.length) }, wb(t, 'save'))));
    }

    function WorkbenchRoutines({ t, state, mutate, busy, defaultProjects = [], onDocument }) {
      const [editing, setEditing] = useState(null);
      const [runFilter, setRunFilter] = useState('');
      const routines = wbList(state.routines);
      const runs = wbList(state.runs).filter((run) => !runFilter || run.routineId === runFilter);
      return h('div', { className: 'dsh-wb-stack' },
        h('div', { className: 'dsh-wb-sectionHead' }, h('h2', null, wb(t, 'routines')), h(WBButton, { primary: true, onClick: () => setEditing({}), disabled: busy }, wb(t, 'newRoutine'))),
        h('p', { className: 'dsh-wb-hint' }, wb(t, 'automationHint')),
        state.automation?.errors?.length ? h('div', { className: 'dsh-wb-warning', role: 'status' },
          ...state.automation.errors.map((error, index) => h('p', { key: error.routineId ?? index }, routines.find((rule) => rule.id === error.routineId)?.name ?? '', ' · ', error.message))) : null,
        state.automation?.olderMissed?.length ? h('p', { className: 'dsh-wb-hint' }, wb(t, 'missedPeriods'), ' ', state.automation.olderMissed.reduce((sum, entry) => sum + Number(entry.count || 0), 0)) : null,
        editing ? h(WorkbenchRoutineForm, { key: editing.id ?? 'new', t, state, mutate, busy, routine: editing.id ? editing : null, defaultProjects, onClose: () => setEditing(null) }) : null,
        !routines.length ? h(WBEmpty, null, wb(t, 'noRoutines')) : routines.map((routine) => h('section', { key: routine.id, className: 'dsh-wb-card' },
          h('div', { className: 'dsh-wb-sectionHead' }, h('h3', null, routine.name), h('span', { className: 'dsh-wb-badge' }, wb(t, routine.enabled ? 'enabled' : 'paused'))),
          h('p', { className: 'dsh-wb-meta' }, wb(t, routine.kind === 'review' ? `${routine.reportKind}Review` : routine.reportKind), ' · ',
            routine.projectIds?.length ? routine.projectIds.map((id) => wbProjectName(state, id, t)).join(' / ') : wb(t, 'allProjects'), ' · ', routine.time, ' ', routine.timezone),
          wbList(routine.nextRuns).length ? h('p', { className: 'dsh-wb-hint' }, wb(t, 'nextRuns'), ' · ', wbList(routine.nextRuns).map((run) => wbFormatTime(run.scheduledAt, { settings: { timezone: routine.timezone } }, t)).join(' / ')) : null,
          h('div', { className: 'dsh-wb-actions' },
            h(WBButton, { disabled: busy, onClick: () => setEditing(routine) }, wb(t, 'edit')),
            h(WBButton, { disabled: busy, onClick: () => void mutate({ op: 'routine.save', id: routine.id, enabled: !routine.enabled }) }, wb(t, routine.enabled ? 'pause' : 'resume')),
            h(WBButton, { disabled: busy, onClick: () => setRunFilter(runFilter === routine.id ? '' : routine.id) }, wb(t, 'runHistory')),
            h(WBButton, { disabled: busy, primary: true, onClick: async () => { const result = await mutate({ op: 'routine.run', id: routine.id });
              if (result?.data?.document) onDocument(result.data.document); } }, wb(t, 'runNow'))),
          h('details', { className: 'dsh-wb-disclosure' }, h('summary', null, wb(t, 'routineAdjust')),
            h('div', { className: 'dsh-wb-actions' },
              h(WBButton, { disabled: busy || !routine.enabled, onClick: () => void mutate({ op: 'routine.snooze', id: routine.id, minutes: 60 }) }, wb(t, 'snooze')),
              h(WBButton, { disabled: busy, onClick: () => void mutate({ op: 'routine.skip', id: routine.id }) }, wb(t, 'skipPeriod')))))),
        h('section', { className: 'dsh-wb-card' }, h('h2', null, wb(t, 'runHistory')),
          !runs.length ? h(WBEmpty, null, wb(t, 'noRuns')) : h('ul', { className: 'dsh-wb-timeline' }, ...runs.slice(0, 40).map((run) => h('li', { key: run.id },
            h('div', { className: 'dsh-wb-sectionHead' }, h('strong', null, routines.find((routine) => routine.id === run.routineId)?.name ?? run.name ?? wb(t, 'routines')),
              h('span', { className: 'dsh-wb-badge' }, wb(t, `run.${run.status}`))),
            h('p', { className: 'dsh-wb-hint' }, run.startDate ?? '', ' — ', run.endDate ?? '', ' · ', wbFormatTime(run.completedAt ?? run.createdAt ?? run.scheduledAt, state, t)),
            run.error ? h('p', { className: 'dsh-wb-warning' }, String(run.error?.message ?? run.error)) : null,
            run.status === 'reminder' ? h(WBButton, { disabled: busy, primary: true, onClick: async () => {
              const result = await mutate({ op: 'routine.generate', runId: run.id }); if (result?.data?.document) onDocument(result.data.document);
            } }, wb(t, 'generate')) : null,
            run.documentId ? h(WBButton, { disabled: busy, onClick: async () => { const result = await mutate({ op: 'document.get', id: run.documentId });
              if (result?.data?.document) onDocument(result.data.document); } }, wb(t, 'edit')) : null)))));
    }

    /** Last seven days by time of day as a heatmap; the readout and day buttons carry the numbers. */
    function WorkbenchActivity({ t, state, onPickDay }) {
      const grid = useMemo(() => sceneData('activityGrid', { logs: state.logs, focusSessions: state.focusSessions, items: state.items,
        archivedItems: state.archivedItems, endDate: state.todayDate || localDateKey(), timezone: state.settings?.timezone }, null),
      [state.revision, state.todayDate, state.settings?.timezone]);
      const [cell, setCell] = useState(null);
      const [day, setDay] = useState(null);
      if (!grid) return null;
      const locale = t('zen.locale') === 'en-US' ? 'en-US' : 'zh-CN';
      const format = (date, options) => new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
      const weekday = (date) => format(date, { weekday: 'short' });
      const summary = (entry) => wb(t, 'activitySummary', { focus: entry.focus, logs: entry.logs, done: entry.done });
      const range = (entry, key) => wb(t, key, { day: weekday(entry.date), from: entry.fromHour, to: entry.fromHour + grid.hoursPerBucket });
      const busiest = Math.max(1, ...grid.perDay.map((entry) => entry.value));
      const readout = cell ? `${range(cell, 'activityCell')} · ${summary(cell)}`
        : day !== null ? `${format(grid.perDay[day].date, { month: 'numeric', day: 'numeric', weekday: 'short' })} · ${summary(grid.perDay[day])}`
          : grid.max === 0 ? wb(t, 'activityEmpty') : `${summary(grid.totals)} · ${range(grid.peak, 'activityPeak')}`;
      const cellsByBucket = Array.from({ length: grid.buckets }, (_, bucket) => grid.cells.filter((entry) => entry.bucket === bucket));
      return h('section', { className: 'dsh-wb-card dsh-wb-activityCard' },
        h('h2', null, wb(t, 'activityTitle')),
        h('p', { className: 'dsh-wb-hint' }, wb(t, 'activityHint')),
        h('div', { className: 'dsh-wb-heatmap', 'aria-hidden': true, onMouseLeave: () => setCell(null) },
          ...cellsByBucket.flatMap((row, bucket) => [
            h('span', { key: `h${bucket}`, className: 'dsh-wb-heatHour' }, bucket % 3 === 0 ? wb(t, 'hourMark', { hour: bucket * grid.hoursPerBucket }) : ''),
            ...row.map((entry) => h('span', { key: `${entry.day}-${bucket}`,
              className: cx('dsh-wb-heatCell', cell === entry && 'is-linked', (day ?? cell?.day) === entry.day && 'is-day'),
              style: { '--level': grid.max > 0 ? entry.value / grid.max : 0 }, 'data-empty': entry.value === 0 ? '' : undefined,
              onMouseEnter: () => setCell(entry), onClick: () => onPickDay(entry.date) })),
          ])),
        h('p', { className: 'dsh-wb-sceneReadout' }, readout),
        h('div', { className: 'dsh-wb-dayRow' }, ...grid.perDay.map((entry) => h('button', {
          key: entry.date, type: 'button',
          className: cx('dsh-wb-dayButton dsh-todos-focusable', (day === entry.day || cell?.day === entry.day) && 'is-linked'),
          'data-today': entry.date === state.todayDate ? '' : undefined,
          onMouseEnter: () => setDay(entry.day), onMouseLeave: () => setDay(null), onFocus: () => setDay(entry.day), onBlur: () => setDay(null),
          onClick: () => onPickDay(entry.date),
        }, h('span', null, weekday(entry.date)), h('strong', null, String(Number(entry.date.slice(8)))),
        h('span', { className: 'dsh-wb-dayLevel', style: { '--level': entry.value / busiest }, 'aria-hidden': true }),
        h('span', { className: 'dsh-todos-srOnly' }, wb(t, 'dayPick', { day: format(entry.date, { month: 'long', day: 'numeric' }), summary: summary(entry) }))))));
    }

    function WorkbenchReview({ t, state, mutate, busy, motion, seed, onDirty }) {
      const [tab, setTab] = useState(seed?.routines ? 'routines' : seed?.type === 'review' ? 'reviews' : 'reports');
      const [kind, setKind] = useState(seed?.kind ?? 'weekly');
      const defaultWindow = wbDefaultWindow(seed?.kind ?? 'weekly', state.todayDate || localDateKey(), state.settings?.weekStartsOn ?? 1);
      const [startDate, setStartDate] = useState(seed?.startDate ?? defaultWindow.startDate);
      const [endDate, setEndDate] = useState(seed?.endDate ? wbDateShift(seed.endDate, -1) : defaultWindow.endDate);
      const [projectIds, setProjectIds] = useState(seed?.projectIds ?? []);
      const [tags, setTags] = useState('');
      const [selectedDocument, setSelectedDocument] = useState(null);
      const [editorDirty, setEditorDirty] = useState(false);
      const [message, setMessage] = useState(null);
      useEffect(() => { onDirty(editorDirty); return () => onDirty(false); }, [editorDirty]);
      const setDirty = (value) => { setEditorDirty(value); onDirty(value); };
      const formRef = useRef(null);
      const [flash, setFlash] = useState(0);
      useEffect(() => {
        if (!flash) return undefined;
        const timer = setTimeout(() => setFlash(0), 900);
        return () => clearTimeout(timer);
      }, [flash]);
      // Picking a day in the activity view drafts that single day.
      const pickDay = (date) => {
        setKind('daily'); setStartDate(date); setEndDate(date); setFlash((value) => value + 1);
        formRef.current?.scrollIntoView({ block: 'nearest', behavior: motion ? 'smooth' : 'auto' });
      };
      const selectDocument = async (record) => {
        if (editorDirty && record.id !== selectedDocument?.id) { setMessage(wb(t, 'confirmLeave')); return; }
        const result = await mutate({ op: 'document.get', id: record.id });
        if (result?.data?.document) { setSelectedDocument(result.data.document); setTab(result.data.document.type === 'review' ? 'reviews' : 'reports'); setMessage(null); }
      };
      const updateDocument = (record) => setSelectedDocument(record);
      const changeTab = (value) => {
        if (editorDirty) { setMessage(wb(t, 'confirmLeave')); return; }
        setTab(value); setSelectedDocument(null); setMessage(null);
      };
      const generate = async (event) => {
        event.preventDefault();
        if (editorDirty) { setMessage(wb(t, 'confirmLeave')); return; }
        if (!startDate || !endDate || endDate < startDate) { setMessage(wb(t, 'dateInvalid')); return; }
        const result = await mutate({ op: tab === 'reviews' ? 'review.generate' : 'report.generate', kind, startDate, endDate: wbDateShift(endDate, 1), projectIds, tags: parseTags(tags) });
        if (result?.data?.document) { setSelectedDocument(result.data.document); setMessage(null); }
      };
      useEffect(() => {
        if (!selectedDocument) return;
        const remote = wbList(state.documents).find((record) => record.id === selectedDocument.id);
        if (remote && remote.currentRevisionId !== selectedDocument.currentRevisionId) {
          // Keep full revision data loaded in this editor; a poll never replaces local input.
          setSelectedDocument((current) => ({ ...current, content: remote.content, currentRevisionId: remote.currentRevisionId, status: remote.status }));
        }
      }, [state.revision]);
      const documents = wbList(state.documents).filter((record) => record.type === (tab === 'reviews' ? 'review' : 'report')
        && (!projectIds.length || record.projectIds?.some((id) => projectIds.includes(id))));
      return h('div', { className: 'dsh-wb-stack' },
        h('div', { className: 'dsh-todos-viewSwitch dsh-wb-subnav', role: 'group', 'aria-label': wb(t, 'review') },
          ...['reports', 'reviews', 'routines'].map((key) => h('button', { key, type: 'button', className: 'dsh-todos-viewButton dsh-todos-focusable',
            'aria-pressed': tab === key, onClick: () => changeTab(key) }, wb(t, key)))),
        message ? h('p', { className: 'dsh-wb-warning', role: 'status' }, message) : null,
        tab === 'routines' ? h(WorkbenchRoutines, { t, state, mutate, busy, defaultProjects: projectIds, onDocument: (record) => { setSelectedDocument(record); setTab(record.type === 'review' ? 'reviews' : 'reports'); } }) : h(React.Fragment, null,
          h(WorkbenchActivity, { t, state, onPickDay: pickDay }),
          h('form', { ref: formRef, key: `form-${flash > 0}`, className: cx('dsh-wb-card dsh-wb-form', flash > 0 && 'dsh-wb-flash'), onSubmit: generate },
            h('h2', null, wb(t, 'generate')),
            h('div', { className: 'dsh-wb-formGrid' },
              h(WBField, { label: wb(t, 'documentType') }, h('select', { className: 'dsh-todos-input', value: kind, onChange: (event) => {
                const value = event.target.value; const range = wbDefaultWindow(value, state.todayDate || localDateKey(), state.settings?.weekStartsOn ?? 1);
                setKind(value); setStartDate(range.startDate); setEndDate(range.endDate);
              } },
                ...['daily', 'weekly', 'monthly'].map((value) => h('option', { key: value, value }, wb(t, tab === 'reviews' ? `${value}Review` : value))))),
              h(WBField, { label: wb(t, 'startDate') }, h('input', { className: 'dsh-todos-input', type: 'date', value: startDate, required: true, onChange: (event) => setStartDate(event.target.value) })),
              h(WBField, { label: wb(t, 'endDate') }, h('input', { className: 'dsh-todos-input', type: 'date', value: endDate, min: startDate, required: true, onChange: (event) => setEndDate(event.target.value) })),
              h(WBField, { label: wb(t, 'tagScope'), hint: wb(t, 'tagScopeHint') }, h('input', { className: 'dsh-todos-input', value: tags, onChange: (event) => setTags(event.target.value) }))),
            h(WBProjectScope, { t, state, value: projectIds, onChange: setProjectIds, disabled: busy }),
            h('p', { className: 'dsh-wb-hint' }, wb(t, tab === 'reviews' ? 'privateReview' : 'reportHint')),
            h('div', { className: 'dsh-wb-actions' }, h(WBButton, { type: 'submit', primary: true, disabled: busy || editorDirty }, wb(t, busy ? 'generating' : 'generate')))),
          documents.length ? h('div', { className: 'dsh-wb-documentList' }, ...documents.map((record) => h('button', {
            key: record.id, type: 'button', className: 'dsh-wb-documentCard dsh-todos-focusable', 'aria-pressed': selectedDocument?.id === record.id,
            onClick: () => void selectDocument(record), disabled: busy,
          }, h('strong', null, record.title), h('span', null, `${record.startDate} — ${wbDateShift(record.endDate, -1)}`),
          h('span', { className: 'dsh-wb-badge' }, wb(t, record.status === 'final' ? 'final' : record.type === 'review' ? 'pendingReview' : 'draft'))))) : h(WBEmpty, null, wb(t, 'noDocuments')),
          selectedDocument ? h(WorkbenchDocumentEditor, { key: selectedDocument.id, t, state, document: selectedDocument, mutate, busy, onUpdate: updateDocument, onDirty: setDirty }) : null));
    }
