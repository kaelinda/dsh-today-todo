import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { apply } from '../index.js';

test('Host activation shares project/report state with tools and disposes registrations', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-workbench-host-'));
  const routes = new Map();
  const tools = new Map();
  const disposers = [];
  const ctx = {
    inject(keys, callback) { if (keys.every((key) => this[key])) callback(this); },
    effect(fn) { disposers.push(fn()); },
    webServer: { register(route) { routes.set(route.path, route); return () => routes.delete(route.path); } },
    tools: { register(tool) { tools.set(tool.name, tool); return () => tools.delete(tool.name); } },
  };
  try {
    apply(ctx, { dataFile: join(dir, 'todos.json') });
    assert.equal(tools.size, 7);
    assert.equal(routes.size, 2);
    const result = await tools.get('work_project').execute({ action: 'save', name: 'Host integration' });
    assert.equal(result.ok, true);
    let status; let body;
    await routes.get('/plugins/dsh-todos/state').handler({ method: 'GET', socket: { remoteAddress: '127.0.0.1' }, headers: { host: 'localhost' } },
      { writeHead(value) { status = value; }, end(value) { body = JSON.parse(value); } });
    assert.equal(status, 200);
    assert.equal(body.projects[0].name, 'Host integration');
    assert.equal(body.automation.state, 'running');
    assert.deepEqual(body.diagnostics, { api: 'registered', tool: 'registered' });
  } finally {
    for (const dispose of disposers.reverse()) dispose?.();
    rmSync(dir, { recursive: true, force: true });
  }
  assert.equal(tools.size, 0);
  assert.equal(routes.size, 0);
});
