/**
 * Smoke tests for the dsh-todos bundle.
 *
 * Dependency-free: the client half is executed once against a minimal React
 * stub, so a render path that references something undefined (the original
 * `renderMatrix` bug) fails here instead of white-screening the panel.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createTodoStore, localDateKey } from '../lib/store.js';
import { registerTodoTool } from '../lib/tool.js';
import { isLoopbackRequest } from '../lib/routes.js';

/** Build one normalized todo, overriding only what a test cares about. */
function todo(overrides = {}) {
  const now = Date.now();
  return {
    id: 'todo-1',
    title: 'Ship it',
    done: false,
    createdAt: now,
    updatedAt: now,
    sessionId: null,
    sessionTitle: null,
    tags: [],
    priority: null,
    quadrant: null,
    todayDate: null,
    todayAt: null,
    ...overrides,
  };
}

/**
 * Minimal React replacement. Hooks are eager, so one call to a component
 * produces a plain element tree; `stateOverrides` forces a specific `useState`
 * call by index so a test can land on the view it wants.
 */
function makeReact(stateOverrides = {}) {
  let index = 0;
  return {
    createElement(type, props, ...children) {
      return { type, props: props ?? {}, children: children.flat() };
    },
    useState(initial) {
      const current = index++;
      const value = current in stateOverrides
        ? stateOverrides[current]
        : typeof initial === 'function' ? initial() : initial;
      return [value, () => {}];
    },
    useMemo(factory) {
      return factory();
    },
    useCallback(fn) {
      return fn;
    },
    useEffect() {},
  };
}

/** Every className string in an element tree, in document order. */
function classNames(node, out = []) {
  if (Array.isArray(node)) {
    for (const child of node) classNames(child, out);
    return out;
  }
  if (node === null || typeof node !== 'object') return out;
  const className = node.props?.className;
  if (typeof className === 'string') out.push(className);
  for (const child of node.children ?? []) classNames(child, out);
  return out;
}

/** All text nodes joined, for readable content assertions. */
function textOf(node, out = []) {
  if (Array.isArray(node)) {
    for (const child of node) textOf(child, out);
    return out;
  }
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node));
    return out;
  }
  if (node === null || typeof node !== 'object') return out;
  for (const child of node.children ?? []) textOf(child, out);
  return out;
}

/** All string values held in one element prop, in document order. */
function propValues(node, name, out = []) {
  if (Array.isArray(node)) {
    for (const child of node) propValues(child, name, out);
    return out;
  }
  if (node === null || typeof node !== 'object') return out;
  const value = node.props?.[name];
  if (typeof value === 'string') out.push(value);
  for (const child of node.children ?? []) propValues(child, name, out);
  return out;
}

/** First element in the tree matching a predicate. */
function findElement(node, predicate) {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElement(child, predicate);
      if (found !== null) return found;
    }
    return null;
  }
  if (node === null || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const child of node.children ?? []) {
    const found = findElement(child, predicate);
    if (found !== null) return found;
  }
  return null;
}

let factory = null;
let clientLoaded = false;

/** Load the client module once (it is a browser script with a side effect). */
async function loadFactory() {
  if (clientLoaded) return factory;
  globalThis.window = {
    __ModuleLoader__: {
      load(entry) {
        factory = entry.factory;
      },
    },
  };
  globalThis.localStorage = {
    getItem: () => null,
    setItem() {},
    removeItem() {},
  };
  await import('../client.js');
  clientLoaded = true;
  return factory;
}

/** Render the panel once, forcing the `useState` calls a test needs. */
async function renderPanel(stateOverrides) {
  const moduleFactory = await loadFactory();
  const module = moduleFactory((name) => (name === 'react' ? makeReact(stateOverrides) : {}));
  let component = null;
  const ctx = {
    locale: {
      register: () => () => {},
      bind: () => (key) => key,
    },
    slots: {
      inject(_name, fn) {
        fn();
      },
      register(slot, candidate) {
        if (slot.name === 'main') component = candidate;
        return () => {};
      },
    },
    effect: () => () => {},
    uiWorkspace: { openSession() {} },
  };
  module.apply(ctx);
  assert.ok(component, 'the main slot was registered');
  return component({
    t: (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key),
    useSessions: () => ({ ids: [], byId: {}, phase: 'ready' }),
    useWorkspaces: () => ({ phase: 'ready', state: 'ready', archivedSessionIds: [] }),
    openSession() {},
  });
}

