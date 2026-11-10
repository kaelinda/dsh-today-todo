    // The bundle (Three.js for the focus scene, plus pure workbench data shaping)
    // is evaluated on first use, not at plugin load.
    // ponytail: the data helpers share the bundle, so Projects/Planning/Review also evaluate Three.js; split if that shows up in profiles.
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
