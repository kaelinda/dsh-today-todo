    /** Inline SVG marks reused by the panel rows. */
    function IconCheck() {
      return h('svg', { width: 12, height: 12, viewBox: '0 0 12 12', fill: 'none', 'aria-hidden': true },
        h('path', { d: 'M2.2 6.3l2.4 2.4 5-5.2', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }));
    }

    function IconPencil() {
      return h('svg', { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
        h('path', { d: 'M10.8 2.7l2.5 2.5-7.1 7.1-3.2.7.7-3.2 7.1-7.1z', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round' }));
    }

    function IconTrash() {
      return h('svg', { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
        h('path', { d: 'M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.2h5.8l.6-8.2', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round' }));
    }

    function IconArrow() {
      return h('svg', { width: 12, height: 12, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
        h('path', { d: 'M4 12l8-8M4.5 4H12v7.5', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }));
    }

    function IconClose() {
      return h('svg', { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
        h('path', { d: 'M4 4l8 8M12 4l-8 8', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' }));
    }

    function IconChevron({ open }) {
      return h('svg', {
        width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true,
        style: { transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .12s' },
      },
      h('path', { d: 'M6 3.5L10.5 8 6 12.5', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }));
    }

    function IconPlus() {
      return h('svg', { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
        h('path', { d: 'M8 3.4v9.2M3.4 8h9.2', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' }));
    }

    function IconList() {
      return h('svg', { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
        h('path', { d: 'M6.5 4h7M6.5 8h7M6.5 12h7M2.5 4h.5M2.5 8h.5M2.5 12h.5', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' }));
    }

    function IconMatrix() {
      return h('svg', { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
        ...[[2, 2], [9, 2], [2, 9], [9, 9]].map(([x, y]) => h('rect', {
          key: `${x}-${y}`, x, y, width: 5, height: 5, rx: 1.2, stroke: 'currentColor', strokeWidth: 1.3,
        })));
    }

    function IconFilter() {
      return h('svg', { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
        h('path', { d: 'M2.5 3.5h11L9.4 8.2v4.1l-2.8-1.4V8.2L2.5 3.5z', stroke: 'currentColor', strokeWidth: 1.2, strokeLinejoin: 'round' }));
    }

    function IconTimer() {
      return h('svg', { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
        h('circle', { cx: 8, cy: 8, r: 5.6, stroke: 'currentColor', strokeWidth: 1.3 }),
        h('path', { d: 'M8 4.9V8l2.1 1.5', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round' }),
        h('path', { d: 'M6.4 1.6h3.2', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round' }));
    }

    function IconPlay() {
      return h('svg', { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
        h('path', { d: 'M5 3l7 5-7 5V3z', stroke: 'currentColor', strokeWidth: 1.4, strokeLinejoin: 'round' }));
    }

    function IconPause() {
      return h('svg', { width: 16, height: 16, viewBox: '0 0 16 16', 'aria-hidden': true },
        h('path', { d: 'M5 3v10M11 3v10', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' }));
    }

    function IconStop() {
      return h('svg', { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
        h('rect', { x: 4, y: 4, width: 8, height: 8, rx: 1.5, stroke: 'currentColor', strokeWidth: 1.4 }));
    }

    function IconOrbit() {
      return h('svg', { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
        h('ellipse', { cx: 8, cy: 8, rx: 7, ry: 3.4, transform: 'rotate(-35 8 8)', stroke: 'currentColor', strokeWidth: 1.1 }),
        h('circle', { cx: 8, cy: 8, r: 1.5, fill: 'currentColor' }));
    }

    function IconSun({ filled }) {
      return h('svg', { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
        h('circle', { cx: 8, cy: 8, r: 3, stroke: 'currentColor', strokeWidth: 1.3, fill: filled ? 'currentColor' : 'none' }),
        h('path', {
          d: 'M8 1.4v1.6M8 13v1.6M1.4 8h1.6M13 8h1.6M3.3 3.3l1.1 1.1M11.6 11.6l1.1 1.1M12.7 3.3l-1.1 1.1M4.4 11.6l-1.1 1.1',
          stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round',
        }));
    }