test('client renders the list view', async () => {
  const tree = await renderPanel({
    0: {
      phase: 'ready',
      revision: 1,
      error: null,
      items: [todo(), todo({ id: 'todo-2', title: 'Second', done: true })],
    },
    5: 'list',
  });
  const classes = classNames(tree);
  assert.ok(classes.some((name) => name.split(' ').includes('dsh-todos-page')));
  assert.ok(classes.some((name) => name.split(' ').includes('dsh-todos-list')));
  assert.match(textOf(tree).join(' '), /Ship it/);
});

test('client renders all four quadrants plus the unclassified bucket', async () => {
  const tree = await renderPanel({
    0: {
      phase: 'ready',
      revision: 1,
      error: null,
      items: [
        todo({ id: 'q1', title: 'Urgent and important', quadrant: 'q1' }),
        todo({ id: 'q2', title: 'Important only', quadrant: 'q2' }),
        todo({ id: 'q3', title: 'Urgent only', quadrant: 'q3' }),
        todo({ id: 'q4', title: 'Neither', quadrant: 'q4' }),
        todo({ id: 'none', title: 'Unclassified work', quadrant: null }),
      ],
    },
    5: 'matrix',
  });
  const classes = classNames(tree);
  const cells = classes.filter((name) => name.split(' ').includes('dsh-todos-matrixCell'));
  assert.equal(cells.length, 5, 'four quadrants plus the unclassified bucket');
  const text = textOf(tree).join(' ');
  assert.match(text, /Urgent and important/);
  assert.match(text, /Unclassified work/);
});

test('client renders every picker string instead of falling back to a raw key', async () => {
  const tree = await renderPanel({
    0: {
      phase: 'ready',
      revision: 1,
      todayDate: localDateKey(),
      error: null,
      items: [todo()],
    },
    8: 'todo-1',
  });
  const text = textOf(tree).join(' ');
  const labels = [...propValues(tree, 'title'), ...propValues(tree, 'aria-label'), ...propValues(tree, 'placeholder')].join(' ');
  assert.match(text, /picker\.title/);
  assert.match(text, /picker\.empty/);
  assert.match(labels, /picker\.search/);
  assert.match(labels, /picker\.close/);
});

test('client takes "today" from the Host, not the browser clock', async () => {
  const hostDay = '2030-01-01';
  const tree = await renderPanel({
    0: {
      phase: 'ready',
      revision: 1,
      todayDate: hostDay,
      error: null,
      items: [
        todo({ id: 'host-day', title: 'Host day item', todayDate: hostDay }),
        todo({ id: 'browser-day', title: 'Browser day item', todayDate: localDateKey() }),
      ],
    },
    2: 'today',
  });
  const text = textOf(tree).join(' ');
  assert.match(text, /Host day item/);
  assert.doesNotMatch(text, /Browser day item/);
});

