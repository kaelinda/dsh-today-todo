import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFrameLoop } from '../src/client/focus-motion.js';

function rig() {
  let nextId = 0;
  let animated = true;
  const pending = new Map();
  const draws = [];
  const loop = createFrameLoop(delta => draws.push(delta), () => animated, {
    requestAnimationFrame(callback) { const id = ++nextId; pending.set(id, callback); return id; },
    cancelAnimationFrame(id) { pending.delete(id); },
  });
  return {
    loop, draws, pending,
    setAnimated(value) { animated = value; },
    frame(time) { const callbacks = [...pending.values()]; pending.clear(); callbacks.forEach(callback => callback(time)); },
  };
}

test('scene loop caps work at 30fps and coalesces repeated state updates', () => {
  const r = rig();
  r.loop.invalidate(); r.loop.invalidate(); r.loop.invalidate();
  assert.equal(r.pending.size, 1);
  for (const time of [0, 16, 32, 48, 64, 80, 96]) r.frame(time);
  assert.equal(r.draws.length, 3);
  assert.equal(r.pending.size, 1);
  r.loop.dispose();
});

test('pause/reduced motion cancel RAF and paint once; resume has no elapsed-time jump', () => {
  const r = rig();
  r.loop.invalidate(); r.frame(0); r.frame(40);
  r.setAnimated(false); r.loop.invalidate();
  assert.equal(r.pending.size, 0);
  assert.equal(r.draws.at(-1), 0);
  const count = r.draws.length;
  r.frame(8000);
  assert.equal(r.draws.length, count);
  r.setAnimated(true); r.loop.invalidate(); r.frame(9000);
  assert.equal(r.draws.at(-1), 0);
  r.frame(10000);
  assert.equal(r.draws.at(-1), 0.06, 'long frames are clamped');
  r.loop.dispose();
});

test('unmount cancels the pending frame and late callbacks cannot render or restart', () => {
  const r = rig();
  r.loop.invalidate();
  const late = [...r.pending.values()][0];
  r.loop.dispose(); r.loop.dispose();
  assert.equal(r.pending.size, 0);
  late(2000); r.loop.invalidate();
  assert.equal(r.pending.size, 0);
  assert.equal(r.draws.length, 0);
});
