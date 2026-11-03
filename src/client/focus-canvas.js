    // Three.js is initialized only when Today mounts; ordinary lists stay cheap.
    let focusSceneRuntime = null;
    function getFocusSceneRuntime() {
      if (focusSceneRuntime === null) {
        // @bundle focus-scene
        focusSceneRuntime = DSHFocusScene;
      }
      return focusSceneRuntime;
    }

    function FocusCanvas({ mode, progress, completed, motion }) {
      const mount = useRef(null);
      const controller = useRef(null);
      useEffect(() => {
        const element = mount.current;
        try {
          controller.current = getFocusSceneRuntime().createFocusScene(element, { mode, progress, completed, motion });
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
