import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

function harness(overrides = {}) {
  let saved = null;
  let index = 0;
  const effects = [];
  const states = { 0: { phase: 'ready', revision: 1, todayDate: '2026-11-04', items: [], error: null }, 2: 'today', ...overrides };
  const context = vm.createContext({
    Date, Intl, console, setTimeout, STYLE: "",
    window: {},
    localStorage: { getItem: () => saved, setItem: (_key, value) => { saved = value; } },
    h: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat() }),
    FocusCanvas: () => null,
    useState(initial) {
      const key = index++;
      if (!(key in states)) states[key] = typeof initial === 'function' ? initial() : initial;
      return [states[key], (next) => { states[key] = typeof next === 'function' ? next(states[key]) : next; }];
    },
    useMemo: (fn) => fn(), useCallback: (fn) => fn, useEffect(fn) { effects.push(fn); },
  });
  for (const name of ['constants', 'helpers', 'icons', 'pomodoro', 'page']) {
    vm.runInContext(readFileSync(new URL(`../src/client/${name}.js`, import.meta.url), 'utf8'), context);
  }
  return { states, context, effects, render() { index = 0; effects.length = 0; return context.TodoPage({ t: (key, args) => args ? `${key}:${JSON.stringify(args)}` : key }); },
    save(value) { saved = JSON.stringify(value); } };
}
const item = (id, title = id) => ({ id, title, done: false, priority: null, tags: [], todayDate: '2026-11-04', createdAt: 1 });
function nodes(node) { return !node || typeof node !== 'object' ? [] : [node, ...(node.children ?? []).flatMap(nodes)]; }
function button(tree, label) { return nodes(tree).find((node) => node.type === 'button' && node.children.includes(label)); }

test('elapsed and long-expired reload retain the same task for review', () => {
  const h = harness();
  const started = h.context.focusPomodoro(item('a'), 1000);
  const done = h.context.advancePomodoro(started, started.endsAt + 1);
  assert.equal(done.taskId, 'a'); assert.equal(done.review, 'elapsed'); assert.equal(done.running, false);
  assert.equal(h.context.advancePomodoro(done, 9e9), done);
  h.save(started);
  const loaded = h.context.loadPomodoro();
  assert.equal(loaded.taskId, 'a'); assert.equal(loaded.review, 'elapsed');
});

test('blocked, paused, repeated review and resumed timers retain remainder and notes', () => {
  const h = harness();
  const started = h.context.focusPomodoro(item('a'), 1000);
  const blocked = { ...h.context.reviewPomodoro(started, 'blocked', 11000), obstacle: 'Need API docs' };
  const repeated = h.context.reviewPomodoro(blocked, 'blocked', 31000);
  assert.equal(repeated.pausedMs, 1490000);
  h.save(repeated);
  const restored = h.context.loadPomodoro();
  assert.equal(restored.obstacle, 'Need API docs');
  const resumed = h.context.focusPomodoro(item('a', 'Renamed'), 50000, restored);
  assert.equal(resumed.endsAt, 1540000); assert.equal(resumed.taskId, 'a'); assert.equal(resumed.round, 1);
  assert.equal(resumed.label, 'Renamed');
});

test('break completion waits for a decision and a new round stays bound', () => {
  const h = harness();
  const first = h.context.focusPomodoro(item('a'), 0);
  const rest = h.context.breakPomodoro(h.context.advancePomodoro(first, first.endsAt), first.endsAt);
  const ended = h.context.advancePomodoro(rest, rest.endsAt + 1);
  assert.equal(ended.review, 'breakDone'); assert.equal(ended.taskId, 'a');
  const second = h.context.focusPomodoro(item('a'), rest.endsAt + 100, ended);
  assert.equal(second.round, 2); assert.equal(second.pausedMs, 1500000);
  assert.equal(h.context.focusPomodoro({ ...item('a'), done: true }, 0), null);
});

test('UI requires explicit selection and repeated start does not replace the timer', () => {
  const h = harness({ 0: { phase: 'ready', items: [item('a'), item('b')], todayDate: '2026-11-04' } });
  let tree = h.render();
  assert.equal(button(tree, 'pomodoro.start').props.disabled, true);
  nodes(tree).find((n) => n.type === 'select').props.onChange({ target: { value: 'b' } });
  tree = h.render();
  const start = button(tree, 'pomodoro.start'); start.props.onClick();
  const original = h.states[15]; start.props.onClick();
  assert.equal(h.states[15], original); assert.equal(original.taskId, 'b');
  h.states[0].items = [item('c'), item('b', 'Updated title'), item('a')];
  tree = h.render();
  assert.ok(nodes(tree).some((n) => n.children.includes('pomodoro.sessionLabel:{"title":"Updated title"}')));
  button(tree, 'pomodoro.obstacle').props.onClick();
  tree = h.render();
  assert.ok(button(tree, 'pomodoro.completeTask'));
  button(tree, 'pomodoro.continueTask').props.onClick();
  assert.equal(h.states[15].taskId, 'b');
  button(h.render(), 'pomodoro.stop').props.onClick();
  button(h.render(), 'pomodoro.finishSession').props.onClick();
  assert.equal(h.states[15], null);
  assert.equal(button(h.render(), 'pomodoro.start').props.disabled, true);
});

