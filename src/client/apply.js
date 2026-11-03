    /**
     * Register the sidebar entry and the panel it selects.
     * @param ctx - browser plugin context.
     */
    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-todos: dictionaries');
      const t = ctx.locale.bind(NS);

      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist',
        id: PANEL_ID,
        order: 20,
        locale: NS,
        label: () => t('panel'),
      }, TodoIcon));

      ctx.slots.inject('main', () => ctx.slots.register({
        name: 'main',
        key: PANEL_ID,
        locale: NS,
        inject: () => ({
          openSession: (sessionId) => ctx.uiWorkspace.openSession(sessionId),
        }),
      }, TodoPage));
    }
