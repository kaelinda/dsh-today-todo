/**
 * Build-artifact guard.
 *
 * `client.js` is shipped to the browser, but the maintainable source lives in
 * `src/client/`. This test fails when someone edits the artifact directly or
 * forgets `npm run build`, so the committed file cannot silently drift.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { Script } from 'node:vm';

import { buildClient } from '../scripts/build-client.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const ARTIFACT = join(ROOT, 'client.js');

test('client.js is exactly the artifact generated from src/client', () => {
  const committed = readFileSync(ARTIFACT, 'utf8');
  assert.equal(committed, buildClient(), 'run `npm run build` after editing src/client');
});

test('the generated artifact contains no unresolved include markers', () => {
  const committed = readFileSync(ARTIFACT, 'utf8');
  assert.doesNotMatch(committed, /\/\/ @include/);
  assert.doesNotMatch(committed, /\/\/ @bundle/);
  assert.match(committed, /window\.__ModuleLoader__\.load\(\{/);
  assert.match(committed, /id: 'dsh-todos'/);
});

test('the bundled vendor code remains valid JavaScript inside the Host factory', () => {
  const artifact = readFileSync(ARTIFACT, 'utf8');
  assert.doesNotThrow(() => new Script(artifact));
  assert.match(artifact, /getSceneRuntime/);
  for (const scene of ['createFocusScene', 'projectHealth', 'activityGrid']) assert.match(artifact, new RegExp(scene));
  assert.match(readFileSync(join(ROOT, 'THIRD_PARTY_NOTICES.md'), 'utf8'), /three\.js authors/);
});
