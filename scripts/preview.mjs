/** Isolated development preview using the real API and temporary demo data. */
import { createServer } from 'node:http';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { createTodoStore } from '../lib/store.js';
import { registerTodoRoutes } from '../lib/routes.js';
import { createAutomation, projectWorkbench } from '../lib/automation.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const html = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>个人工作台 · 隔离预览</title>
<style>:root{--dsw-alias-bg-base:#fff;--dsw-alias-bg-layer-1:#f6f7fa;--dsw-alias-label-primary:#202936;--dsw-alias-label-secondary:#657080;--dsw-alias-label-caption:#758093;--dsw-alias-label-primary-inverted:#fff;--dsw-alias-border-l3:#e3e7ef;--dsw-alias-border-l2:#bac3d0;--dsw-alias-interactive-bg-hover:#edf1f7;--dsw-alias-state-business-primary:#3d62d9;--dsw-alias-brand-primary:#3d62d9;--dsw-alias-state-error-primary:#c44242;--dsw-alias-state-warn-primary:#a86716;--dsw-alias-state-success-primary:#21866a;}html[data-theme=dark]{--dsw-alias-bg-base:#171d28;--dsw-alias-bg-layer-1:#1e2735;--dsw-alias-label-primary:#e9edf6;--dsw-alias-label-secondary:#aab5c7;--dsw-alias-label-caption:#aab5c7;--dsw-alias-border-l3:#344255;--dsw-alias-border-l2:#5a6a82;--dsw-alias-interactive-bg-hover:#2c394c;--dsw-alias-state-business-primary:#90a7ff;--dsw-alias-brand-primary:#90a7ff;}html,body,#root{height:100%;margin:0;font-family:system-ui,-apple-system,sans-serif;}button,input,textarea,select{font:inherit;}*{box-sizing:border-box;}</style></head><body><div id="root"></div>
<script src="/react.js"></script><script src="/react-dom.js"></script>
<script>
const params=new URLSearchParams(location.search);const lang=params.get('lang')==='en'?'en':'zh';document.documentElement.lang=lang;document.documentElement.dataset.theme=params.get('theme')||'light';
let panel,dictionaries={};window.__ModuleLoader__={load(entry){const mod=entry.factory(name=>name==='react'?React:{});const t=(key,values={})=>{let value=dictionaries[lang]?.[key]??key;for(const [name,replacement] of Object.entries(values))value=value.replaceAll('{'+name+'}',String(replacement));return value;};const ctx={effect(fn){fn();},locale:{register(_namespace,dict){dictionaries=dict;return()=>{};},bind(){return t;}},slots:{inject(_name,fn){fn();},register(slot,component){if(slot.name==='main')panel=component;return()=>{};}},uiWorkspace:{openSession(){}}};mod.apply(ctx);ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(panel,{t,openSession(){}}));}};
</script><script src="/client.js"></script></body></html>`;

export async function createPreview({ port = 0, seed = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-workbench-preview-'));
  const store = createTodoStore({ file: join(dir, 'todos.json') });
  if (seed) {
    const project = store.apply({ op: 'project.save', name: '工作台升级', goal: '让每日计划、报告和复盘形成可持续的习惯。' }).data.project;
    store.apply({ op: 'add', title: '验证第一份项目周报', projectId: project.id, quadrant: 'q2', priority: 'P1', today: true, estimateMinutes: 45 });
    store.apply({ op: 'add', title: '整理今天收到的临时事项', quadrant: 'q3', priority: 'P2', today: true, estimateMinutes: 20 });
    store.apply({ op: 'log.add', projectId: project.id, kind: 'progress', text: '已明确项目范围与报告模板，等待一次完整流程验证。' });
  }
  const automation = createAutomation(store);
  const routes = new Map();
  const unregister = registerTodoRoutes({ register(route) { routes.set(route.path, route); return () => routes.delete(route.path); } }, store,
    { api: 'preview', tool: 'not mounted in preview' }, (snapshot) => projectWorkbench(store, snapshot, automation));
  const files = new Map([
    ['/client.js', join(root, 'client.js')],
    ['/react.js', join(dirname(require.resolve('react/package.json')), 'umd/react.development.js')],
    ['/react-dom.js', join(dirname(require.resolve('react-dom/package.json')), 'umd/react-dom.development.js')],
  ]);
  const server = createServer(async (req, res) => {
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (routes.has(path)) return await routes.get(path).handler(req, res);
      if (files.has(path)) { res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' }); res.end(readFileSync(files.get(path))); return; }
      if (path === '/') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(html); return; }
      res.writeHead(404); res.end('Not found');
    } catch (error) { res.writeHead(500, { 'content-type': 'text/plain' }); res.end(String(error)); }
  });
  await new Promise((resolvePromise, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolvePromise); });
  return { store, automation, url: `http://127.0.0.1:${server.address().port}`, close: async () => {
    automation.dispose(); unregister(); await new Promise((done) => server.close(done)); rmSync(dir, { recursive: true, force: true });
  } };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const preview = await createPreview({ port: Number(process.env.DSH_PREVIEW_PORT || 4178) });
  console.log(`Isolated workbench preview: ${preview.url}\nTemporary demo data; real DSH data is not used.`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await preview.close(); process.exit(0); });
}
