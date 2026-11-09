/** Real browser workflow against an isolated, durable Host API. */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';
import { createPreview } from './preview.mjs';

const output = process.env.DSH_QA_OUTPUT || mkdtempSync(join(tmpdir(), 'dsh-workbench-browser-'));
const preview = await createPreview();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, reducedMotion: 'reduce' });
page.setDefaultTimeout(12_000);
const errors = [];
const checks = [];
page.on('pageerror', (error) => errors.push(error.message));
const nav = (name) => page.getByRole('navigation').getByRole('button', { name: new RegExp(`^${name}`) }).click();
async function verify(name, condition) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (condition()) { checks.push(name); return; }
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  assert.fail(name);
}
try {
  await page.goto(preview.url);
  await nav('项目');
  await page.getByRole('button', { name: '新建项目', exact: true }).click();
  await page.getByLabel('项目名称', { exact: true }).fill('浏览器验收项目');
  await page.getByLabel('目标与完成标准', { exact: true }).fill('完成一次可追溯的计划与复盘闭环');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await verify('create project persists', () => preview.store.document().projects.some((row) => row.name === '浏览器验收项目'));
  const projectId = preview.store.document().projects.find((row) => row.name === '浏览器验收项目').id;
  await page.getByLabel('实际推进了什么？', { exact: true }).fill('已完成真实浏览器流程验证的准备工作');
  await page.getByRole('button', { name: '保存记录', exact: true }).click();
  await verify('unfinished progress persists with project', () => preview.store.document().logs.some((row) => row.projectId === projectId));

  await nav('任务');
  await page.getByLabel('新待办标题', { exact: true }).fill('浏览器验收任务');
  await page.getByLabel('新待办标题', { exact: true }).press('Enter');
  await page.getByRole('button', { name: '浏览器验收任务', exact: true }).click();
  const detail = page.locator('.dsh-wb-taskFields');
  await detail.getByLabel('项目标签', { exact: true }).selectOption(projectId);
  await detail.getByLabel('预计投入（分钟）', { exact: true }).fill('30');
  await detail.getByRole('button', { name: '保存任务安排', exact: true }).click();
  await verify('task project and estimate persist', () => preview.store.document().items.some((row) => row.title === '浏览器验收任务' && row.projectId === projectId && row.estimateMinutes === 30));
  const taskId = preview.store.document().items.find((row) => row.title === '浏览器验收任务').id;
  await detail.getByText('记一条进展', { exact: true }).click();
  await detail.getByLabel('实际推进了什么？', { exact: true }).fill('任务尚未完成，已经验证了项目归属');
  await detail.getByRole('button', { name: '保存记录', exact: true }).click();
  await verify('task-linked progress persists', () => preview.store.document().logs.some((row) => row.taskId === taskId));

  await nav('规划');
  await page.getByLabel('期望结果与验证标准', { exact: true }).fill('今天完成一次报告验收');
  await page.getByRole('checkbox', { name: /浏览器验收任务/ }).check();
  await page.getByRole('button', { name: '确认计划', exact: true }).click();
  await verify('confirmed daily plan keeps baseline', () => preview.store.document().plans.some((plan) => plan.committedAt && plan.baselineTaskIds.includes(taskId)));
  await nav('今天');
  await page.getByText('浏览器验收任务', { exact: true }).waitFor();
  checks.push('confirmed plan appears in Today');
  await page.getByRole('button', { name: '开始专注 · 25:00', exact: true }).click();
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await page.getByRole('button', { name: '结束', exact: true }).click();
  await verify('pause/resume/end saves one task-linked focus record', () => preview.store.document().focusSessions.length === 1);
  const focus = preview.store.document().focusSessions[0];
  assert.ok(focus.taskId && focus.minutes > 0 && focus.pauseMinutes >= 0);

  await nav('回顾');
  const today = preview.store.snapshot().todayDate;
  await page.getByLabel('开始日期', { exact: true }).fill(today);
  await page.getByLabel('结束日期（包含当天）', { exact: true }).fill(today);
  await page.getByRole('checkbox', { name: '浏览器验收项目', exact: true }).check();
  await page.getByRole('button', { name: '生成草稿', exact: true }).click();
  const content = page.getByLabel('正文（Markdown）', { exact: true });
  await content.waitFor();
  assert.match(await content.inputValue(), /已完成真实浏览器流程验证的准备工作/);
  checks.push('project report contains recorded progress');
  await content.fill(`${await content.inputValue()}\n\n手工补充：保留这一条验收结论。`);
  await page.getByRole('button', { name: '确认定稿', exact: true }).click();
  await verify('final report retains manual text', () => preview.store.document().documents.some((doc) => doc.status === 'final' && doc.content.includes('手工补充')));
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 Markdown', exact: true }).click();
  const download = await downloadPromise;
  const exportPath = join(output, 'report.md');
  await download.saveAs(exportPath);
  assert.match(readFileSync(exportPath, 'utf8'), /手工补充/);
  checks.push('Markdown export matches edited document');
  await page.screenshot({ path: join(output, 'report-desktop.png'), fullPage: true });

  await page.getByRole('button', { name: '复盘', exact: true }).click();
  await page.getByRole('button', { name: '生成草稿', exact: true }).click();
  await page.getByLabel('下一步具体做什么？', { exact: true }).fill('下周每天预留一个不被打断的时间段');
  await page.getByLabel('如何验证有效？', { exact: true }).fill('下次复盘检查实际执行次数');
  await page.getByRole('button', { name: '转为改进行动', exact: true }).click();
  await verify('review action becomes a task', () => preview.store.document().items.some((row) => row.reviewId && row.title.includes('不被打断')));

  await page.getByRole('button', { name: '周期规则', exact: true }).click();
  await page.getByRole('button', { name: '新建周期规则', exact: true }).click();
  await page.getByLabel('规则名称', { exact: true }).fill('项目三天复盘');
  await page.getByLabel('文档类型', { exact: true }).selectOption('review');
  await page.getByLabel('触发周期', { exact: true }).selectOption('interval');
  await page.getByLabel('间隔', { exact: true }).fill('3');
  await page.getByRole('button', { name: '预览接下来三次', exact: true }).click();
  await page.locator('.dsh-wb-runPreview li').first().waitFor();
  assert.equal(await page.locator('.dsh-wb-runPreview li').count(), 3);
  checks.push('custom cadence previews three occurrences');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await verify('routine scope and cadence persist', () => preview.store.document().routines.some((row) => row.name === '项目三天复盘' && row.interval === 3 && row.projectIds.includes(projectId)));
  await page.getByRole('button', { name: '立即生成', exact: true }).click();
  await verify('routine generates a saved draft', () => preview.store.document().runs.some((run) => run.status === 'completed'));
  const docCount = preview.store.document().documents.length;
  await page.getByRole('button', { name: '周期规则', exact: true }).click();
  await page.getByRole('button', { name: '立即生成', exact: true }).click();
  assert.equal(preview.store.document().documents.length, docCount);
  checks.push('repeated routine generation is idempotent');

  await page.reload();
  await nav('项目');
  await page.getByRole('button', { name: /浏览器验收项目/ }).waitFor();
  checks.push('reload reads saved project');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${preview.url}?theme=dark&lang=en`);
  for (const name of ['Projects', 'Planning', 'Reflect', 'Tasks', 'Today']) {
    await nav(name);
    const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth && document.querySelector('.dsh-todos-page').scrollWidth <= window.innerWidth);
    assert.equal(fits, true, `375px ${name} must not overflow horizontally`);
  }
  await nav('Reflect');
  await page.getByRole('button', { name: 'Routines', exact: true }).click();
  await page.screenshot({ path: join(output, 'routines-mobile-dark.png'), fullPage: true });
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement !== document.body), true);
  checks.push('375px English dark/reduced-motion views fit and accept keyboard focus');
  assert.deepEqual(errors, []);
  const result = { checks, count: checks.length, errors, output, realHostInstalled: false };
  writeFileSync(join(output, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  await page.screenshot({ path: join(output, 'failure.png'), fullPage: true }).catch(() => {});
  console.error(`Browser QA artifacts: ${output}\n${await page.locator('body').innerText().catch(() => '')}`);
  throw error;
} finally {
  await browser.close();
  await preview.close();
}
