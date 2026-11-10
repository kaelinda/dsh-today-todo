    /** Small, native-control workbench views. All mutations use the Host store. */
    const WB_STATUSES = ['todo', 'doing', 'waiting', 'done', 'cancelled'];
    const WB_LOG_KINDS = ['progress', 'outcome', 'blocker', 'decision'];
    const wbList = (value) => Array.isArray(value) ? value : [];
    const wbProjectName = (state, id, t) => wbList(state.projects).find((item) => item.id === id)?.name ?? wb(t, 'unassigned');
    const wbTaskName = (state, id, t) => [...wbList(state.items), ...wbList(state.archivedItems)].find((item) => item.id === id)?.title ?? wb(t, 'historicalTask');
    function wbInsightText(t, suggestion, state) {
      const key = `insight.${suggestion.kind}`;
      if (!WORKBENCH_EN[key]) return suggestion.text ?? suggestion.detail ?? suggestion.message ?? suggestion.title ?? suggestion.kind;
      return wb(t, key, {
        count: wbList(suggestion.taskIds).length,
        estimated: state.insights?.estimatedMinutes ?? '—', budget: state.insights?.budgetMinutes ?? '—',
        title: wbTaskName(state, suggestion.taskIds?.[0], t), times: wbList(suggestion.sourceIds).length,
        samples: suggestion.sampleSize ?? wbList(suggestion.taskIds).length,
        ratio: Number.isFinite(suggestion.ratio) ? suggestion.ratio.toFixed(1) : '—',
      });
    }
    const wbDateShift = (date, days) => {
      const value = new Date(`${date}T12:00:00Z`);
      value.setUTCDate(value.getUTCDate() + days);
      return Number.isFinite(value.getTime()) ? value.toISOString().slice(0, 10) : date;
    };
    function wbDefaultWindow(kind, today, weekStartsOn = 1) {
      if (kind === 'daily') return { startDate: wbDateShift(today, -1), endDate: wbDateShift(today, -1) };
      if (kind === 'monthly') {
        const first = `${today.slice(0, 7)}-01`;
        const previous = wbDateShift(first, -1);
        return { startDate: `${previous.slice(0, 7)}-01`, endDate: previous };
      }
      const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
      const first = wbDateShift(today, -(weekday - weekStartsOn + 7) % 7);
      return { startDate: wbDateShift(first, -7), endDate: wbDateShift(first, -1) };
    }
    /** Interpret a datetime-local field in the explicitly displayed user zone. */
    function wbWallTime(value, timezone) {
      const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
      if (!match) return NaN;
      const [, year, month, day, hour, minute] = match.map(Number);
      const target = Date.UTC(year, month - 1, day, hour, minute);
      const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
      const wall = (at) => {
        const parts = Object.fromEntries(formatter.formatToParts(new Date(at)).filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]));
        return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
      };
      let guess = target;
      for (let index = 0; index < 4; index += 1) guess += target - wall(guess);
      if (wall(guess) !== target) return NaN;
      // A repeated wall time uses the first occurrence, matching routine policy.
      for (let offset = 180; offset >= 15; offset -= 15) if (wall(guess - offset * 60000) === target) return guess - offset * 60000;
      return guess;
    }
    const wbFormatTime = (value, state, t) => {
      if (!value) return '—';
      try {
        return new Intl.DateTimeFormat(t('zen.locale') === 'en-US' ? 'en-US' : 'zh-CN', {
          timeZone: state.settings?.timezone || undefined, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
        }).format(new Date(value));
      } catch { return String(value); }
    };
    const wbStorage = {
      get(key) { try { return localStorage.getItem(key); } catch { return null; } },
      set(key, value) { try { localStorage.setItem(key, value); } catch { /* Optional local recovery. */ } },
      remove(key) { try { localStorage.removeItem(key); } catch { /* Optional local recovery. */ } },
    };

    function WBButton({ children, primary = false, ...props }) {
      return h('button', { type: 'button', className: cx('dsh-wb-button dsh-todos-focusable', primary && 'dsh-wb-primary'), ...props }, children);
    }
    function WBField({ label, hint, children, wide = false }) {
      // Options and help text stay visible without becoming part of the
      // control's accessible name. Custom controls forward this to their input.
      const control = React.isValidElement(children) ? React.cloneElement(children, { 'aria-label': label }) : children;
      return h('label', { className: cx('dsh-wb-field', wide && 'dsh-wb-wide') },
        h('span', { className: 'dsh-wb-label' }, label), control,
        hint ? h('span', { className: 'dsh-wb-hint' }, hint) : null);
    }
    function WBEmpty({ children }) { return h('p', { className: 'dsh-wb-empty' }, children); }
    // The nav remounts between Today, Tasks and the workbench; remember where the
    // pill last sat so it can still travel to the new view.
    let wbNavLast = null;
    function WorkbenchNav({ t, active, onSelect, state }) {
      const pending = wbList(state.documents).filter((item) => item.status !== 'final').length;
      const ref = useRef(null);
      React.useLayoutEffect(() => {
        const nav = ref.current;
        const measure = () => {
          const button = nav?.querySelector('[aria-current="page"]');
          return button ? { x: button.offsetLeft, y: button.offsetTop, w: button.offsetWidth, h: button.offsetHeight } : null;
        };
        const place = (box, instant) => {
          if (instant) nav.dataset.navInstant = ''; else delete nav.dataset.navInstant;
          for (const [key, value] of Object.entries(box)) nav.style.setProperty(`--nav-${key}`, `${value}px`);
        };
        const next = measure();
        if (!next) return undefined;
        const fresh = !('navReady' in nav.dataset);
        if (fresh && wbNavLast) { place(wbNavLast, true); void nav.offsetWidth; }
        place(next, fresh && !wbNavLast);
        nav.dataset.navReady = '';
        wbNavLast = next;
        const same = (a, b) => a && b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
        const observer = new ResizeObserver(() => {
          const box = measure();
          if (box && !same(box, wbNavLast)) { place(box, true); wbNavLast = box; }
        });
        observer.observe(nav);
        return () => observer.disconnect();
      }, [active]);
      return h('nav', { ref, className: 'dsh-wb-nav', 'aria-label': wb(t, 'nav') },
        h('span', { className: 'dsh-wb-navIndicator', 'aria-hidden': true }),
        ...['today', 'tasks', 'projects', 'planning', 'review'].map((key) => h('button', {
          key, type: 'button', className: 'dsh-wb-navButton dsh-todos-focusable',
          'aria-current': active === key ? 'page' : undefined, onClick: () => onSelect(key),
        }, wb(t, key), key === 'review' && pending > 0 ? h('span', { className: 'dsh-wb-count' }, pending) : null)));
    }

    function WBProjectSelect({ t, state, value, onChange, all = false, disabled = false, ...inputProps }) {
      return h('select', { className: 'dsh-todos-input', value: value ?? '', onChange: (event) => onChange(event.target.value), disabled, ...inputProps },
        h('option', { value: '' }, wb(t, all ? 'allProjects' : 'unassigned')),
        ...wbList(state.projects).map((project) => h('option', { key: project.id, value: project.id },
          `${project.name}${project.status === 'archived' ? ` · ${wb(t, 'archived')}` : ''}`)));
    }
    function WBProjectScope({ t, state, value, onChange, disabled = false }) {
      return h('fieldset', { className: 'dsh-wb-scope', disabled },
        h('legend', null, wb(t, 'scope')),
        h('p', { className: 'dsh-wb-hint' }, wb(t, 'scopeHint')),
        h('div', { className: 'dsh-wb-checks' },
          h('label', { className: 'dsh-wb-checkLabel' }, h('input', { type: 'checkbox', checked: value.length === 0, onChange: () => onChange([]) }), wb(t, 'allProjects')),
          ...wbList(state.projects).map((project) => h('label', { key: project.id, className: 'dsh-wb-checkLabel' },
            h('input', { type: 'checkbox', checked: value.includes(project.id), onChange: (event) =>
              onChange(event.target.checked ? [...value, project.id] : value.filter((id) => id !== project.id)) }), project.name))));
    }

    function WorkbenchLogForm({ t, state, mutate, busy, taskId = null, projectId = null, compact = false }) {
      const [text, setText] = useState('');
      const [kind, setKind] = useState('progress');
      const [task, setTask] = useState(taskId ?? '');
      const [project, setProject] = useState(projectId ?? '');
      const [minutes, setMinutes] = useState('');
      const [url, setUrl] = useState('');
      const [time, setTime] = useState('');
      const [saved, setSaved] = useState(false);
      const [warning, setWarning] = useState(null);
      useEffect(() => { setTask(taskId ?? ''); setProject(projectId ?? ''); }, [taskId, projectId]);
      const submit = async (event) => {
        event.preventDefault();
        if (!text.trim() || busy) return;
        const occurredAt = time ? wbWallTime(time, state.settings?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone) : null;
        if (time && !Number.isFinite(occurredAt)) { setWarning(wb(t, 'dateInvalid')); return; }
        const sent = text;
        const result = await mutate({ op: 'log.add', taskId: task || null, ...(!task ? { projectId: project || null } : {}), kind, text: sent,
          ...(minutes !== '' ? { minutes: Number(minutes) } : {}), ...(url.trim() ? { url: url.trim() } : {}),
          ...(time ? { time: occurredAt } : {}) });
        if (result) { setText((current) => current === sent ? '' : current); setMinutes(''); setUrl(''); setTime(''); setSaved(true); setWarning(result.data?.warnings?.length ? wb(t, 'overlapWarning') : null); }
      };
      const choices = wbList(state.items).filter((item) => !project || item.projectId === project || item.id === taskId);
      return h('form', { className: cx('dsh-wb-form', compact && 'dsh-wb-compact'), onSubmit: submit },
        h('div', { className: 'dsh-wb-formGrid' },
          !taskId ? h(WBField, { label: wb(t, 'project') }, h(WBProjectSelect, { t, state, value: project, onChange: (value) => { setProject(value); setTask(''); }, disabled: busy })) : null,
          !taskId ? h(WBField, { label: wb(t, 'task') }, h('select', { className: 'dsh-todos-input', value: task, onChange: (event) => setTask(event.target.value), disabled: busy },
            h('option', { value: '' }, wb(t, 'noTask')), ...choices.map((item) => h('option', { key: item.id, value: item.id }, item.title)))) : null,
          h(WBField, { label: wb(t, 'logKind') }, h('select', { className: 'dsh-todos-input', value: kind, onChange: (event) => setKind(event.target.value), disabled: busy },
            ...WB_LOG_KINDS.map((value) => h('option', { key: value, value }, wb(t, `log.${value}`))))),
          h(WBField, { label: `${wb(t, 'logTime')} · ${state.settings?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone}` }, h('input', { className: 'dsh-todos-input', type: 'datetime-local', value: time, onChange: (event) => setTime(event.target.value), disabled: busy })),
          h(WBField, { label: wb(t, 'logText'), wide: true }, h('textarea', { className: 'dsh-todos-input dsh-wb-textarea', value: text,
            placeholder: wb(t, 'logPlaceholder'), maxLength: 8000, rows: 3, required: true, onChange: (event) => { setText(event.target.value); setSaved(false); } })),
          h(WBField, { label: wb(t, 'logUrl') }, h('input', { className: 'dsh-todos-input', type: 'url', value: url, placeholder: 'https://', onChange: (event) => setUrl(event.target.value) })),
          h(WBField, { label: wb(t, 'logMinutes') }, h('input', { className: 'dsh-todos-input', type: 'number', min: 0, max: 1440, value: minutes, onChange: (event) => setMinutes(event.target.value) }))),
        warning ? h('p', { className: 'dsh-wb-warning', role: 'status' }, warning) : null,
        h('div', { className: 'dsh-wb-actions' }, saved ? h('span', { role: 'status', className: 'dsh-wb-hint' }, wb(t, 'saved')) : null,
          h(WBButton, { type: 'submit', primary: true, disabled: busy || !text.trim() }, wb(t, busy ? 'saving' : 'record'))));
    }

    function WorkbenchTaskFields({ t, item, state, mutate, busy }) {
      const values = (task) => ({ projectId: task.projectId ?? '', status: task.status ?? (task.done ? 'done' : 'todo'), dueDate: task.dueDate ?? '',
        plannedDate: task.plannedDate ?? '', estimateMinutes: task.estimateMinutes ?? '', description: task.description ?? '',
        waitingFor: task.waitingFor ?? '', followUpDate: task.followUpDate ?? '' });
      const [fields, setFields] = useState(() => values(item));
      const [dirty, setDirty] = useState(false);
      const [saved, setSaved] = useState(false);
      useEffect(() => { if (!dirty) setFields(values(item)); }, [item.updatedAt, item.id, dirty]);
      const change = (key) => (event) => { setFields((current) => ({ ...current, [key]: event.target.value })); setDirty(true); setSaved(false); };
      const save = async (event) => {
        event.preventDefault();
        const result = await mutate({ op: 'update', id: item.id, ...fields, projectId: fields.projectId || null,
          dueDate: fields.dueDate || null, plannedDate: fields.plannedDate || null, followUpDate: fields.followUpDate || null,
          estimateMinutes: fields.estimateMinutes === '' ? null : Number(fields.estimateMinutes) });
        if (result) { setDirty(false); setSaved(true); }
      };
      return h('div', { className: 'dsh-wb-taskFields' },
        h('form', { className: 'dsh-wb-form', onSubmit: save },
          h('div', { className: 'dsh-wb-formGrid' },
            h(WBField, { label: wb(t, 'project') }, h(WBProjectSelect, { t, state, value: fields.projectId,
              onChange: (value) => { setFields((current) => ({ ...current, projectId: value })); setDirty(true); }, disabled: busy })),
            h(WBField, { label: wb(t, 'status') }, h('select', { className: 'dsh-todos-input', value: fields.status, onChange: change('status'), disabled: busy },
              ...WB_STATUSES.map((status) => h('option', { key: status, value: status }, wb(t, `status.${status}`))))),
            h(WBField, { label: wb(t, 'dueDate') }, h('input', { className: 'dsh-todos-input', type: 'date', value: fields.dueDate, onChange: change('dueDate') })),
            h(WBField, { label: wb(t, 'plannedDate') }, h('input', { className: 'dsh-todos-input', type: 'date', value: fields.plannedDate, onChange: change('plannedDate') })),
            h(WBField, { label: wb(t, 'estimate') }, h('input', { className: 'dsh-todos-input', type: 'number', min: 0, max: 100000, value: fields.estimateMinutes, onChange: change('estimateMinutes') })),
            fields.status === 'waiting' ? h(WBField, { label: wb(t, 'waitingFor') }, h('input', { className: 'dsh-todos-input', value: fields.waitingFor, onChange: change('waitingFor') })) : null,
            fields.status === 'waiting' ? h(WBField, { label: wb(t, 'followUpDate') }, h('input', { className: 'dsh-todos-input', type: 'date', value: fields.followUpDate, onChange: change('followUpDate') })) : null,
            h(WBField, { label: wb(t, 'nextAction'), wide: true }, h('textarea', { className: 'dsh-todos-input dsh-wb-textarea', rows: 2, maxLength: 8000,
              value: fields.description, onChange: change('description') }))),
          h('div', { className: 'dsh-wb-actions' }, saved ? h('span', { role: 'status', className: 'dsh-wb-hint' }, wb(t, 'taskSaved')) : null,
            h(WBButton, { type: 'submit', disabled: busy || !dirty, primary: true }, wb(t, 'detailsSave')))),
        h('details', { className: 'dsh-wb-disclosure' }, h('summary', null, wb(t, 'log')),
          h(WorkbenchLogForm, { t, state, mutate, busy, taskId: item.id, projectId: item.projectId, compact: true })));
    }

    /** One project at a glance: how far along, what is late, how long it has been quiet, what to do next. */
    function WBProjectCard({ t, project, health, pressed, onClick }) {
      const archived = project.status === 'archived';
      const total = health ? health.open + health.done : 0;
      const idle = health?.idleDays;
      const quiet = idle === null || idle === undefined ? wb(t, 'noActivity')
        : idle === 0 ? wb(t, 'activeToday') : wb(t, 'idleDays', { days: idle });
      return h('button', { type: 'button', className: cx('dsh-wb-projectCard dsh-todos-focusable', health?.stalled && 'is-stalled'), 'aria-pressed': pressed, onClick },
        h('span', { className: 'dsh-wb-projectTitle' }, h('strong', null, project.name),
          archived ? h('span', { className: 'dsh-wb-badge' }, wb(t, 'archived')) : null,
          health?.overdue ? h('span', { className: 'dsh-wb-badge is-error' }, wb(t, 'overdueCount', { count: health.overdue })) : null,
          health?.stalled ? h('span', { className: 'dsh-wb-badge is-warn' }, quiet) : null),
        project.goal ? h('span', { className: 'dsh-wb-projectGoal' }, project.goal) : null,
        health && total > 0 ? h('span', { className: 'dsh-wb-progress' },
          h('span', { className: 'dsh-wb-progressTrack', 'aria-hidden': true }, h('span', { style: { width: `${Math.round(health.progress * 100)}%` } })),
          h('span', { className: 'dsh-wb-progressText' }, wb(t, 'progressText', { done: health.done, total, percent: Math.round(health.progress * 100) }),
            health.stalled || archived ? null : ` · ${quiet}`)) : null,
        health && !archived ? h('small', { className: 'dsh-wb-projectMeta' },
          health.next ? h('span', { className: cx(health.next.overdue && 'is-error') }, wb(t, 'nextTask'), health.next.title)
            : [wb(t, 'noOpenTasks'), health.stalled ? null : ` · ${quiet}`]) : null);
    }

    function WorkbenchProjects({ t, state, mutate, busy, onProjectTasks, onProjectReview }) {
      const projects = wbList(state.projects);
      const [selected, setSelected] = useState('');
      const [editing, setEditing] = useState(null);
      const [draft, setDraft] = useState({ name: '', goal: '', status: 'active' });
      const [tag, setTag] = useState('');
      const [assigned, setAssigned] = useState(null);
      const selectedProject = projects.find((project) => project.id === selected);
      const projectTasks = wbList(state.items).filter((item) => !selected || item.projectId === selected);
      const logs = wbList(state.logs).filter((log) => !selected || log.projectId === selected);
      const tags = [...new Set(wbList(state.items).flatMap((item) => item.tags ?? []))].sort();
      // Projects needing attention first: overdue, then stalled, then longest idle.
      const health = useMemo(() => sceneData('projectHealth', { projects, items: state.items, logs: state.logs, today: state.todayDate }, null),
        [state.projects, state.items, state.logs, state.todayDate]);
      const byId = new Map(projects.map((project) => [project.id, project]));
      const ordered = health ? health.map((entry) => byId.get(entry.id)).filter(Boolean) : projects;
      const healthOf = new Map((health ?? []).map((entry) => [entry.id, entry]));
      const pick = (id) => { setSelected(id); setAssigned(null); };
      const begin = (project) => {
        setEditing(project?.id ?? 'new'); setDraft({ name: project?.name ?? '', goal: project?.goal ?? '', status: project?.status ?? 'active' });
      };
      const save = async (event) => {
        event.preventDefault();
        const result = await mutate({ op: 'project.save', ...(editing !== 'new' ? { id: editing } : {}), ...draft });
        if (result) {
          const project = result.data?.project ?? result.projects?.find((entry) => entry.id === editing) ?? result.projects?.find((entry) => entry.name === draft.name);
          if (project?.id) setSelected(project.id);
          setEditing(null);
        }
      };
      const assign = async () => {
        let count = 0;
        for (const item of wbList(state.items).filter((entry) => !entry.projectId && entry.tags?.includes(tag))) {
          const result = await mutate({ op: 'update', id: item.id, projectId: selected });
          if (!result) break;
          count += 1;
        }
        setAssigned(count);
      };
      return h('div', { className: 'dsh-wb-stack' },
        h('div', { className: 'dsh-wb-sectionHead' }, h(WBButton, { primary: true, onClick: () => begin(null), disabled: busy }, wb(t, 'newProject'))),
        editing ? h('form', { className: 'dsh-wb-card dsh-wb-form', onSubmit: save },
          h('h2', null, wb(t, editing === 'new' ? 'newProject' : 'editProject')),
          h('div', { className: 'dsh-wb-formGrid' },
            h(WBField, { label: wb(t, 'projectName') }, h('input', { className: 'dsh-todos-input', value: draft.name, maxLength: 120, required: true,
              onChange: (event) => setDraft({ ...draft, name: event.target.value }) })),
            h(WBField, { label: wb(t, 'status') }, h('select', { className: 'dsh-todos-input', value: draft.status, onChange: (event) => setDraft({ ...draft, status: event.target.value }) },
              h('option', { value: 'active' }, wb(t, 'active')), h('option', { value: 'archived' }, wb(t, 'archived')))),
            h(WBField, { label: wb(t, 'projectGoal'), wide: true }, h('textarea', { className: 'dsh-todos-input dsh-wb-textarea', value: draft.goal, rows: 3, maxLength: 8000,
              onChange: (event) => setDraft({ ...draft, goal: event.target.value }) }))),
          h('div', { className: 'dsh-wb-actions' }, h(WBButton, { onClick: () => setEditing(null) }, wb(t, 'cancel')),
            h(WBButton, { type: 'submit', primary: true, disabled: busy || !draft.name.trim() }, wb(t, 'save')))) : null,
        projects.length === 0 ? h(WBEmpty, null, wb(t, 'noProjects')) : h('div', { className: 'dsh-wb-projectGrid' },
          h('button', { type: 'button', className: 'dsh-wb-projectCard dsh-todos-focusable', 'aria-pressed': selected === '', onClick: () => setSelected('') },
            h('strong', null, wb(t, 'allProjects')), h('span', null, wb(t, 'selectedTasks', { count: state.items.length }))),
          ...ordered.map((project) => h(WBProjectCard, { key: project.id, t, project, health: healthOf.get(project.id), pressed: selected === project.id,
            onClick: () => pick(project.id) }))),
        selectedProject ? h('section', { className: 'dsh-wb-card' },
          h('div', { className: 'dsh-wb-sectionHead' }, h('h2', null, selectedProject.name), h(WBButton, { onClick: () => begin(selectedProject), disabled: busy }, wb(t, 'edit'))),
          h('p', { className: 'dsh-wb-prose' }, selectedProject.goal || wb(t, 'projectGoal')),
          h('div', { className: 'dsh-wb-actions' }, h(WBButton, { onClick: () => onProjectTasks(selected) }, wb(t, 'projectTasks')),
            h(WBButton, { onClick: () => onProjectReview(selected), primary: true }, wb(t, 'projectReports'))),
          tags.length ? h('details', { className: 'dsh-wb-disclosure' }, h('summary', null, wb(t, 'promoteTag')),
            h('p', { className: 'dsh-wb-hint' }, wb(t, 'assignTagHint')),
            h('div', { className: 'dsh-wb-inline' }, h('select', { className: 'dsh-todos-input', value: tag, 'aria-label': wb(t, 'sourceTag'), onChange: (event) => setTag(event.target.value) },
              h('option', { value: '' }, wb(t, 'sourceTag')), ...tags.map((entry) => h('option', { key: entry, value: entry }, entry))),
              h(WBButton, { onClick: () => void assign(), disabled: busy || !tag }, wb(t, 'assignTag'))),
            assigned !== null ? h('p', { role: 'status' }, wb(t, 'tagAssigned', { count: assigned })) : null) : null) : null,
        h('section', { className: 'dsh-wb-card' }, h('h2', null, wb(t, 'log')), h(WorkbenchLogForm, { t, state, mutate, busy, projectId: selected || null })),
        h('section', { className: 'dsh-wb-card' }, h('div', { className: 'dsh-wb-sectionHead' }, h('h2', null, wb(t, 'records')), h('span', { className: 'dsh-wb-hint' }, wb(t, 'logsRecent'))),
          logs.length === 0 ? h(WBEmpty, null, wb(t, 'noRecords')) : h('ul', { className: 'dsh-wb-timeline' },
            ...logs.slice(0, 40).map((log) => h('li', { key: log.id },
              h('div', { className: 'dsh-wb-meta' }, h('span', { className: 'dsh-wb-badge' }, wb(t, `log.${log.kind}`)), wbProjectName(state, log.projectId, t), wbFormatTime(log.at ?? log.createdAt, state, t)),
              h('p', { className: 'dsh-wb-prose' }, log.text), log.taskId ? h('span', { className: 'dsh-wb-hint' }, log.taskTitle || wbTaskName(state, log.taskId, t)) : null,
              log.url && /^https?:\/\//i.test(log.url) ? h('a', { href: log.url, target: '_blank', rel: 'noreferrer', className: 'dsh-wb-link' }, log.url) : null,
              log.minutes ? h('span', { className: 'dsh-wb-hint' }, wb(t, 'minutes', { value: log.minutes })) : null)))),
        h('section', { className: 'dsh-wb-card' }, h('h2', null, wb(t, 'projectTasks')),
          projectTasks.length === 0 ? h(WBEmpty, null, wb(t, 'noTasks')) : h('ul', { className: 'dsh-wb-plainList' },
            ...projectTasks.slice(0, 30).map((item) => h('li', { key: item.id }, h('span', null, item.title), h('span', { className: 'dsh-wb-badge' }, wb(t, `status.${item.status ?? (item.done ? 'done' : 'todo')}`)))))));
    }

    function WorkbenchSettings({ t, state, mutate, busy }) {
      const [values, setValues] = useState(() => ({ timezone: state.settings?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
        weekStartsOn: state.settings?.weekStartsOn ?? 1, capacityMinutes: state.settings?.capacityMinutes ?? 360, bufferPercent: state.settings?.bufferPercent ?? 30 }));
      const [saved, setSaved] = useState(false);
      const change = (key) => (event) => { setSaved(false); setValues({ ...values, [key]: event.target.value }); };
      return h('details', { className: 'dsh-wb-card dsh-wb-disclosure' }, h('summary', null, wb(t, 'settings')),
        h('p', { className: 'dsh-wb-hint' }, wb(t, 'settingsHint')),
        h('form', { className: 'dsh-wb-form', onSubmit: async (event) => { event.preventDefault();
          const result = await mutate({ op: 'settings.update', ...values, weekStartsOn: Number(values.weekStartsOn),
            capacityMinutes: Number(values.capacityMinutes), bufferPercent: Number(values.bufferPercent) }); if (result) setSaved(true); } },
          h('div', { className: 'dsh-wb-formGrid' },
            h(WBField, { label: wb(t, 'timezone') }, h('input', { className: 'dsh-todos-input', value: values.timezone, onChange: change('timezone'), required: true, placeholder: 'Asia/Singapore' })),
            h(WBField, { label: wb(t, 'weekStartsOn') }, h('select', { className: 'dsh-todos-input', value: values.weekStartsOn, onChange: change('weekStartsOn') },
              h('option', { value: 1 }, wb(t, 'monday')), h('option', { value: 0 }, wb(t, 'sunday')))),
            h(WBField, { label: wb(t, 'capacity') }, h('input', { className: 'dsh-todos-input', type: 'number', min: 0, max: 1440, required: true, value: values.capacityMinutes, onChange: change('capacityMinutes') })),
            h(WBField, { label: wb(t, 'buffer') }, h('input', { className: 'dsh-todos-input', type: 'number', min: 0, max: 90, required: true, value: values.bufferPercent, onChange: change('bufferPercent') }))),
          h('div', { className: 'dsh-wb-actions' }, saved ? h('span', { role: 'status' }, wb(t, 'saved')) : null,
            h(WBButton, { type: 'submit', disabled: busy, primary: true }, wb(t, 'save')))));
    }

    function WorkbenchPlanning({ t, state, mutate, busy, motion }) {
      const [period, setPeriod] = useState('day');
      const [date, setDate] = useState(state.todayDate || localDateKey());
      const [title, setTitle] = useState('');
      const [taskIds, setTaskIds] = useState([]);
      const [capacity, setCapacity] = useState(state.settings?.capacityMinutes ?? 360);
      const [buffer, setBuffer] = useState(state.settings?.bufferPercent ?? 30);
      const [dirty, setDirty] = useState(false);
      const [saved, setSaved] = useState(false);
      const existing = wbList(state.plans).find((plan) => plan.period === period && plan.date === date);
      useEffect(() => {
        if (dirty) return;
        setTitle(existing?.title ?? '');
        setTaskIds(existing?.taskIds ?? (period === 'day' ? state.items.filter((item) => item.todayDate === date && !item.done).map((item) => item.id) : []));
        setCapacity(existing?.capacityMinutes ?? (state.settings?.capacityMinutes ?? 360) * (period === 'week' ? 5 : 1));
        setBuffer(existing?.bufferPercent ?? state.settings?.bufferPercent ?? 30);
      }, [existing?.id, existing?.updatedAt, date, period, dirty]);
      const available = Math.round(Number(capacity || 0) * (1 - Number(buffer || 0) / 100));
      const selected = state.items.filter((item) => taskIds.includes(item.id));
      const estimated = selected.reduce((sum, item) => sum + Number(item.estimateMinutes ?? 0), 0);
      const unknown = selected.filter((item) => item.estimateMinutes === null || item.estimateMinutes === undefined).length;
      const choices = state.items.filter((item) => (!item.done && item.status !== 'cancelled') || taskIds.includes(item.id));
      const stale = state.items.filter((item) => !item.done && item.status !== 'cancelled' && item.todayDate && item.todayDate < state.todayDate);
      const suggestions = Array.isArray(state.insights) ? state.insights : wbList(state.insights?.suggestions);
      const [barHover, setBarHover] = useState(null);
      // In the order you picked them, so the tasks added last are the ones flagged as over.
      const bar = useMemo(() => sceneData('capacitySegments', { capacityMinutes: capacity, bufferPercent: buffer,
        tasks: taskIds.map((id) => state.items.find((item) => item.id === id)).filter(Boolean) }, null),
      [taskIds.join(','), capacity, buffer, state.items]);
      const over = new Set((bar?.segments ?? []).filter((segment) => segment.zone !== 'planned').map((segment) => segment.id));
      const shownPlanned = useTweenedNumber(estimated, motion);
      const hovered = bar?.segments.find((segment) => segment.id === barHover);
      const dropOver = () => { setTaskIds(taskIds.filter((id) => !over.has(id))); setDirty(true); setSaved(false); };
      const save = async (event) => {
        event.preventDefault();
        const result = await mutate({ op: 'plan.save', ...(existing ? { id: existing.id } : {}), period, date, title, taskIds,
          capacityMinutes: Number(capacity), bufferPercent: Number(buffer), commit: true });
        if (result) { setDirty(false); setSaved(true); }
      };
      return h('div', { className: 'dsh-wb-stack' },
        h('section', { className: 'dsh-wb-card' }, h('div', { className: 'dsh-wb-sectionHead' }, h('h2', null, wb(t, period === 'day' ? 'dailyPlan' : 'weeklyPlan')),
          h('div', { className: 'dsh-todos-viewSwitch' }, ...['day', 'week'].map((value) => h('button', { key: value, type: 'button', className: 'dsh-todos-viewButton dsh-todos-focusable',
            'aria-pressed': period === value, onClick: () => { setPeriod(value); setDirty(false); setSaved(false); } }, wb(t, value === 'day' ? 'dailyPlan' : 'weeklyPlan'))))),
          h('form', { className: 'dsh-wb-form', onSubmit: save },
            h('div', { className: 'dsh-wb-formGrid' },
              h(WBField, { label: wb(t, 'planDate') }, h('input', { className: 'dsh-todos-input', type: 'date', value: date, required: true,
                onChange: (event) => { setDate(event.target.value); setDirty(false); setSaved(false); } })),
              h(WBField, { label: wb(t, 'capacity'), hint: period === 'week' ? wb(t, 'weeklyCapacityHint') : null }, h('input', { className: 'dsh-todos-input', type: 'number', min: 0, max: 10080, required: true,
                value: capacity, onChange: (event) => { setCapacity(event.target.value); setDirty(true); setSaved(false); } })),
              h(WBField, { label: wb(t, 'buffer') }, h('input', { className: 'dsh-todos-input', type: 'number', min: 0, max: 90, required: true,
                value: buffer, onChange: (event) => { setBuffer(event.target.value); setDirty(true); setSaved(false); } })),
              h(WBField, { label: wb(t, 'planGoal'), wide: true }, h('textarea', { className: 'dsh-todos-input dsh-wb-textarea', rows: 3, maxLength: 8000,
                placeholder: wb(t, 'planGoalHint'), value: title, onChange: (event) => { setTitle(event.target.value); setDirty(true); setSaved(false); } }))),
            h('div', { className: cx('dsh-wb-capacity dsh-wb-capacityPlan', estimated > available && 'dsh-wb-warning') },
              h('div', { className: 'dsh-wb-capacityHead' },
                h('strong', null, wb(t, 'planned', { value: shownPlanned })), h('span', null, wb(t, 'usable', { value: available })),
                unknown > 0 ? h('span', null, wb(t, 'unestimated', { count: unknown })) : null),
              bar ? h('div', { className: 'dsh-wb-bar', 'aria-hidden': true },
                ...bar.segments.map((segment) => h('span', { key: segment.id,
                  className: cx('dsh-wb-barSegment', `is-${segment.zone}`, barHover === segment.id && 'is-linked'),
                  style: { left: `${segment.start * 100}%`, width: `${(segment.end - segment.start) * 100}%` },
                  onMouseEnter: () => setBarHover(segment.id), onMouseLeave: () => setBarHover(null) })),
                h('i', { className: 'dsh-wb-barMark', style: { left: `${bar.usableAt * 100}%` } }),
                bar.capacityAt < 1 ? h('i', { className: 'dsh-wb-barMark is-capacity', style: { left: `${bar.capacityAt * 100}%` } }) : null) : null,
              // Always present so hovering never shifts the task list under the pointer.
              bar ? h('p', { className: 'dsh-wb-barReadout', 'aria-hidden': true }, hovered
                ? [hovered.title, ' · ', wb(t, 'minutes', { value: hovered.minutes }), hovered.zone === 'planned' ? null : ` · ${wb(t, 'overTag')}`]
                : wb(t, 'barLegend')) : null,
              estimated > available ? h('div', { className: 'dsh-wb-overload' },
                h('p', { role: 'status' }, wb(t, 'overloaded')),
                over.size ? h(WBButton, { onClick: dropOver }, wb(t, 'dropOver', { count: over.size })) : null) : null),
            h('fieldset', { className: 'dsh-wb-scope' }, h('legend', null, wb(t, 'chooseTasks')), h('p', { className: 'dsh-wb-hint' }, wb(t, 'selectHint')),
              choices.length === 0 ? h(WBEmpty, null, wb(t, 'noTasks')) : h('div', { className: 'dsh-wb-taskChoices' },
                ...choices.map((item) => h('label', { key: item.id, className: cx('dsh-wb-taskChoice', barHover === item.id && 'is-linked'),
                  onMouseEnter: () => setBarHover(item.id), onMouseLeave: () => setBarHover(null) },
                  h('input', { type: 'checkbox', checked: taskIds.includes(item.id), onChange: (event) => {
                    setTaskIds(event.target.checked ? [...taskIds, item.id] : taskIds.filter((id) => id !== item.id)); setDirty(true); setSaved(false);
                  } }), h('span', null, item.title, h('small', null, wbProjectName(state, item.projectId, t), item.quadrant ? ` · ${item.quadrant.toUpperCase()}` : '')),
                  h('span', { className: 'dsh-wb-hint' }, over.has(item.id) ? h('span', { className: 'dsh-wb-badge is-warn' }, wb(t, 'overTag')) : null,
                    item.estimateMinutes == null ? wb(t, 'unknown') : wb(t, 'minutes', { value: item.estimateMinutes })))))),
            existing?.committedAt ? h('p', { className: 'dsh-wb-hint' }, wb(t, 'confirmed'), ' · ', wbFormatTime(existing.committedAt, state, t), ' · ',
              wb(t, 'baselineCount', { count: (existing.baselineTaskIds ?? []).length }), ' — ', wb(t, 'planBaseline')) : null,
            h('div', { className: 'dsh-wb-actions' }, saved ? h('span', { role: 'status' }, wb(t, 'saved')) : null,
              h(WBButton, { type: 'submit', primary: true, disabled: busy || !date }, wb(t, existing?.committedAt ? 'updatePlan' : 'commitPlan'))))),
        h('section', { className: 'dsh-wb-card' }, h('h2', null, wb(t, 'reschedule')),
          stale.length ? h('ul', { className: 'dsh-wb-plainList' }, ...stale.slice(0, 20).map((item) => h('li', { key: item.id }, h('span', null, item.title),
            h(WBButton, { disabled: busy, onClick: () => void mutate({ op: 'update', id: item.id, today: true }) }, t('row.todayAdd'))))) : h(WBEmpty, null, wb(t, 'noReschedule'))),
        h('section', { className: 'dsh-wb-card' }, h('h2', null, wb(t, 'suggestions')),
          suggestions.length ? h('ul', { className: 'dsh-wb-timeline' }, ...suggestions.map((item, index) => h('li', { key: item.id ?? index },
            h('p', null, wbInsightText(t, item, state)),
            item.taskIds?.length ? h('small', null, item.taskIds.map((id) => wbTaskName(state, id, t)).join(' · ')) : null))) : h(WBEmpty, null, wb(t, 'noSuggestions'))),
        h('section', { className: 'dsh-wb-card' }, h('h2', null, wb(t, 'planHistory')),
          wbList(state.plans).length ? h('ul', { className: 'dsh-wb-plainList' }, ...wbList(state.plans).slice(0, 20).map((plan) => h('li', { key: plan.id },
            h('span', null, plan.date, ' · ', wb(t, plan.period === 'week' ? 'weeklyPlan' : 'dailyPlan'), h('small', null, plan.title)),
            h(WBButton, { onClick: () => { setPeriod(plan.period); setDate(plan.date); setDirty(false); } }, wb(t, 'edit'))))) : h(WBEmpty, null, wb(t, 'noPlan'))),
        h('section', { className: 'dsh-wb-card' }, h('h2', null, wb(t, 'focusHistory')), h('p', { className: 'dsh-wb-hint' }, wb(t, 'focusHint')),
          wbList(state.focusSessions).length ? h('ul', { className: 'dsh-wb-plainList' }, ...wbList(state.focusSessions).slice(0, 20).map((session) => h('li', { key: session.id },
            h('span', null, session.taskTitle ?? wbTaskName(state, session.taskId, t), h('small', null, wbFormatTime(session.startedAt, state, t))),
            h('span', null, wb(t, 'minutes', { value: session.minutes ?? Math.round((session.durationMs ?? 0) / 60000) }))))) : h(WBEmpty, null, wb(t, 'noRecords'))),
        h(WorkbenchSettings, { t, state, mutate, busy }));
    }

    function WorkbenchTodaySummary({ t, state, onNavigate, mutate, busy }) {
      const plan = wbList(state.plans).find((item) => item.period === 'day' && item.date === state.todayDate);
      const today = state.items.filter((item) => item.todayDate === state.todayDate && !item.done && item.status !== 'cancelled');
      const capacity = Math.round((plan?.capacityMinutes ?? state.settings?.capacityMinutes ?? 360) * (1 - (plan?.bufferPercent ?? state.settings?.bufferPercent ?? 30) / 100));
      const estimate = today.reduce((total, item) => total + (item.estimateMinutes ?? 0), 0);
      const unknown = today.filter((item) => item.estimateMinutes == null).length;
      const stale = state.items.filter((item) => !item.done && item.status !== 'cancelled' && item.todayDate && item.todayDate < state.todayDate);
      return h('section', { className: 'dsh-wb-todaySummary', 'aria-label': wb(t, 'todayCapacity') },
        h('div', { className: cx('dsh-wb-capacity', estimate > capacity && 'dsh-wb-warning') },
          h('strong', null, `${estimate} / ${capacity} min`), h('span', null, wb(t, 'todayCapacity')),
          unknown ? h('span', null, wb(t, 'unestimated', { count: unknown })) : null),
        plan?.title ? h('p', { className: 'dsh-wb-prose' }, plan.title) : h('p', { className: 'dsh-wb-hint' }, wb(t, 'noConfirmedPlan')),
        h('div', { className: 'dsh-wb-actions' }, h(WBButton, { onClick: () => onNavigate('planning') }, wb(t, 'todayPlan')),
          h(WBButton, { onClick: () => onNavigate('review', { type: 'review', kind: 'daily', startDate: state.todayDate, endDate: wbDateShift(state.todayDate, 1) }) }, wb(t, 'todayReview'))),
        stale.length ? h('details', { className: 'dsh-wb-disclosure' }, h('summary', null, `${wb(t, 'reschedule')} · ${stale.length}`),
          h('ul', { className: 'dsh-wb-plainList' }, ...stale.slice(0, 5).map((item) => h('li', { key: item.id }, h('span', null, item.title),
            h(WBButton, { disabled: busy, onClick: () => void mutate({ op: 'update', id: item.id, today: true }) }, t('row.todayAdd')))))) : null);
    }
