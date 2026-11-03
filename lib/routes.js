/**
 * Loopback JSON API for the todo panel.
 *
 * The panel is a browser Client without a generated Remote namespace, so the
 * Host exposes the store over two same-origin routes. Every request is
 * restricted to loopback callers with a loopback Host header, and a browser
 * Origin must match the Host it addresses, so a foreign page cannot mutate the
 * list through the user's browser.
 */

/** Path of the read endpoint. */
export const STATE_PATH = '/plugins/dsh-todos/state';
/** Path of the single mutation endpoint. */
export const MUTATE_PATH = '/plugins/dsh-todos/mutate';
/** Largest accepted request body. */
const MAX_BODY_BYTES = 64 * 1024;

/** Hosts that only a local caller can address. */
const LOOPBACK_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
/** Socket addresses that only a local caller can have. */
const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/**
 * Decide whether a request comes from a local page rather than the network.
 * @param req - incoming Node request.
 * @returns true when the caller is loopback and same-origin.
 */
export function isLoopbackRequest(req) {
  if (!LOOPBACK_ADDRESSES.has(req.socket?.remoteAddress)) return false;
  const hostHeader = req.headers?.host;
  if (hostHeader) {
    let host;
    try {
      host = new URL(`http://${hostHeader}`);
    } catch {
      return false;
    }
    if (host.username || host.password) return false;
    if (!LOOPBACK_HOSTNAMES.has(host.hostname)) return false;
  }
  const origin = req.headers?.origin;
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.host === req.headers.host;
  } catch {
    return false;
  }
}

/**
 * Write one JSON response.
 * @param res - Node response.
 * @param status - HTTP status code.
 * @param body - JSON-serializable body.
 */
function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

/**
 * Read a bounded JSON body.
 * @param req - incoming request.
 * @returns parsed body, or null when it is missing, too large, or not JSON.
 */
async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) return null;
    chunks.push(chunk);
  }
  if (size === 0) return null;
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Register both routes on the Host web server.
 * @param webServer - the mounted `ctx.webServer` service.
 * @param store - the todo store shared with the agent tool.
 * @param diagnostics - registration states reported by GET, so a degraded half is visible.
 * @returns one disposer that removes both routes.
 */
export function registerTodoRoutes(webServer, store, diagnostics = {}) {
  const disposers = [];

  disposers.push(webServer.register({
    kind: 'exact',
    path: STATE_PATH,
    handler: (req, res) => {
      if (!isLoopbackRequest(req)) {
        json(res, 403, { ok: false, code: 'todo_forbidden', message: 'Local requests only.' });
        return;
      }
      if (req.method === 'OPTIONS') {
        res.writeHead(204, { allow: 'GET, OPTIONS' });
        res.end();
        return;
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        json(res, 405, { ok: false, code: 'todo_method_not_allowed', message: 'Use GET.' });
        return;
      }
      json(res, 200, { ok: true, ...store.snapshot(), diagnostics: { ...diagnostics } });
    },
  }));

  disposers.push(webServer.register({
    kind: 'exact',
    path: MUTATE_PATH,
    handler: async (req, res) => {
      if (!isLoopbackRequest(req)) {
        json(res, 403, { ok: false, code: 'todo_forbidden', message: 'Local requests only.' });
        return;
      }
      if (req.method === 'OPTIONS') {
        res.writeHead(204, { allow: 'POST, OPTIONS' });
        res.end();
        return;
      }
      if (req.method !== 'POST') {
        json(res, 405, { ok: false, code: 'todo_method_not_allowed', message: 'Use POST.' });
        return;
      }
      const request = await readJsonBody(req);
      if (request === null) {
        json(res, 400, { ok: false, code: 'todo_bad_request', message: 'Expected a JSON object body.' });
        return;
      }
      const outcome = store.apply(request);
      if (!outcome.ok) {
        const status = outcome.code === 'todo_not_found'
          ? 404
          : outcome.code === 'todo_revision_conflict'
            ? 409
            : outcome.code === 'todo_busy'
              ? 503
              : 400;
        json(res, status, outcome);
        return;
      }
      json(res, 200, { ok: true, ...outcome.snapshot });
    },
  }));

  return () => {
    for (const dispose of disposers.splice(0).reverse()) {
      try {
        dispose();
      } catch {
        // A route already removed by composition teardown is not an error here.
      }
    }
  };
}