test('client replays one revision conflict on the Host snapshot', async () => {
  const baseTodo = todo();
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    if (calls.length === 1) {
      return {
        ok: false,
        status: 409,
        async json() {
          return {
            ok: false,
            code: 'todo_revision_conflict',
            message: 'conflict',
            snapshot: { items: [baseTodo], revision: 2, todayDate: localDateKey() },
          };
        },
      };
    }
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          ok: true,
          items: [{ ...baseTodo, done: true }],
          revision: 3,
          todayDate: localDateKey(),
        };
      },
    };
  };
  try {
    const tree = await renderPanel({
      0: {
        phase: 'ready',
        revision: 1,
        todayDate: localDateKey(),
        error: null,
        items: [baseTodo],
      },
    });
    const checkbox = findElement(tree, (node) => node.props?.role === 'checkbox');
    assert.ok(checkbox, 'the row checkbox was rendered');
    checkbox.props.onClick();
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(calls.length, 2, 'the mutation was retried once');
    assert.equal(calls[0].baseRevision, 1);
    assert.equal(calls[1].baseRevision, 2, 'the retry uses the conflict snapshot revision');
    assert.equal(calls[1].done, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('store normalizes, persists, and round-trips mutations', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-todos-'));
  try {
    const store = createTodoStore({ file: join(dir, 'todos.json') });
    const added = store.apply({
      op: 'add',
      title: '  Ship   the  panel ',
      priority: 'p1',
      quadrant: 'Q3',
      tags: ['#panel', 'Panel', ' docs '],
      today: true,
    });
    assert.equal(added.ok, true);
    assert.equal(added.snapshot.items.length, 1);
    const item = added.snapshot.items[0];
    assert.equal(item.title, 'Ship the panel');
    assert.equal(item.priority, 'P1');
    assert.equal(item.quadrant, 'q3');
    assert.deepEqual(item.tags, ['panel', 'docs']);
    assert.equal(item.todayDate, localDateKey());
    assert.match(item.todayDate, /^\d{4}-\d{2}-\d{2}$/);

    const updated = store.apply({ op: 'update', id: item.id, done: true, today: false });
    assert.equal(updated.ok, true);
    assert.equal(updated.snapshot.items[0].done, true);
    assert.equal(updated.snapshot.items[0].todayDate, null);

    const removed = store.apply({ op: 'remove', id: item.id });
    assert.equal(removed.ok, true);
    assert.equal(removed.snapshot.items.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('store rejects bad input and degrades a corrupted file to empty', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-todos-'));
  try {
    const file = join(dir, 'todos.json');
    const store = createTodoStore({ file });
    assert.equal(store.apply({ op: 'add', title: '   ' }).code, 'todo_title_required');
    assert.equal(store.apply({ op: 'nope' }).code, 'todo_unknown_op');
    assert.equal(store.apply({ op: 'update', id: 'missing', done: true }).code, 'todo_not_found');

    writeFileSync(file, '{ not json', 'utf8');
    const degraded = createTodoStore({ file, warn: () => {} });
    assert.deepEqual(degraded.snapshot().items, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('tool lists items numbered from 1', async () => {
  let definition = null;
  const tools = {
    register(candidate) {
      definition = candidate;
      return () => {};
    },
  };
  const dir = mkdtempSync(join(tmpdir(), 'dsh-todos-'));
  try {
    const store = createTodoStore({ file: join(dir, 'todos.json') });
    registerTodoTool(tools, store);
    assert.ok(definition, 'the tool was registered');
    assert.equal(definition.name, 'todo_track');

    await definition.execute({ action: 'add', title: 'first' });
    const listed = await definition.execute({ action: 'list' });
    assert.equal(listed.ok, true);
    assert.match(listed.message, /^1\. \[ \] first$/m);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loopback guard rejects remote and cross-origin callers', () => {
  const req = (remoteAddress, headers) => ({ socket: { remoteAddress }, headers: headers ?? {} });
  assert.equal(isLoopbackRequest(req('127.0.0.1', { host: '127.0.0.1:5173' })), true);
  assert.equal(isLoopbackRequest(req('::1', { host: '[::1]:5173' })), true);
  assert.equal(isLoopbackRequest(req('127.0.0.1', {})), true, 'local caller without Host/Origin');
  assert.equal(isLoopbackRequest(req('10.1.2.3', { host: '10.1.2.3:5173' })), false, 'remote caller');
  assert.equal(
    isLoopbackRequest(req('127.0.0.1', { host: '127.0.0.1:5173', origin: 'http://evil.example' })),
    false,
    'cross-origin page',
  );
  assert.equal(
    isLoopbackRequest(req('127.0.0.1', { host: '127.0.0.1:5173', origin: 'http://127.0.0.1:5173' })),
    true,
    'same-origin page',
  );
  assert.equal(isLoopbackRequest(req('127.0.0.1', { host: 'evil.example:80' })), false, 'foreign Host');
});
