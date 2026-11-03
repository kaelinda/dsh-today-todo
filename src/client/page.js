    /**
     * Sidebar entry glyph. The sidebar owns the button, its label, and its active
     * state; this component only renders the decorative mark at the requested edge.
     * @param props - `{ size }` from the panel row.
     */
    function TodoIcon({ size }) {
      const edge = typeof size === 'number' && size > 0 ? size : 16;
      return h('svg', {
        width: edge,
        height: edge,
        viewBox: '0 0 16 16',
        fill: 'none',
        'aria-hidden': true,
        style: { display: 'block' },
      },
      h('rect', {
        x: 2.2, y: 2.2, width: 11.6, height: 11.6, rx: 3.4,
        stroke: 'currentColor', strokeWidth: 1.3, opacity: 0.85,
      }),
      h('path', {
        d: 'M4.6 6.4l1.1 1.1 2-2.2M4.6 10.4l1.1 1.1 2-2.2M9.4 6.8h2.4M9.4 10.8h2.4',
        stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round', strokeLinejoin: 'round',
      }));
    }

    /**
     * The todo panel: add field, scope tabs, priority statistics/filter, tag
     * filter, a list or four-quadrant matrix, and a per-row detail editor that
     * carries tags, priority, quadrant, today and the linked Session.
     * @param props - slot props: `t`, `useSessions`, `useWorkspaces`, `openSession`.
     */
    function TodoPage(props) {
      const t = typeof props.t === 'function' ? props.t : identity;
      const readSessions = typeof props.useSessions === 'function' ? props.useSessions : () => EMPTY_SESSIONS;
      const readWorkspaces = typeof props.useWorkspaces === 'function' ? props.useWorkspaces : () => EMPTY_WORKSPACES;
      const openSession = typeof props.openSession === 'function' ? props.openSession : null;
      const sessions = readSessions((snapshot) => snapshot) ?? EMPTY_SESSIONS;
      const workspaces = readWorkspaces((snapshot) => snapshot) ?? EMPTY_WORKSPACES;

      const [state, setState] = useState({ phase: 'loading', items: [], revision: 0, todayDate: null, error: null });
      const [notice, setNotice] = useState(null);
      const [scope, setScope] = useState('all');
      const [priorityFilter, setPriorityFilter] = useState('all');
      const [tagFilter, setTagFilter] = useState('');
      const [view, setView] = useState('list');
      const [draft, setDraft] = useState('');
      const [busy, setBusy] = useState(false);
      const [pickerFor, setPickerFor] = useState(null);
      const [pickerQuery, setPickerQuery] = useState('');
      const [editing, setEditing] = useState(null);
      const [expandedId, setExpandedId] = useState(null);
      const [tagDraft, setTagDraft] = useState('');
      const [zenShowDone, setZenShowDone] = useState(false);
      const [filtersOpen, setFiltersOpen] = useState(false);
      const [pomodoro, setPomodoro] = useState(() => loadPomodoro());
      const [now, setNow] = useState(() => Date.now());
      const [flash, setFlash] = useState(null);

      // The Host owns the calendar: its day key decides what "today" means even
      // when the browser runs in a different time zone. Until the first state
      // arrives, fall back to the browser's own day so the panel can render.
      const todayKey = state.todayDate ?? localDateKey();

      const accept = useCallback((payload) => {
        const items = Array.isArray(payload?.items) ? payload.items : [];
        const todayDate = typeof payload?.todayDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(payload.todayDate)
          ? payload.todayDate
          : null;
        setState({ phase: 'ready', items, revision: Number(payload?.revision) || 0, todayDate, error: null });
      }, []);

      const refresh = useCallback(async () => {
        try {
          accept(await readState());
        } catch (error) {
          setState((previous) => ({ ...previous, phase: 'error', error: messageOf(error) }));
        }
      }, [accept]);

      useEffect(() => {
        let alive = true;
        const tick = () => {
          if (!alive || document.visibilityState === 'hidden') return;
          void refresh();
        };
        void refresh();
        const timer = window.setInterval(tick, REFRESH_MS);
        const onFocus = () => void refresh();
        window.addEventListener('focus', onFocus);
        return () => {
          alive = false;
          window.clearInterval(timer);
          window.removeEventListener('focus', onFocus);
        };
      }, [refresh]);

      // Zen mode is a place, not a form: Escape returns to the list.
      useEffect(() => {
        if (scope !== 'today') return undefined;
        const onKey = (event) => {
          if (event.key !== 'Escape' || event.defaultPrevented) return;
          const tag = document.activeElement !== null ? document.activeElement.tagName : '';
          if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
          setScope('all');
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
      }, [scope]);

      // Tick only while a session runs; the clock is derived from `endsAt`, so a
      // throttled or suspended tab still shows the true remainder on wake.
      useEffect(() => {
        if (pomodoro === null || !pomodoro.running || scope !== 'today') return undefined;
        setNow(Date.now());
        const timer = window.setInterval(() => setNow(Date.now()), 500);
        return () => window.clearInterval(timer);
      }, [pomodoro === null, pomodoro?.running, scope]);

      // Phase completion: focus rolls into the break, the break closes the round.
      useEffect(() => {
        if (pomodoro === null || !pomodoro.running) return;
        if (now < (pomodoro.endsAt ?? 0)) return;
        if (pomodoro.phase === 'focus') {
          setFlash({ kind: 'focusDone' });
          setPomodoro({
            phase: 'break',
            running: true,
            endsAt: Date.now() + POMODORO_BREAK_MS,
            pausedMs: POMODORO_BREAK_MS,
            round: pomodoro.round,
            label: pomodoro.label,
          });
        } else {
          setFlash({ kind: 'breakDone' });
          setPomodoro(null);
        }
      }, [now, pomodoro]);

      // Survive a panel remount or a page reload.
      useEffect(() => {
        try {
          if (pomodoro === null) localStorage.removeItem(POMODORO_KEY);
          else localStorage.setItem(POMODORO_KEY, JSON.stringify(pomodoro));
        } catch {
          // Private mode or quota: the session still works for this mount.
        }
      }, [pomodoro]);

      useEffect(() => {
        if (flash === null) return undefined;
        const timer = window.setTimeout(() => setFlash(null), 3400);
        return () => window.clearTimeout(timer);
      }, [flash]);

      const mutate = useCallback(async (request) => {
        setBusy(true);
        setNotice(null);
        try {
          // Optimistic concurrency: send the revision this panel rendered. If
          // the agent (or another tab) wrote meanwhile, the Host rejects the
          // write, returns its current snapshot, and we replay once on top of
          // that fresh list instead of clobbering it with stale state.
          let baseRevision = state.revision;
          for (let attempt = 0; attempt < 2; attempt += 1) {
            try {
              accept(await sendMutation({ ...request, baseRevision }));
              return true;
            } catch (error) {
              if (attempt === 0 && error?.code === 'todo_revision_conflict' && error.snapshot) {
                accept(error.snapshot);
                baseRevision = Number(error.snapshot.revision) || 0;
                continue;
              }
              throw error;
            }
          }
          return false;
        } catch (error) {
          setNotice({ kind: 'error', text: t('error.mutate', { message: messageOf(error) }) });
          return false;
        } finally {
          setBusy(false);
        }
      }, [accept, t, state.revision]);

      const items = state.items;

      const counts = useMemo(() => {
        let open = 0;
        let today = 0;
        for (const item of items) {
          if (!item.done) open += 1;
          if (item.todayDate === todayKey) today += 1;
        }
        return { all: items.length, open, done: items.length - open, today };
      }, [items, todayKey]);

      const scopeItems = useMemo(() => {
        if (scope === 'today') return items.filter((item) => item.todayDate === todayKey);
        if (scope === 'open') return items.filter((item) => !item.done);
        if (scope === 'done') return items.filter((item) => item.done);
        return items;
      }, [items, scope, todayKey]);

      const priorityCounts = useMemo(() => {
        const result = { all: scopeItems.length, P0: 0, P1: 0, P2: 0, P3: 0, none: 0 };
        for (const item of scopeItems) {
          if (item.priority === null) result.none += 1;
          else result[item.priority] += 1;
        }
        return result;
      }, [scopeItems]);

      const tagCounts = useMemo(() => {
        const result = [];
        const index = new Map();
        for (const item of scopeItems) {
          for (const tag of item.tags) {
            const key = tag.toLowerCase();
            const existing = index.get(key);
            if (existing === undefined) {
              index.set(key, result.length);
              result.push({ tag, count: 1 });
            } else {
              result[existing].count += 1;
            }
          }
        }
        return result.sort((left, right) => right.count - left.count || left.tag.localeCompare(right.tag));
      }, [scopeItems]);

      const visible = useMemo(() => {
        let list = scopeItems;
        if (priorityFilter === 'none') list = list.filter((item) => item.priority === null);
        else if (priorityFilter !== 'all') list = list.filter((item) => item.priority === priorityFilter);
        if (tagFilter !== '') {
          const key = tagFilter.toLowerCase();
          list = list.filter((item) => item.tags.some((tag) => tag.toLowerCase() === key));
        }
        return sortItems(list);
      }, [scopeItems, priorityFilter, tagFilter]);

      /** Today's focus list; zen mode ignores the list-mode filters on purpose. */
      const zenItems = useMemo(() => items.filter((item) => item.todayDate === todayKey), [items, todayKey]);
      const zenOpen = useMemo(() => sortItems(zenItems.filter((item) => !item.done)), [zenItems]);
      const zenDone = useMemo(() => sortItems(zenItems.filter((item) => item.done)), [zenItems]);

      const candidates = useMemo(() => {
        const query = pickerQuery.trim().toLowerCase();
        const ids = Array.isArray(sessions?.ids) ? sessions.ids : [];
        const archived = Array.isArray(workspaces?.archivedSessionIds) ? workspaces.archivedSessionIds : [];
        const rows = [];
        for (const id of ids) {
          if (archived.includes(id)) continue;
          const title = sessions?.byId?.[id]?.title;
          const label = typeof title === 'string' && title.trim() !== '' ? title : id;
          if (query !== '' && !label.toLowerCase().includes(query) && !String(id).toLowerCase().includes(query)) continue;
          rows.push({ id, title: label });
          if (rows.length >= PICKER_LIMIT) break;
        }
        return rows;
      }, [sessions, workspaces, pickerQuery]);

      const patch = (item, fields) => void mutate({ op: 'update', id: item.id, ...fields });

      const resetFilters = () => {
        setPriorityFilter('all');
        setTagFilter('');
      };

      const toggleDone = (item) => patch(item, { done: !item.done });

      const submitDraft = (event) => {
        if (event) event.preventDefault();
        const title = draft.trim();
        if (title === '' || busy) return;
        void mutate({ op: 'add', title, today: scope === 'today' }).then((accepted) => {
          if (accepted) setDraft('');
        });
      };

      const startEditing = (item) => {
        setEditing({ id: item.id, text: item.title });
        setExpandedId(item.id);
      };

      const commitEditing = () => {
        if (editing === null) return;
        const title = editing.text.trim();
        const id = editing.id;
        setEditing(null);
        const current = items.find((item) => item.id === id);
        if (title === '' || (current !== undefined && current.title === title)) return;
        void mutate({ op: 'update', id, title });
      };

      const toggleDetails = (item) => {
        setTagDraft('');
        setExpandedId(expandedId === item.id ? null : item.id);
      };

      const toggleToday = (item) => patch(item, { today: item.todayDate !== todayKey });

      const addTags = (item) => {
        const parsed = parseTags(tagDraft);
        if (parsed.length === 0) return;
        setTagDraft('');
        void mutate({ op: 'update', id: item.id, tags: [...item.tags, ...parsed] });
      };

      const removeTag = (item, tag) => patch(item, { tags: item.tags.filter((candidate) => candidate !== tag) });

      const startPomodoro = () => {
        setNow(Date.now());
        setFlash(null);
        setPomodoro({
          phase: 'focus',
          running: true,
          endsAt: Date.now() + POMODORO_FOCUS_MS,
          pausedMs: POMODORO_FOCUS_MS,
          round: 1,
          label: zenOpen.length > 0 ? zenOpen[0].title : null,
        });
      };

      const togglePomodoroPause = () => {
        if (pomodoro === null) return;
        if (pomodoro.running) {
          const at = Date.now();
          setNow(at);
          setPomodoro({ ...pomodoro, running: false, endsAt: null, pausedMs: pomodoroRemaining(pomodoro, at) });
        } else {
          setNow(Date.now());
          setPomodoro({ ...pomodoro, running: true, endsAt: Date.now() + pomodoro.pausedMs });
        }
      };

      const stopPomodoro = () => {
        setFlash(null);
        setPomodoro(null);
      };

      const openPicker = (item) => {
        setPickerQuery('');
        setPickerFor(pickerFor === item.id ? null : item.id);
      };

      const jump = (item) => {
        if (openSession === null) return;
        const status = sessionLinkState(item.sessionId, sessions, workspaces);
        // A pending list may not hold the row yet, so navigate through the
        // loading state and only refuse when the session is known to be gone.
        if (status === 'archived' || status === 'unavailable') {
          setNotice({
            kind: 'error',
            text: t(status === 'archived' ? 'row.sessionArchived' : 'row.sessionUnavailable'),
          });
          setPickerFor(item.id);
          return;
        }
        openSession(item.sessionId);
      };

      const linkSession = async (item, candidate) => {
        const accepted = await mutate({ op: 'update', id: item.id, sessionId: candidate.id, sessionTitle: candidate.title });
        if (accepted) setPickerFor(null);
      };

      const renderSession = (item) => {
        if (item.sessionId === null || item.sessionId === undefined) {
          return h('button', {
            type: 'button',
            className: 'dsh-todos-linkButton dsh-todos-focusable',
            onClick: () => openPicker(item),
            disabled: busy,
          }, t('row.link'));
        }
        const status = sessionLinkState(item.sessionId, sessions, workspaces);
        const label = sessionLabel(item, sessions);
        const blocked = status === 'archived' || status === 'unavailable';
        return [
          h('button', {
            key: 'chip',
            type: 'button',
            className: 'dsh-todos-chip dsh-todos-focusable',
            title: blocked
              ? t(status === 'archived' ? 'row.sessionArchived' : 'row.sessionUnavailable')
              : t('row.jump', { title: label }),
            onClick: () => jump(item),
            disabled: busy,
          },
          h('span', { className: 'dsh-todos-chipName' }, label),
          h('span', { style: { display: 'inline-flex', color: 'inherit' } }, h(IconArrow))),
          h('button', {
            key: 'unlink',
            type: 'button',
            className: 'dsh-todos-linkButton dsh-todos-focusable',
            title: t('row.unlink'),
            'aria-label': t('row.unlink'),
            onClick: () => patch(item, { sessionId: null }),
            disabled: busy,
          }, h(IconClose)),
          blocked ? h('span', {
            key: 'blocked',
            style: { color: 'var(--dsw-alias-label-caption)' },
          }, t(status === 'archived' ? 'row.sessionArchived' : 'row.sessionUnavailable')) : null,
          h('button', {
            key: 'relink',
            type: 'button',
            className: 'dsh-todos-linkButton dsh-todos-focusable',
            onClick: () => openPicker(item),
            disabled: busy,
          }, t('row.link')),
        ];
      };

      const renderPicker = (item) => {
        return h('div', { className: 'dsh-todos-picker' },
          h('div', { className: 'dsh-todos-pickerHead' },
            h('span', null, t('picker.title')),
            h('button', {
              type: 'button',
              className: 'dsh-todos-iconButton dsh-todos-focusable',
              title: t('picker.close'),
              'aria-label': t('picker.close'),
              onClick: () => setPickerFor(null),
            }, h(IconClose))),
          h('input', {
            className: 'dsh-todos-input dsh-todos-focusable',
            type: 'search',
            placeholder: t('picker.search'),
            'aria-label': t('picker.search'),
            value: pickerQuery,
            onChange: (event) => setPickerQuery(event.target.value),
          }),
          candidates.length === 0
            ? h('p', { className: 'dsh-todos-pickerEmpty' }, t('picker.empty'))
            : h('div', { className: 'dsh-todos-pickerList', role: 'group' }, candidates.map((candidate) => h('button', {
              key: candidate.id,
              type: 'button',
              className: 'dsh-todos-pickerItem dsh-todos-focusable',
              onClick: () => void linkSession(item, candidate),
              disabled: busy,
            },
            h('span', { className: 'dsh-todos-pickerName' }, candidate.title),
            h('span', { className: 'dsh-todos-pickerId' }, String(candidate.id).slice(0, 22))))));
      };

      const renderDetails = (item) => {
        const inToday = item.todayDate === todayKey;
        return h('div', { className: 'dsh-todos-details', id: `dsh-todos-details-${item.id}`, role: 'group', 'aria-label': t('details.title') },
          h('div', { className: 'dsh-todos-detailRow' },
            h('span', { className: 'dsh-todos-detailLabel' }, t('details.priority')),
            h('div', { className: 'dsh-todos-detailBody' },
              h('div', { className: 'dsh-todos-optionRow', role: 'group', 'aria-label': t('priority.label') },
                ...PRIORITIES.map((level) => h('button', {
                  key: level,
                  type: 'button',
                  className: `dsh-todos-option dsh-todos-option${level} dsh-todos-focusable`,
                  'aria-pressed': item.priority === level,
                  onClick: () => patch(item, { priority: item.priority === level ? null : level }),
                  disabled: busy,
                }, level)),
                h('button', {
                  type: 'button',
                  className: 'dsh-todos-option dsh-todos-focusable',
                  'aria-pressed': item.priority === null,
                  onClick: () => patch(item, { priority: null }),
                  disabled: busy,
                }, t('priority.none')),
              ),
            ),
          ),
          h('div', { className: 'dsh-todos-detailRow' },
            h('span', { className: 'dsh-todos-detailLabel' }, t('details.quadrant')),
            h('div', { className: 'dsh-todos-detailBody' },
              h('div', { className: 'dsh-todos-quadrantGrid', role: 'group', 'aria-label': t('quadrant.label') },
                ...QUADRANTS.map((quadrant) => h('button', {
                  key: quadrant,
                  type: 'button',
                  className: 'dsh-todos-quadrantOption dsh-todos-focusable',
                  'aria-pressed': item.quadrant === quadrant,
                  title: t(`quadrant.${quadrant}`),
                  onClick: () => patch(item, { quadrant: item.quadrant === quadrant ? null : quadrant }),
                  disabled: busy,
                },
                h('span', { className: 'dsh-todos-quadrantKey' }, quadrant.toUpperCase()),
                h('span', { className: 'dsh-todos-quadrantText' }, t(`quadrant.${quadrant}.short`)))),
              ),
            ),
          ),
          h('div', { className: 'dsh-todos-detailRow' },
            h('span', { className: 'dsh-todos-detailLabel' }, t('details.today')),
            h('div', { className: 'dsh-todos-detailBody' },
              h('div', { className: 'dsh-todos-optionRow' },
                h('button', {
                  type: 'button',
                  className: 'dsh-todos-option dsh-todos-focusable',
                  'aria-pressed': inToday,
                  onClick: () => toggleToday(item),
                  disabled: busy,
                }, h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 5 } },
                  h(IconSun, { filled: inToday }),
                  inToday ? t('row.todayRemove') : t('row.todayAdd'))),
              ),
              item.todayDate !== null && !inToday
                ? h('p', { className: 'dsh-todos-detailHint' }, t('row.todayStale', { date: shortDay(item.todayDate) }))
                : null,
            ),
          ),
          h('div', { className: 'dsh-todos-detailRow' },
            h('span', { className: 'dsh-todos-detailLabel' }, t('details.session')),
            h('div', { className: 'dsh-todos-detailBody' },
              h('div', { className: 'dsh-todos-optionRow' }, renderSession(item)))),
          h('div', { className: 'dsh-todos-detailRow' },
            h('span', { className: 'dsh-todos-detailLabel' }, t('details.tags')),
            h('div', { className: 'dsh-todos-detailBody' },
              h('div', { className: 'dsh-todos-tagEditRow' },
                ...item.tags.map((tag) => h('span', { key: tag, className: 'dsh-todos-tagEdit' },
                  `#${tag}`,
                  h('button', {
                    type: 'button',
                    className: 'dsh-todos-tagRemove dsh-todos-focusable',
                    title: t('tags.remove', { tag }),
                    'aria-label': t('tags.remove', { tag }),
                    onClick: () => removeTag(item, tag),
                    disabled: busy,
                  }, '\u00d7'),
                )),
                h('input', {
                  className: 'dsh-todos-tagInput dsh-todos-focusable',
                  type: 'text',
                  value: tagDraft,
                  placeholder: t('tags.placeholder'),
                  'aria-label': t('tags.placeholder'),
                  maxLength: 80,
                  onChange: (event) => setTagDraft(event.target.value),
                  onKeyDown: (event) => {
                    if (event.key !== 'Enter' || event.nativeEvent?.isComposing) return;
                    event.preventDefault();
                    addTags(item);
                  },
                  onBlur: () => addTags(item),
                }),
              ),
            ),
          ),
          h('p', { className: 'dsh-todos-detailHint' }, t('details.hint')),
          h('div', { className: 'dsh-todos-detailActions' },
            h('button', {
              type: 'button', className: 'dsh-todos-textButton dsh-todos-focusable',
              onClick: () => startEditing(item), disabled: busy,
            }, h(IconPencil), t('row.edit')),
            h('button', {
              type: 'button', className: 'dsh-todos-textButton dsh-todos-danger dsh-todos-focusable',
              onClick: () => void mutate({ op: 'remove', id: item.id }), disabled: busy,
            }, h(IconTrash), t('row.delete'))),
        );
      };

      /**
       * A readable title with quiet classification below. Full editing controls
       * stay in the detail drawer, including on narrow and touch layouts.
       */
      const renderRow = (item) => {
        const isEditing = editing !== null && editing.id === item.id;
        const isExpanded = expandedId === item.id;
        const inToday = item.todayDate === todayKey;
        return h('li', { key: item.id, className: cx('dsh-todos-item', isExpanded && 'dsh-todos-itemExpanded') },
          h('div', { className: cx('dsh-todos-row', item.done && 'dsh-todos-rowDone') },
            h('button', {
              type: 'button',
              role: 'checkbox',
              'aria-checked': item.done === true,
              'aria-label': `${t(item.done ? 'row.markOpen' : 'row.markDone')}: ${item.title}`,
              className: 'dsh-todos-check dsh-todos-focusable',
              onClick: () => toggleDone(item),
              disabled: busy,
            }, item.done ? h(IconCheck) : null),
            h('div', { className: 'dsh-todos-rowContent' },
            isEditing
              ? h('input', {
                className: 'dsh-todos-input dsh-todos-inlineInput dsh-todos-focusable',
                value: editing.text,
                'aria-label': t('row.edit'),
                autoFocus: true,
                onChange: (event) => setEditing({ id: item.id, text: event.target.value }),
                onKeyDown: (event) => {
                  if (event.key === 'Enter' && !event.nativeEvent?.isComposing) {
                    event.preventDefault();
                    commitEditing();
                  } else if (event.key === 'Escape') {
                    event.preventDefault();
                    setEditing(null);
                  }
                },
                onBlur: () => commitEditing(),
              })
              : h('button', {
                type: 'button',
                className: 'dsh-todos-rowTitle dsh-todos-focusable',
                title: item.title,
                'aria-expanded': isExpanded,
                'aria-controls': isExpanded ? `dsh-todos-details-${item.id}` : undefined,
                onClick: () => toggleDetails(item),
                onDoubleClick: () => startEditing(item),
              }, item.title),
            (item.priority !== null || inToday || item.tags.length > 0 || item.sessionId || item.todayDate)
              ? h('div', { className: 'dsh-todos-rowMeta' },
                item.priority === null ? null : h('span', { className: 'dsh-todos-priorityLabel' },
                  h('span', { className: `dsh-todos-dot dsh-todos-dot${item.priority}`, 'aria-hidden': true }), item.priority),
            inToday
              ? h('span', {
                className: 'dsh-todos-todayMark',
              }, h(IconSun, { filled: false }), t('row.todayMark'))
              : null,
            item.todayDate !== null && !inToday
              ? h('span', {
                className: 'dsh-todos-staleDay',
                title: t('row.todayStale', { date: shortDay(item.todayDate) }),
              }, shortDay(item.todayDate))
              : null,
                ...item.tags.map((tag) => h('button', {
                  key: tag, type: 'button', className: 'dsh-todos-tagChip dsh-todos-focusable',
                  'aria-pressed': tagFilter === tag,
                  onClick: () => setTagFilter(tagFilter === tag ? '' : tag),
                }, `#${tag}`)),
                item.sessionId ? h('button', {
                  type: 'button', className: 'dsh-todos-sessionLink dsh-todos-focusable',
                  title: t('row.jump', { title: sessionLabel(item, sessions) }),
                  onClick: () => jump(item), disabled: busy,
                }, h(IconArrow), h('span', null, sessionLabel(item, sessions))) : null)
              : null),
            h('div', { className: 'dsh-todos-rowActions' },
              h('div', { className: 'dsh-todos-rowActionsMore' },
                h('button', {
                  type: 'button',
                  className: 'dsh-todos-rowIcon dsh-todos-focusable',
                  'aria-pressed': inToday,
                  title: inToday ? t('row.todayRemove') : t('row.todayAdd'),
                  'aria-label': inToday ? t('row.todayRemove') : t('row.todayAdd'),
                  onClick: () => toggleToday(item),
                  disabled: busy,
                }, h(IconSun, { filled: inToday })),
                h('button', {
                  type: 'button',
                  className: 'dsh-todos-rowIcon dsh-todos-focusable',
                  title: t('row.edit'),
                  'aria-label': t('row.edit'),
                  onClick: () => startEditing(item),
                  disabled: busy,
                }, h(IconPencil)),
                h('button', {
                  type: 'button',
                  className: 'dsh-todos-rowIcon dsh-todos-focusable',
                  title: t('row.delete'),
                  'aria-label': t('row.delete'),
                  onClick: () => void mutate({ op: 'remove', id: item.id }),
                  disabled: busy,
                }, h(IconTrash))),
              h('button', {
                type: 'button',
                className: 'dsh-todos-rowToggle dsh-todos-focusable',
                'aria-expanded': isExpanded,
                'aria-controls': isExpanded ? `dsh-todos-details-${item.id}` : undefined,
                title: isExpanded ? t('row.detailsClose') : t('row.details'),
                'aria-label': isExpanded ? t('row.detailsClose') : t('row.details'),
                onClick: () => toggleDetails(item),
              }, h(IconChevron, { open: isExpanded })))),
          isExpanded ? renderDetails(item) : null,
          pickerFor === item.id ? renderPicker(item) : null);
      };

      /**
       * Four-quadrant (Eisenhower) view: one cell per quadrant plus an
       * "unclassified" bucket for items with no quadrant set. Cells reuse the
       * same rows as the list, so details, rename and delete keep working.
       */
      const renderMatrix = () => {
        const buckets = [
          ...QUADRANTS.map((quadrantKey) => ({
            quadrantKey,
            items: visible.filter((item) => item.quadrant === quadrantKey),
          })),
          { quadrantKey: null, items: visible.filter((item) => item.quadrant === null) },
        ];
        return h('div', { className: 'dsh-todos-matrix' },
          ...buckets.map(({ quadrantKey, items: bucketItems }) => {
            const isUnclassified = quadrantKey === null;
            const ariaLabel = isUnclassified ? t('matrix.unclassified') : t(`quadrant.${quadrantKey}`);
            const shortLabel = isUnclassified ? ariaLabel : t(`quadrant.${quadrantKey}.short`);
            return h('div', {
              key: quadrantKey ?? 'unclassified',
              className: cx('dsh-todos-matrixCell', isUnclassified && 'dsh-todos-matrixCellWide'),
              'data-quadrant': quadrantKey ?? 'none',
            },
            h('div', { className: 'dsh-todos-matrixHead' },
              isUnclassified
                ? null
                : h('span', { className: 'dsh-todos-matrixKey' }, quadrantKey.toUpperCase()),
              h('h2', null, shortLabel),
              h('span', { className: 'dsh-todos-matrixCount' }, String(bucketItems.length))),
            isUnclassified ? null : h('p', { className: 'dsh-todos-matrixHint' }, t(`matrix.${quadrantKey}.hint`)),
            bucketItems.length === 0
              ? h('p', { className: 'dsh-todos-quadrantEmpty' }, t('matrix.empty'))
              : h('ul', { className: 'dsh-todos-list', 'aria-label': ariaLabel },
                ...bucketItems.map(renderRow)));
          }));
      };

      const renderZenRow = (item, index) => {
        const isEditing = editing !== null && editing.id === item.id;
        const isExpanded = expandedId === item.id;
        return h('li', { key: item.id },
          h('div', {
            className: cx('dsh-todos-zenItem', item.done && 'dsh-todos-zenItemDone'),
            style: { animationDelay: `${Math.min(index, 12) * 45}ms` },
          },
          h('button', {
            type: 'button',
            role: 'checkbox',
            'aria-checked': item.done === true,
            'aria-label': `${t(item.done ? 'row.markOpen' : 'row.markDone')}: ${item.title}`,
            className: 'dsh-todos-zenCheck dsh-todos-focusable',
            onClick: () => toggleDone(item),
            disabled: busy,
          }, item.done ? h(IconCheck) : null),
          h('div', { className: 'dsh-todos-zenBody' },
            item.priority === null
              ? null
              : h('span', {
                className: 'dsh-todos-zenDot',
                title: item.priority,
                style: { background: PRIORITY_COLOR[item.priority] },
              }),
            isEditing
              ? h('input', {
                className: 'dsh-todos-zenInput dsh-todos-zenInlineInput dsh-todos-focusable',
                value: editing.text,
                'aria-label': t('row.edit'),
                autoFocus: true,
                onChange: (event) => setEditing({ id: item.id, text: event.target.value }),
                onKeyDown: (event) => {
                  if (event.key === 'Enter' && !event.nativeEvent?.isComposing) {
                    event.preventDefault();
                    commitEditing();
                  } else if (event.key === 'Escape') {
                    event.preventDefault();
                    setEditing(null);
                  }
                },
                onBlur: () => commitEditing(),
              })
              : h('button', {
                type: 'button',
                className: 'dsh-todos-zenTitle dsh-todos-focusable',
                'aria-expanded': isExpanded,
                title: isExpanded ? t('row.detailsClose') : t('row.details'),
                onClick: () => toggleDetails(item),
                onDoubleClick: () => startEditing(item),
              }, item.title)),
          h('div', { className: 'dsh-todos-zenActions' },
            item.sessionId === null || item.sessionId === undefined
              ? null
              : h('button', {
                type: 'button',
                className: 'dsh-todos-iconButton dsh-todos-focusable',
                title: t('row.jump', { title: sessionLabel(item, sessions) }),
                'aria-label': t('row.jump', { title: sessionLabel(item, sessions) }),
                onClick: () => jump(item),
                disabled: busy,
              }, h(IconArrow)),
            h('button', {
              type: 'button',
              className: 'dsh-todos-iconButton dsh-todos-focusable',
              'aria-expanded': isExpanded,
              title: isExpanded ? t('row.detailsClose') : t('row.details'),
              'aria-label': isExpanded ? t('row.detailsClose') : t('row.details'),
              onClick: () => toggleDetails(item),
            }, h(IconChevron, { open: isExpanded })))),
        isExpanded ? renderDetails(item) : null,
        pickerFor === item.id ? renderPicker(item) : null);
      };

      /**
       * Immersive "today" view: one enso, the date, one add line, the items, and
       * nothing else. Filters, statistics, tags and session chips stay in the
       * list view; here they are reachable only through a row's details.
       */
      /**
       * Focus timer that takes the enso's place: one ring, the clock, the phase,
       * and two quiet controls. The ring is the animation; nothing else moves.
       */
      const renderPomodoro = () => {
        const remaining = pomodoroRemaining(pomodoro, now);
        const total = pomodoroTotal(pomodoro);
        const ratio = total === 0 ? 0 : Math.min(1, Math.max(0, remaining / total));
        const radius = 62;
        const circumference = 2 * Math.PI * radius;
        const isBreak = pomodoro.phase === 'break';
        return h('div', {
          className: cx('dsh-todos-pomo', isBreak && 'dsh-todos-pomoBreak'),
          role: 'timer',
          'aria-label': t('pomodoro.aria'),
        },
        h('div', { className: 'dsh-todos-pomoRing' },
          h('svg', { viewBox: '0 0 148 148', width: 148, height: 148, 'aria-hidden': true },
            h('circle', { className: 'dsh-todos-pomoTrack', cx: 74, cy: 74, r: radius }),
            h('circle', {
              className: 'dsh-todos-pomoProgress',
              cx: 74, cy: 74, r: radius,
              strokeDasharray: `${circumference}`,
              strokeDashoffset: `${circumference * (1 - ratio)}`,
              transform: 'rotate(-90 74 74)',
            })),
          h('div', { className: 'dsh-todos-pomoClock' },
            h('span', { className: 'dsh-todos-pomoTime' }, formatClock(remaining)),
            h('span', { className: 'dsh-todos-pomoPhase' },
              t(isBreak ? 'pomodoro.breaking' : 'pomodoro.focusing')))),
        pomodoro.label === null || isBreak
          ? null
          : h('p', { className: 'dsh-todos-pomoLabel' },
            t('pomodoro.sessionLabel', { title: pomodoro.label })),
        h('p', { className: 'dsh-todos-pomoMeta' },
          t('pomodoro.round', { round: pomodoro.round }), ' · ',
          t(isBreak ? 'pomodoro.breakHint' : 'pomodoro.focusHint')),
        h('div', { className: 'dsh-todos-pomoActions' },
          h('button', {
            type: 'button',
            className: 'dsh-todos-zenAddButton dsh-todos-focusable',
            onClick: togglePomodoroPause,
          }, pomodoro.running ? t('pomodoro.pause') : t('pomodoro.resume')),
          h('button', {
            type: 'button',
            className: 'dsh-todos-zenAddButton dsh-todos-focusable',
            onClick: stopPomodoro,
          }, t('pomodoro.stop'))));
      };

      const renderZen = () => {
        let when = '';
        try {
          // Render the Host's day, not the browser's: the two can differ around
          // midnight or across time zones, and "today" must mean one thing.
          const day = /^\d{4}-\d{2}-\d{2}$/.test(todayKey)
            ? new Date(`${todayKey}T12:00:00`)
            : new Date();
          when = new Intl.DateTimeFormat(t('zen.locale'), {
            month: 'long', day: 'numeric', weekday: 'long',
          }).format(day);
        } catch {
          when = '';
        }
        return h('div', { className: 'dsh-todos-zenScroll' },
          h('div', { className: 'dsh-todos-zen' },
            h('button', {
              type: 'button',
              className: 'dsh-todos-zenExit dsh-todos-focusable',
              title: t('zen.exitHint'),
              onClick: () => setScope('all'),
            }, '← ', t('zen.exit')),
            pomodoro === null
              ? h('svg', {
                className: 'dsh-todos-zenEnso',
                width: 78, height: 78, viewBox: '0 0 88 88', fill: 'none', 'aria-hidden': true,
              },
              h('circle', {
                cx: 44, cy: 44, r: 37, stroke: 'currentColor', strokeWidth: 1.6,
                strokeLinecap: 'round', strokeDasharray: '196 36', transform: 'rotate(-96 44 44)',
              }))
              : renderPomodoro(),
            pomodoro === null
              ? h('h1', { className: 'dsh-todos-zenHeading' }, t('zen.title'))
              : null,
            pomodoro === null
              ? h('p', { className: 'dsh-todos-zenDate' }, when)
              : null,
            pomodoro === null && zenOpen.length > 0
              ? h('p', { className: 'dsh-todos-zenSummary' }, t('zen.summary', { open: zenOpen.length }))
              : null,
            pomodoro === null
              ? h('button', {
                type: 'button',
                className: 'dsh-todos-pomoStart dsh-todos-focusable',
                title: t('pomodoro.startHint'),
                onClick: startPomodoro,
              }, h(IconTimer), t('pomodoro.start'))
              : null,
            h('form', { className: 'dsh-todos-zenAdd', onSubmit: submitDraft },
              h('input', {
                className: 'dsh-todos-zenInput dsh-todos-focusable',
                type: 'text',
                placeholder: t('zen.placeholder'),
                'aria-label': t('zen.placeholder'),
                value: draft,
                maxLength: 200,
                onKeyDown: (event) => {
                  if (event.key === 'Enter' && event.nativeEvent?.isComposing) event.preventDefault();
                },
                onChange: (event) => setDraft(event.target.value),
              }),
              h('button', {
                type: 'submit',
                className: 'dsh-todos-zenAddButton dsh-todos-focusable',
                disabled: busy || draft.trim() === '',
              }, t('zen.add'))),
            zenOpen.length === 0
              ? h('p', { className: 'dsh-todos-zenEmpty' },
                zenDone.length > 0 ? t('zen.allDone') : t('zen.empty'))
              : h('ul', { className: 'dsh-todos-zenList', 'aria-label': t('scope.today') },
                ...zenOpen.map(renderZenRow)),
            zenDone.length === 0
              ? null
              : h('div', { className: 'dsh-todos-zenDoneBlock' },
                h('button', {
                  type: 'button',
                  className: 'dsh-todos-zenDoneToggle dsh-todos-focusable',
                  'aria-expanded': zenShowDone,
                  onClick: () => setZenShowDone(!zenShowDone),
                },
                zenShowDone ? t('zen.doneHide') : t('zen.done', { count: zenDone.length }),
                h(IconChevron, { open: zenShowDone })),
                zenShowDone
                  ? h('ul', { className: 'dsh-todos-zenList dsh-todos-zenDoneList' },
                    ...zenDone.map(renderZenRow))
                  : null),
            flash === null
              ? null
              : h('div', { className: 'dsh-todos-pomoFlash', role: 'status' },
                h('span', { className: 'dsh-todos-pomoPing' }),
                h('span', { className: 'dsh-todos-pomoFlashText' },
                  t(flash.kind === 'focusDone' ? 'pomodoro.focusDone' : 'pomodoro.breakDone'))),
            notice === null
              ? null
              : h('p', {
                className: 'dsh-todos-zenNotice dsh-todos-zenNoticeError',
                role: 'status',
              }, notice.text),
            state.phase === 'error' && notice === null
              ? h('p', {
                className: 'dsh-todos-zenNotice dsh-todos-zenNoticeError',
                role: 'alert',
              }, t('error.load', { message: String(state.error ?? '') }))
              : null));
      };

      const priorityOptions = [
        ['all', t('priority.all'), priorityCounts.all],
        ...PRIORITIES.map((level) => [level, level, priorityCounts[level]]),
        ['none', t('priority.none'), priorityCounts.none],
      ];

      const emptyText = items.length === 0
        ? t('list.empty')
        : scope === 'today'
          ? t('focus.empty')
          : t('list.emptyFiltered');

      if (scope === 'today') {
        return h('section', {
          className: 'dsh-todos-page dsh-todos-zenPage',
          'aria-label': t('zen.title'),
          'data-testid': 'dsh-todos-zen',
        },
        h('style', null, STYLE),
        h('div', { className: 'dsh-todos-pane' }, renderZen()));
      }

      const activeFilterCount = (priorityFilter === 'all' ? 0 : 1) + (tagFilter === '' ? 0 : 1);
      const openRows = visible.filter((item) => !item.done);
      const doneRows = visible.filter((item) => item.done);

      const renderFilterChip = (key, label, count, pressed, onSelect) => h('button', {
        key,
        type: 'button',
        'aria-pressed': pressed,
        className: 'dsh-todos-filterChip dsh-todos-focusable',
        onClick: onSelect,
      }, label, h('span', { className: 'dsh-todos-filterChipCount' }, String(count)));

      return h('section', {
        className: cx('dsh-todos-page', view === 'matrix' && 'dsh-todos-matrixPage'),
        'aria-label': t('page.title'),
        'data-testid': 'dsh-todos-page',
      },
      h('style', null, STYLE),
      h('div', { className: 'dsh-todos-pane' },
        h('div', { className: 'dsh-todos-scroll' },
          h('div', { className: 'dsh-todos-content' },
            h('div', { className: 'dsh-todos-heading' },
              h('div', { className: 'dsh-todos-headingCopy' },
                h('p', { className: 'dsh-todos-eyebrow' }, h(TodoIcon, { size: 16 }), t('page.eyebrow')),
                h('h1', null, t('page.title')),
                h('p', { className: 'dsh-todos-subtitle' }, t('page.subtitle'))),
              h('div', { className: 'dsh-todos-viewSwitch', role: 'group', 'aria-label': t('view.label') },
                h('button', {
                  type: 'button',
                  className: 'dsh-todos-viewButton dsh-todos-focusable',
                  'aria-pressed': view === 'list',
                  onClick: () => setView('list'),
                }, h(IconList), t('view.list')),
                h('button', {
                  type: 'button',
                  className: 'dsh-todos-viewButton dsh-todos-focusable',
                  'aria-pressed': view === 'matrix',
                  onClick: () => setView('matrix'),
                }, h(IconMatrix), t('view.matrix')))),
            h('button', {
              type: 'button', className: 'dsh-todos-focusCard dsh-todos-focusable',
              onClick: () => setScope('today'),
            },
              h('span', { className: 'dsh-todos-focusIcon' }, h(IconSun, { filled: false })),
              h('span', { className: 'dsh-todos-focusCopy' },
                h('strong', null, t('page.focus')),
                h('span', null, t('page.focusHint', { count: zenOpen.length }))),
              h('span', { className: 'dsh-todos-focusTime' }, h(IconTimer), '25:00'),
              h(IconChevron, { open: false })),
            h('form', { className: 'dsh-todos-addRow', onSubmit: submitDraft },
              h('label', { className: 'dsh-todos-addLabel', htmlFor: 'dsh-todos-new-title' }, t('add.hint')),
              h('div', { className: 'dsh-todos-addField' },
                h('input', {
                  id: 'dsh-todos-new-title',
                  className: 'dsh-todos-addInput dsh-todos-focusable',
                  type: 'text',
                  placeholder: t('add.placeholder'),
                  'aria-label': t('add.label'),
                  value: draft,
                  maxLength: 200,
                  onKeyDown: (event) => {
                    if (event.key === 'Enter' && event.nativeEvent?.isComposing) event.preventDefault();
                  },
                  onChange: (event) => setDraft(event.target.value),
                }),
                h('button', {
                  type: 'submit',
                  className: 'dsh-todos-addButton dsh-todos-focusable',
                  title: t('add.action'),
                  'aria-label': t('add.action'),
                  disabled: busy || draft.trim() === '',
                }, h(IconPlus), h('span', null, t('add.action'))))),
            notice === null
              ? null
              : h('p', { className: 'dsh-todos-notice dsh-todos-noticeError', role: 'status' }, notice.text),
            state.phase === 'error' && notice === null
              ? h('div', { className: 'dsh-todos-notice dsh-todos-noticeError', role: 'alert' },
                h('span', null, t('error.load', { message: String(state.error ?? '') })),
                h('button', {
                  type: 'button',
                  className: 'dsh-todos-textButton dsh-todos-focusable',
                  onClick: () => void refresh(),
                }, t('retry')))
              : null,
            h('div', { className: 'dsh-todos-toolbar' },
              h('div', { className: 'dsh-todos-scopeTabs', role: 'group', 'aria-label': t('scope.label') },
                ...[
                  ['today', t('scope.today'), counts.today],
                  ['all', t('scope.all'), counts.all],
                  ['open', t('scope.open'), counts.open],
                  ['done', t('scope.done'), counts.done],
                ].map(([value, label, count]) => h('button', {
                  key: value,
                  type: 'button',
                  'aria-pressed': scope === value,
                  className: 'dsh-todos-scopeTab dsh-todos-focusable',
                  onClick: () => setScope(value),
                }, value === 'today' ? h(IconSun, { filled: false }) : null,
                label, h('span', { className: 'dsh-todos-scopeCount' }, String(count))))),
              h('button', {
                type: 'button',
                className: cx('dsh-todos-filterButton dsh-todos-focusable', (filtersOpen || activeFilterCount > 0) && 'dsh-todos-filterButtonOn'),
                'aria-expanded': filtersOpen,
                'aria-controls': filtersOpen ? 'dsh-todos-filters' : undefined,
                'aria-label': activeFilterCount === 0
                  ? t('filter.title')
                  : t('filter.active', { count: activeFilterCount }),
                title: t('filter.title'),
                onClick: () => setFiltersOpen(!filtersOpen),
              },
              h(IconFilter),
              h('span', null, t('filter.title')),
              activeFilterCount === 0
                ? null
                : h('span', { className: 'dsh-todos-filterBadge' }, String(activeFilterCount)))),
            filtersOpen
              ? h('div', { className: 'dsh-todos-filterPanel', id: 'dsh-todos-filters' },
                h('div', { className: 'dsh-todos-filterRow' },
                  h('span', { className: 'dsh-todos-filterLabel' }, t('priority.label')),
                  h('div', { className: 'dsh-todos-filterChips', role: 'group' },
                    ...priorityOptions.map(([value, label, count]) => renderFilterChip(
                      value,
                      label,
                      count,
                      priorityFilter === value,
                      () => setPriorityFilter(value),
                    )))),
                tagCounts.length === 0
                  ? null
                  : h('div', { className: 'dsh-todos-filterRow' },
                    h('span', { className: 'dsh-todos-filterLabel' }, t('tags.label')),
                    h('div', { className: 'dsh-todos-filterChips', role: 'group' },
                      ...tagCounts.map(({ tag, count }) => renderFilterChip(
                        tag,
                        `#${tag}`,
                        count,
                        tagFilter === tag,
                        () => setTagFilter(tagFilter === tag ? '' : tag),
                      )))),
                h('div', { className: 'dsh-todos-filterFoot' },
                  h('button', {
                    type: 'button',
                    className: 'dsh-todos-textButton dsh-todos-focusable',
                    onClick: resetFilters,
                    disabled: activeFilterCount === 0,
                  }, t('filter.reset'))))
              : null,
            state.phase === 'loading'
              ? h('div', { className: 'dsh-todos-loading', role: 'status' },
                h('p', null, t('loading')),
                ...[0, 1, 2].map((key) => h('div', { key, className: 'dsh-todos-skeleton', 'aria-hidden': true })))
              : visible.length === 0
                ? h('div', { className: 'dsh-todos-empty', role: 'status' },
                  h('span', { className: 'dsh-todos-emptyIcon' }, h(TodoIcon, { size: 32 })),
                  h('h2', null, t(items.length === 0 ? 'list.emptyTitle' : 'list.filteredTitle')),
                  h('p', null, emptyText),
                  activeFilterCount === 0
                    ? null
                    : h('button', {
                      type: 'button',
                      className: 'dsh-todos-textButton dsh-todos-focusable',
                      onClick: resetFilters,
                    }, t('filter.reset')))
                : view === 'matrix'
                  ? renderMatrix()
                  : h('div', { className: 'dsh-todos-groups' },
                    openRows.length === 0
                      ? null
                      : h('div', null,
                        h('div', { className: 'dsh-todos-groupHeading' },
                          h('h2', null, t('list.openGroup'), h('span', null, String(openRows.length))),
                          h('span', { className: 'dsh-todos-sortHint' }, t('list.sort'))),
                        h('ul', { className: 'dsh-todos-list', 'aria-label': t('list.label') },
                          ...openRows.map(renderRow))),
                    doneRows.length === 0
                      ? null
                      : h('div', { className: 'dsh-todos-doneGroup' },
                        scope === 'done'
                          ? null
                          : h('h2', { className: 'dsh-todos-groupLabel' },
                            t('list.doneGroup'), ' ', String(doneRows.length)),
                        h('ul', { className: 'dsh-todos-list', 'aria-label': t('list.doneGroup') },
                          ...doneRows.map(renderRow)))),
            h('div', { className: 'dsh-todos-foot' },
              h('span', { className: 'dsh-todos-footHint' }, h(TodoIcon, { size: 14 }), t('footer.hint')),
              counts.done === 0 ? null : h('button', {
                  type: 'button',
                  className: 'dsh-todos-textButton dsh-todos-focusable',
                  onClick: () => void mutate({ op: 'clearDone' }),
                  disabled: busy,
                }, t('footer.clearDone')))))));
    }
