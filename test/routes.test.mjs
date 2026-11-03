/**
 * Panel-route tests. These exercise the HTTP contract between the Host store
 * and the browser panel: status codes, the revision conflict payload, and the
 * loopback guard, without starting a real web server.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { MUTATE_PATH, registerTodoRoutes, STATE_PATH } from '../lib/routes.js';
import { createTodoStore } from '../lib/store.js';

/** A web-server stub that records exact routes by path. */
function makeWebServer() {
  const routes = new Map();
  return {
    routes,
    register(definition) {
      routes.set(definition.path, definition);
      return () => routes.delete(definition.path);
    },
  };
}

/** A Node-request stub with an optional JSON body. */
function makeRequest({ method = 'GET', body, remoteAddress = '127.0.0.1', headers } = {}) {
  return {
    method,
    socket: { remoteAddress },
    headers: headers ?? { host: '127.0.0.1:5173' },
    async *[Symbol.asyncIterator]() {
      if (body !== undefined) yield Buffer.from(JSON.stringify(body), 'utf8');
    },
  };
}

/** A Node-response stub that parses the JSON body when there is one. */
function makeResponse() {
  const result = { status: null, headers: null, body: null };
  return {
    result,
    writeHead(status, headers) {
      result.status = status;
      result.headers = headers;
    },
    end(payload) {
      result.body = payload === undefined || payload === '' ? null : JSON.parse(payload);
    },
  };
}

test('state route returns revision, Host today, items, and diagnostics', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-todos-routes-'));
  try {
    const store = createTodoStore({ file: join(dir, 'todos.json'), warn: () => {} });
    store.apply({ op: 'add', title: 'Route parity' });
    const server = makeWebServer();
    registerTodoRoutes(server, store, { api: 'registered', tool: 'registered' });
    const route = server.routes.get(STATE_PATH);
    assert.ok(route);

    const response = makeResponse();
    await route.handler(makeRequest(), response);
    assert.equal(response.result.status, 200);
    assert.equal(response.result.body.ok, true);
    assert.equal(response.result.body.revision, 2);
    assert.match(response.result.body.todayDate, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(response.result.body.items[0].title, 'Route parity');
    assert.deepEqual(response.result.body.diagnostics, { api: 'registered', tool: 'registered' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('mutate route maps revision conflicts to 409 and includes the snapshot', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-todos-routes-'));
  try {
    const store = createTodoStore({ file: join(dir, 'todos.json'), warn: () => {} });
    const first = store.apply({ op: 'add', title: 'first' });
    const server = makeWebServer();
    registerTodoRoutes(server, store);
    const route = server.routes.get(MUTATE_PATH);
    assert.ok(route);

    const stale = makeResponse();
    await route.handler(makeRequest({
      method: 'POST',
      body: { op: 'add', title: 'stale', baseRevision: 1 },
    }), stale);
    assert.equal(stale.result.status, 409);
    assert.equal(stale.result.body.code, 'todo_revision_conflict');
    assert.equal(stale.result.body.snapshot.revision, first.snapshot.revision);
    assert.equal(stale.result.body.snapshot.items.length, 1);

    const fresh = makeResponse();
    await route.handler(makeRequest({
      method: 'POST',
      body: { op: 'add', title: 'fresh', baseRevision: first.snapshot.revision },
    }), fresh);
    assert.equal(fresh.result.status, 200);
    assert.equal(fresh.result.body.ok, true);
    assert.equal(fresh.result.body.items.length, 2);

    const missing = makeResponse();
    await route.handler(makeRequest({
      method: 'POST',
      body: { op: 'update', id: 'missing', done: true },
    }), missing);
    assert.equal(missing.result.status, 404);
    assert.equal(missing.result.body.code, 'todo_not_found');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('routes reject remote callers, wrong methods, and invalid bodies', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-todos-routes-'));
  try {
    const store = createTodoStore({ file: join(dir, 'todos.json'), warn: () => {} });
    const server = makeWebServer();
    registerTodoRoutes(server, store);
    const state = server.routes.get(STATE_PATH);
    const mutate = server.routes.get(MUTATE_PATH);

    const remote = makeResponse();
    await state.handler(makeRequest({ remoteAddress: '10.0.0.7', headers: { host: '10.0.0.7:5173' } }), remote);
    assert.equal(remote.result.status, 403);

    const wrongMethod = makeResponse();
    await state.handler(makeRequest({ method: 'POST' }), wrongMethod);
    assert.equal(wrongMethod.result.status, 405);

    const badBody = makeResponse();
    await mutate.handler(makeRequest({ method: 'POST', body: ['not', 'an', 'object'] }), badBody);
    assert.equal(badBody.result.status, 400);
    assert.equal(badBody.result.body.code, 'todo_bad_request');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
