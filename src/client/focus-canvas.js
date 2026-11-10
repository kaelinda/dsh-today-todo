    // Three.js and every scene are evaluated only when a 3D view first mounts;
    // ordinary lists stay cheap.
    let sceneRuntime = null;
    function getSceneRuntime() {
      if (sceneRuntime === null) {
        // @bundle scenes
        sceneRuntime = DSHScenes;
      }
      return sceneRuntime;
    }

    function FocusCanvas({ mode, progress, completed, motion }) {
      const mount = useRef(null);
      const controller = useRef(null);
      useEffect(() => {
        const element = mount.current;
        try {
          controller.current = getSceneRuntime().createFocusScene(element, { mode, progress, completed, motion });
        } catch {
          // A visual enhancement must never block the task list or timer.
          element.dataset.renderer = 'fallback';
        }
        return () => {
          controller.current?.dispose();
          controller.current = null;
        };
      }, []);
      useEffect(() => {
        controller.current?.update({ mode, progress, completed, motion });
      }, [mode, progress, completed, motion]);
      return h('div', { ref: mount, className: 'dsh-todos-orbitCanvas', 'aria-hidden': true },
        h('div', { className: 'dsh-todos-orbitFallback' },
          h('span'), h('span'), h('span')));
    }

    /** Resolve Host theme tokens to plain hex, whatever colour syntax they use. */
    let paletteProbe = null;
    function readScenePalette(element) {
      const style = getComputedStyle(element);
      paletteProbe ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true });
      const hex = (name, fallback) => {
        paletteProbe.clearRect(0, 0, 1, 1);
        paletteProbe.fillStyle = fallback;
        paletteProbe.fillStyle = style.getPropertyValue(name).trim() || fallback;
        paletteProbe.fillRect(0, 0, 1, 1);
        const [r, g, b] = paletteProbe.getImageData(0, 0, 1, 1).data;
        return `#${[r, g, b].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
      };
      return {
        accent: hex('--todo-accent', '#4176e6'), text: hex('--todo-text', '#202936'), muted: hex('--todo-muted', '#657080'),
        border: hex('--todo-border', '#e3e7ef'), bg: hex('--todo-bg', '#ffffff'),
        warn: hex('--dsw-alias-state-warn-primary', '#a86716'), error: hex('--dsw-alias-state-error-primary', '#c44242'),
      };
    }
    /** Follow the Host theme: it flips attributes on <html>/<body> rather than reloading. */
    function useScenePalette(ref) {
      const [palette, setPalette] = useState(null);
      useEffect(() => {
        const element = ref.current;
        if (!element) return undefined;
        let last = '';
        const read = () => {
          let next;
          try { next = readScenePalette(element); } catch { return; }
          const key = JSON.stringify(next);
          if (key !== last) { last = key; setPalette(next); }
        };
        read();
        const observer = new MutationObserver(read);
        for (const target of [document.documentElement, document.body]) {
          if (target) observer.observe(target, { attributes: true, attributeFilter: ['class', 'style', 'data-theme', 'data-ds-dark-theme'] });
        }
        const scheme = window.matchMedia('(prefers-color-scheme: dark)');
        scheme.addEventListener('change', read);
        return () => { observer.disconnect(); scheme.removeEventListener('change', read); };
      }, []);
      return palette;
    }

    /**
     * Mount one data scene. The canvas is aria-hidden decoration; `children`
     * render inside the same box (tooltips, centre labels). Without WebGL the
     * box collapses and the HTML beside it carries everything.
     */
    function DataScene({ kind, className, props, children }) {
      const mount = useRef(null);
      const controller = useRef(null);
      const palette = useScenePalette(mount);
      const latest = { ...props, palette };
      useEffect(() => {
        if (!palette) return undefined;
        const element = mount.current;
        try {
          controller.current = getSceneRuntime()[kind](element, latest);
        } catch {
          element.dataset.renderer = 'fallback';
        }
        return () => {
          controller.current?.dispose();
          controller.current = null;
        };
      }, [palette === null]);
      // Scenes diff by id and ease toward new targets, so updating per render is cheap.
      useEffect(() => { controller.current?.update(latest); });
      return h('div', { ref: mount, className: cx('dsh-wb-scene', className), 'data-renderer': 'pending' },
        h('div', { className: 'dsh-wb-sceneLayer' }, children));
    }

    /** Ease a displayed number toward its value; jumps when motion is off. */
    function useTweenedNumber(value, enabled) {
      const [shown, setShown] = useState(value);
      const from = useRef(value);
      useEffect(() => {
        if (!enabled || typeof requestAnimationFrame !== 'function' || from.current === value) {
          from.current = value; setShown(value); return undefined;
        }
        const origin = from.current;
        const started = performance.now();
        let frame = 0;
        const tick = (now) => {
          const progress = Math.min(1, (now - started) / 320);
          const next = Math.round(origin + (value - origin) * (1 - (1 - progress) ** 3));
          from.current = next; setShown(next);
          if (progress < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
      }, [value, enabled]);
      return shown;
    }

    /** Pure scene data, computed through the same lazily loaded runtime. */
    function sceneData(name, input, fallback) {
      try { return getSceneRuntime()[name](input); } catch { return fallback; }
    }
