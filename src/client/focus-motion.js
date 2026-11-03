/** A capped, cancellable RAF loop. Static modes paint once, then release the CPU. */
export function createFrameLoop(draw, isAnimated, platform = globalThis) {
  let frame = null;
  let previous = null;
  let disposed = false;
  const cancel = () => {
    if (frame !== null) platform.cancelAnimationFrame(frame);
    frame = null;
    previous = null;
  };
  const tick = (time) => {
    frame = null;
    if (disposed || !isAnimated()) return;
    if (previous === null || time - previous >= 1000 / 30) {
      const delta = previous === null ? 0 : Math.min((time - previous) / 1000, 0.06);
      previous = time;
      draw(delta);
    }
    if (!disposed && isAnimated()) frame = platform.requestAnimationFrame(tick);
  };
  return {
    invalidate() {
      if (disposed) return;
      if (!isAnimated()) {
        cancel();
        draw(0);
      } else if (frame === null) {
        frame = platform.requestAnimationFrame(tick);
      }
    },
    dispose() { disposed = true; cancel(); },
  };
}
