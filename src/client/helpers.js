    /**
     * Local calendar day of this browser, matching the Host's "today" key.
     * @param date - instant to format; defaults to now.
     * @returns `YYYY-MM-DD`.
     */
    function localDateKey(date = new Date()) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    /**
     * Short day label for a stored day key.
     * @param key - `YYYY-MM-DD`.
     * @returns `MM-DD`.
     */
    function shortDay(key) {
      return typeof key === 'string' && key.length >= 10 ? key.slice(5) : String(key);
    }

    /**
     * Split typed tag text into clean tags; accepts commas, semicolons, and spaces.
     * @param input - raw input text.
     * @returns candidate tags without a leading `#`.
     */
    function parseTags(input) {
      return String(input ?? '')
        .split(/[,，;；\s]+/)
        .map((part) => part.replace(/^#+/, '').trim())
        .filter((part) => part !== '');
    }

    /**
     * Sort by priority level first, then newest first; unranked items go last.
     * @param list - items to order.
     * @returns a new ordered array.
     */
    function sortItems(list) {
      return [...list].sort((left, right) => {
        const leftRank = left.priority === null ? 4 : PRIORITY_RANK[left.priority];
        const rightRank = right.priority === null ? 4 : PRIORITY_RANK[right.priority];
        if (leftRank !== rightRank) return leftRank - rightRank;
        return (right.createdAt ?? 0) - (left.createdAt ?? 0);
      });
    }

    /**
     * Read the authoritative list from the Host.
     * @returns the Host state payload.
     */
    async function readState() {
      const response = await fetch(STATE_ENDPOINT, { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.json();
      if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new Error('malformed response');
      return body;
    }

    /**
     * Apply one mutation on the Host and receive the new list.
     * @param request - `{ op, ...fields }`.
     * @returns the Host state payload after the change.
     */
    async function sendMutation(request) {
      const response = await fetch(MUTATE_ENDPOINT, {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
      });
      let body = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      if (!response.ok) {
        const message = typeof body?.message === 'string' ? body.message : `HTTP ${response.status}`;
        const error = new Error(message);
        if (typeof body?.code === 'string') error.code = body.code;
        if (body?.snapshot !== null && typeof body?.snapshot === 'object') error.snapshot = body.snapshot;
        throw error;
      }
      if (body === null || typeof body !== 'object') throw new Error('malformed response');
      return body;
    }

    /**
     * Explain a thrown fetch or Host failure in one short sentence.
     * @param error - anything thrown.
     * @returns display text.
     */
    function messageOf(error) {
      if (error instanceof Error && error.message !== '') return error.message;
      return String(error);
    }

    /**
     * Availability of a linked Session without opening it: the Host list decides
     * membership, the Workspace projection decides archive state.
     * @param id - linked Session id.
     * @param sessions - Session list projection.
     * @param workspaces - Workspace/archive projection.
     * @returns `available`, `loading`, `archived`, or `unavailable`.
     */
    function sessionLinkState(id, sessions, workspaces) {
      if (workspaces?.state === 'error') return 'unavailable';
      if (sessions?.phase === 'pending' || workspaces?.phase === 'pending') return 'loading';
      const archived = Array.isArray(workspaces?.archivedSessionIds) ? workspaces.archivedSessionIds : [];
      if (archived.includes(id)) return 'archived';
      const ids = Array.isArray(sessions?.ids) ? sessions.ids : [];
      if (!ids.includes(id)) return 'unavailable';
      return 'available';
    }

    /**
     * Resolve one linked Session's display label, falling back to the cached
     * title captured at link time and then to the id itself.
     * @param item - the todo item.
     * @param sessions - Session list projection.
     * @returns a non-empty label.
     */
    function sessionLabel(item, sessions) {
      const title = sessions?.byId?.[item.sessionId]?.title;
      if (typeof title === 'string' && title.trim() !== '') return title;
      if (typeof item.sessionTitle === 'string' && item.sessionTitle.trim() !== '') return item.sessionTitle;
      return item.sessionId;
    }