test('deleted task review cannot complete or resume a different task', () => {
  const h = harness();
  h.states[15] = h.context.reviewPomodoro(h.context.focusPomodoro(item('missing'), Date.now()), 'missing', Date.now());
  h.states[0].items = [item('other')];
  const tree = h.render();
  assert.equal(button(tree, 'pomodoro.continueTask'), undefined);
  assert.equal(button(tree, 'pomodoro.completeTask'), undefined);
});

test('timer keeps ticking outside Today and external completion never switches task', () => {
  const h = harness();
  h.states[0].items = [item('a'), item('b')];
  h.states[15] = h.context.focusPomodoro(item('a'), Date.now());
  h.states[2] = 'all';
  let ticks = 0;
  h.context.window.setInterval = () => { ticks += 1; return 12; };
  h.context.window.clearInterval = () => {};
  h.render();
  const clockEffect = h.effects.find((fn) => String(fn).includes('setInterval(() => setNow'));
  const cleanup = clockEffect();
  assert.equal(ticks, 1); cleanup();
  h.states[0].items[0].done = true;
  h.render();
  h.effects.find((fn) => String(fn).includes("task ? 'taskDone'"))();
  assert.equal(h.states[15].taskId, 'a');
  assert.equal(h.states[15].review, 'taskDone');
  assert.equal(h.states[15].running, false);
});

test('failed completion preserves review and notes without starting a break', async () => {
  const h = harness();
  h.states[0].items = [item('a')];
  h.states[15] = { ...h.context.reviewPomodoro(h.context.focusPomodoro(item('a'), Date.now()), 'blocked', Date.now()), obstacle: 'Need docs' };
  h.context.sendMutation = async () => { throw Object.assign(new Error('Disk full'), { snapshot: { items: [item('a')], revision: 1, lastError: 'Disk full' } }); };
  await button(h.render(), 'pomodoro.completeTask').props.onClick();
  assert.equal(h.states[15].phase, 'focus'); assert.equal(h.states[15].review, 'blocked');
  assert.equal(h.states[15].obstacle, 'Need docs'); assert.equal(h.states[0].items[0].done, false);
  assert.equal(h.states[0].storageError, 'Disk full');
});

test('failed title save preserves typed edit', async () => {
  const h = harness();
  h.states[0].items = [item('a')];
  h.states[10] = { id: 'a', text: 'Revised title' };
  h.context.sendMutation = async () => { throw new Error('Disk full'); };
  const input = nodes(h.render()).find((n) => n.type === 'input' && n.props.value === 'Revised title');
  input.props.onBlur();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(h.states[10].text, 'Revised title');
});

test('completion double-click sends one request and starts one break', async () => {
  const h = harness();
  h.states[0].items = [item('a')];
  h.states[15] = h.context.reviewPomodoro(h.context.focusPomodoro(item('a'), Date.now()), 'elapsed', Date.now());
  let resolve; let requests = 0;
  h.context.sendMutation = () => { requests += 1; return new Promise((done) => { resolve = done; }); };
  const complete = button(h.render(), 'pomodoro.completeTask').props.onClick;
  const first = complete(); const second = complete();
  assert.equal(requests, 1);
  resolve({ items: [{ ...item('a'), done: true }], revision: 2 });
  await Promise.all([first, second]);
  assert.equal(h.states[15].phase, 'break'); assert.equal(h.states[15].taskId, 'a');
});

test('late lower-revision poll cannot undo a successful completion', async () => {
  const h = harness();
  h.states[0].items = [item('a')];
  h.states[15] = h.context.reviewPomodoro(h.context.focusPomodoro(item('a'), Date.now()), 'elapsed', Date.now());
  let resolveRead;
  h.context.readState = () => new Promise((resolve) => { resolveRead = resolve; });
  h.context.sendMutation = async () => ({ items: [{ ...item('a'), done: true }], revision: 2 });
  h.context.document = { visibilityState: 'visible' };
  Object.assign(h.context.window, { setInterval: () => 1, clearInterval() {}, addEventListener() {}, removeEventListener() {} });
  const tree = h.render();
  h.effects.find((fn) => String(fn).includes('let alive = true'))();
  await button(tree, 'pomodoro.completeTask').props.onClick();
  resolveRead({ items: [item('a')], revision: 1 });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(h.states[0].revision, 2); assert.equal(h.states[0].items[0].done, true);
});
