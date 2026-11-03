/**
 * Assemble `client.js` from the small sources in `src/client/`.
 *
 * The DSH browser artifact must be a single lazy factory, so the shipped file
 * stays one script; the build is a deterministic include pass rather than a
 * dependency-heavy bundler. Editing `client.js` directly is a mistake: run
 * `npm run build` so the generated artifact picks up the source change.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SOURCE_DIR = join(ROOT, 'src', 'client');
const ENTRY = join(SOURCE_DIR, 'index.js');
const OUTPUT = join(ROOT, 'client.js');
const INCLUDE = /^([ \t]*)\/\/ @include[ \t]+(.+?)[ \t]*$/gm;

/**
 * Expand one file's `// @include` directives recursively.
 * @param file - absolute source file.
 * @param stack - files currently being expanded, for cycle detection.
 * @returns source text with every include replaced by its file contents.
 */
function expand(file, stack = []) {
  if (stack.includes(file)) {
    throw new Error(`client build: include cycle: ${[...stack, file].join(' -> ')}`);
  }
  const source = readFileSync(file, 'utf8');
  return source.replace(INCLUDE, (_match, _indent, spec) => {
    const target = resolve(dirname(file), spec.trim());
    if (target !== SOURCE_DIR && !target.startsWith(`${SOURCE_DIR}${sep}`)) {
      throw new Error(`client build: include escapes src/client: ${spec}`);
    }
    return expand(target, [...stack, file]).trimEnd();
  });
}

/**
 * Build the browser artifact without touching disk.
 * @returns the exact text `client.js` should contain.
 */
export function buildClient() {
  return expand(ENTRY);
}

/**
 * Write the artifact if it changed.
 * @returns `{ changed, text }`.
 */
export function writeClient() {
  const text = buildClient();
  let current = null;
  try {
    current = readFileSync(OUTPUT, 'utf8');
  } catch {
    current = null;
  }
  const changed = current !== text;
  if (changed) writeFileSync(OUTPUT, text, 'utf8');
  return { changed, text };
}

if (process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const { changed } = writeClient();
  console.log(`client.js ${changed ? 'rebuilt' : 'is already current'}`);
}
