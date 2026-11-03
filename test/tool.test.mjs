/**
 * Agent-tool tests: pagination, filtering, and parity with the store mutation
 * path. The tool is registered into a tiny fake registry so the exact
 * definition the model sees is the one under test.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { createTodoStore } from '../lib/store.js';
import { registerTodoTool, TOOL_NAME } from '../lib/tool.js';

/** Build a store + registered tool over one temporary file. */
function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-todos-tool-'));
  const store = createTodoStore({ file: join(dir, 'todos.json'), warn: () => {} });
  let definition = null;
  const tools = {
    register(candidate) {
      definition = candidate;
      return () => {};
    },
  };
  registerTodoTool(tools, store);
  return {
    store,
    dir,
    definition,
    execute: (args) => definition.execute(args),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

/** Seed the five items used by the filter/paging assertions. */
async function seed(execute) {
  await execute({ action: 'add', title: 'Urgent and important', priority: 'P0', quadrant: 'q1', tags: ['docs', 'core'], today: true });
  await execute({ action: 'add', title: 'Important later', priority: 'P1', quadrant: 'q2', tags: ['docs'] });
  await execute({ action: 'add', title: 'Urgent but done', priority: 'P2', quadrant: 'q3', done: true });
  await execute({ action: 'add', title: 'Unranked note', tags: ['misc'] });
  await execute({ action: 'add', title: 'Another P1', priority: 'P1', quadrant: 'q1' });
}

test('tool registers with the documented name and list is concurrency-safe', () => {
  const context = setup();
  try {
    assert.ok(context.definition);
    assert.equal(context.definition.name, TOOL_NAME);
    assert.equal(context.definition.isConcurrencySafe({ action: 'list' }), true);
    assert.equal(context.definition.isConcurrencySafe({ action: 'add' }), false);
  } finally {
    context.cleanup();
  }
});

test('list pages with offset/limit and numbers rows by absolute position', async () => {
  const context = setup();
  try {
    await seed(context.execute);
    const page = await context.execute({ action: 'list', limit: 2, offset: 1 });
    assert.equal(page.ok, true);
    assert.equal(page.items.length, 2);
    assert.equal(page.total, 5);
    assert.equal(page.matched, 5);
    assert.equal(page.offset, 1);
    assert.equal(page.limit, 2);
    assert.equal(page.hasMore, true);
    assert.equal(typeof page.revision, 'number');
    assert.match(page.message, /^2\. /m, 'the first row keeps its absolute position');
    assert.match(page.message, /Showing 2–3 of 5/);
    assert.match(page.message, /offset=3/);
  } finally {
    context.cleanup();
  }
});

test('list filters by scope, priority, quadrant, tag, and title text', async () => {
  const context = setup();
  try {
    await seed(context.execute);
    const titles = (result) => result.items.map((item) => item.title).sort();

    const done = await context.execute({ action: 'list', scope: 'done' });
    assert.deepEqual(titles(done), ['Urgent but done']);

    const open = await context.execute({ action: 'list', scope: 'open' });
    assert.equal(open.items.length, 4);

    const today = await context.execute({ action: 'list', scope: 'today' });
    assert.deepEqual(titles(today), ['Urgent and important']);

    const p1 = await context.execute({ action: 'list', filterPriority: 'P1' });
    assert.deepEqual(titles(p1), ['Another P1', 'Important later']);

    const unranked = await context.execute({ action: 'list', filterPriority: 'none' });
    assert.deepEqual(titles(unranked), ['Unranked note']);

    const q1 = await context.execute({ action: 'list', filterQuadrant: 'q1' });
    assert.deepEqual(titles(q1), ['Another P1', 'Urgent and important']);

    const tagged = await context.execute({ action: 'list', filterTag: '#docs' });
    assert.deepEqual(titles(tagged), ['Important later', 'Urgent and important']);

    const search = await context.execute({ action: 'list', filterQuery: 'LATER' });
    assert.deepEqual(titles(search), ['Important later']);

    const combined = await context.execute({
      action: 'list',
      scope: 'open',
      filterPriority: 'P1',
      filterQuadrant: 'q1',
    });
    assert.deepEqual(titles(combined), ['Another P1']);
    assert.match(combined.message, /filtered from 5/);
  } finally {
    context.cleanup();
  }
});

test('list rejects malformed paging and filter arguments', async () => {
  const context = setup();
  try {
    for (const args of [
      { action: 'list', limit: 0 },
      { action: 'list', limit: 201 },
      { action: 'list', offset: -1 },
      { action: 'list', scope: 'everything' },
      { action: 'list', filterPriority: 'P9' },
      { action: 'list', filterQuadrant: 'q9' },
    ]) {
      const result = await context.execute(args);
      assert.equal(result.ok, false, JSON.stringify(args));
      assert.equal(result.code, 'todo_bad_request', JSON.stringify(args));
    }
  } finally {
    context.cleanup();
  }
});

test('mutations still go through the store and return a bounded page', async () => {
  const context = setup();
  try {
    const added = await context.execute({ action: 'add', title: 'Fresh', priority: 'P0' });
    assert.equal(added.ok, true);
    assert.match(added.message, /^Added todo/);
    assert.equal(added.items[0].title, 'Fresh');
    assert.equal(added.total, 1);
    assert.equal(added.hasMore, false);

    const updated = await context.execute({ action: 'update', id: added.items[0].id, done: true });
    assert.equal(updated.ok, true);
    assert.equal(updated.items[0].done, true);

    const removed = await context.execute({ action: 'remove', id: added.items[0].id });
    assert.equal(removed.ok, true);
    assert.equal(removed.items.length, 0);

    const unknown = await context.execute({ action: 'nope' });
    assert.equal(unknown.ok, false);
    assert.equal(unknown.code, 'todo_unknown_op');
  } finally {
    context.cleanup();
  }
});
