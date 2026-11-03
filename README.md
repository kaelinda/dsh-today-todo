# dsh-todos

在 DeepSeek Harness 左侧栏里放一个「待办」面板：一条清单，一个专注的「今天」禅模式，外加一枚内置番茄钟。

![License](https://img.shields.io/github/license/kaelinda/dsh-today-todo)
![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)

---

## 功能

- **左侧栏入口** — 一个清单图标，点开后在主栏打开待办面板。
- **待办管理** — 新增、重命名、完成、删除、筛选、一键清理已完成。清单由 Host 持久化在
  `$DSH_HOME/dsh-todos/todos.json`，网页刷新、应用重启、浏览器数据清空都不会丢。
  写入先 fsync 再原子替换，修改前会在文件锁内重读，两个 DSH 进程并发写也不会互相覆盖。
- **单条详情**（点行尾的 chevron 展开）：
  - **标签** — 自由分类（如 `#panel`、`#docs`），详情里用 chip 编辑，工具栏筛选器里按标签过滤。
  - **优先级** — `P0`–`P3`，或不分级。行内以 6px 色点展示，详情与筛选器里显示完整控件和各级计数；优先级驱动排序（最急在前）。
  - **四象限** — 标记为 Q1 重要且紧急、Q2 重要、Q3 紧急、Q4 都不重要。「四象限 / Matrix」视图把清单分成这四个格子，外加一个「未分类」桶。
  - **今天** — 把某条放进今天的专注清单（行内太阳按钮，或详情里的「今天」控件）。「今天」范围只显示这些条目，在该范围下新增会自动归入今天。「今天」的日期由 Host 统一下发，浏览器时区不同也不会错位；`todayDate` 记录的是规划日期，专注清单每天自动重置而记录保留。
- **今天的禅模式** — 切到「今天」后，整个面板换成一屏安静的专注视图：一枚圆相、一行日期、一行居中输入、只列今天未完成的事（优先级压成一个小点）。统计、筛选、视图切换、标签 chip、会话 chip 全部隐去，行详情仍一键可达。已完成收进「完成 N 项」，全部完成时出现收束语，`← 退出` 或 `Esc` 返回列表。动画遵循 `prefers-reduced-motion`。
- **禅模式里的番茄钟** — 「今天」视图带一个安静的 `开始专注 · 25:00`。启动后圆相换成 148px 进度环：25 分钟专注（品牌色）→ 5 分钟休息（成功色），中间是 mm:ss，圆环带呼吸动画，阶段结束时 ping / flash 一下（`prefers-reduced-motion` 下关闭）。操作只有暂停 / 结束；会话经 `localStorage` 在面板重挂载、页面刷新后自动恢复，并捕获当天第一条未完成任务作为专注标签。
- **会话关联与跳转** — 把任意待办关联到负责它的 DSH 会话。行内显示会话标题，点击即跳转（`ctx.uiWorkspace.openSession`）；已归档或已删除的会话会被提示，而不是导航到空处。
- **与智能体同源** — `todo_track` 工具（`list` / `add` / `update` / `remove` / `clearDone`，支持 `tags`、`priority`、`quadrant`、`today`）调用同一个 Host 存储，智能体和面板读写的是一份清单。`list` 支持分页与按范围、优先级、象限、标签、标题过滤，长清单也不会灌满模型的上下文。

---

## 安装

这个 bundle 安装进一个 DeepSeek Harness **profile** —— 桌面端用 `desktop`，浏览器构建通常用 `web`。安装只影响该 profile；之后其中的每个会话都能看到面板。

### 从源码安装（已验证）

```bash
git clone git@github.com:kaelinda/dsh-today-todo.git
```

然后用下面任一方式安装：

```bash
# 1. 桌面端：插件 → 添加插件 → 从本地目录安装
# 2. CLI（装完重启 Host）
dsh plugin --profile desktop add /absolute/path/to/dsh-today-todo
# 3. 在会话里：plugin_manager → install_bundle，传入本地绝对路径
```

插件是纯 JavaScript，无运行时依赖；浏览器侧的 `client.js` 已随仓库提交，安装时无需构建或下载。

### 从 git 安装

pnpm 支持 git spec，所以下面这条 CLI 命令通常可行：

```bash
dsh plugin --profile desktop add git+ssh://git@github.com/kaelinda/dsh-today-todo.git
```

若桌面端拒绝 git spec，就克隆仓库后按「从源码安装」处理。本包**不发布到 npm**（`private: true`），这个仓库就是分发物。

---

## 面板布局

列表视图刻意克制：一行工具栏、单行条目，其余细节都收进 chevron。

```
待办事项                                     [列表 | 四象限]
┌ 添加一条待办，按回车保存                                 ┐ ⊕
今天 3   全部 4   待办 3   已完成 1                    ⚲ 1
──────────────────────────────────────────────────────────
○  ●  点击会话标签，一键跳回本会话      ●                  ›
○  ●  点开左侧栏「待办」，试试详情                        ›
○     让智能体用 todo_track 帮你记待办                   ›
──────────────────────────────────────────────────────────
已完成 1
✓      todo_track 工具已通过端到端验证                   ›
                                         清除已完成
```

- **一行工具栏**：范围页签（今天 / 全部 / 待办 / 已完成）带计数，外加一个漏斗按钮。优先级与标签筛选都收在漏斗的面板里，启用时显示角标，不常驻屏上。
- **单行条目**：复选框、6px 优先级色点、标题、5px 琥珀色「今天」圆点、详情 chevron。标签、象限、会话关联、今天控件都收在详情抽屉里，点 chevron 展开（双击仍可重命名）。
- **悬停才出现**：今天切换、重命名、删除只在悬停 / 聚焦时显现；详情 chevron 始终可见。
- **已完成归组**：已完成条目收在细线分隔的「已完成 N」组里，不与未完成混排。
- **新增**：一个带边框的输入框，尾部 ⊕ 按钮，回车提交。
- 点「今天」仍会切到禅模式专注视图（见上）。

---

## 目录结构

| 文件 | 职责 |
| --- | --- |
| `index.js` | Host 半边：挂载存储、面板 API、智能体工具。 |
| `lib/store.js` | 持久化 JSON 存储：归一化、revision 乐观锁、文件锁、fsync、坏文件备份，以及唯一的变更入口。 |
| `lib/routes.js` | 仅本机的 `GET /plugins/dsh-todos/state` 与 `POST /plugins/dsh-todos/mutate`。 |
| `lib/tool.js` | 分页版 `todo_track` 智能体工具。 |
| `src/client/` | 客户端源码：入口、常量、词典、番茄钟、共享辅助、图标、CSS、面板、注册。 |
| `scripts/build-client.mjs` | 生成浏览器产物的确定性 include 构建。 |
| `client.js` | 生成的浏览器产物：`sidebar.panellist` 入口、列表面板、禅模式。**不要直接编辑**。 |
| `locale/*.json` | 插件管理器的标题 / 描述。 |
| `cordis.patch.yml` | 插入激活该 bundle 的那一行。 |

---

## 开发

无运行时依赖。发布的 `client.js` 是生成物，因此要改 `src/client/*.js` 后再构建：

```bash
npm run build   # 从 src/client 生成 client.js
npm test        # 先构建，再 node --test
```

`npm test` 还会校验仓库里的 `client.js` 与构建产物完全一致，防止产物悄悄偏离源码。

- **Host 半边** — `index.js` 加 `lib/`；Loader 挂载 `cordis.patch.yml` 声明的行，并把 `config` 传给 `apply(ctx, config)`。
- **客户端半边** — `src/client/index.js` 是 factory 入口；构建把它的 `// @include` 行展开成单个 `window.__ModuleLoader__` 产物。`client.js` 以该模块形式下发给页面，其 `id` 必须等于包名，`dsh.client.immediately` 让侧栏入口在启动时注册。
- **样式** — 只用主题 token（`--dsw-alias-*`），类名带前缀，不用全局选择器；动效受 `prefers-reduced-motion` 约束。
- **开发期数据** — `$DSH_HOME/dsh-todos/todos.json`；可用 `DSH_TODOS_FILE` 或该行的 `dataFile` 指向别处。
- **测试** — `test/smoke.test.mjs` 用 React stub 渲染客户端；`test/store.test.mjs` 覆盖 fsync、坏文件恢复、revision 冲突、锁与并发写；`test/routes.test.mjs` 锁定 HTTP 契约；`test/tool.test.mjs` 覆盖分页与过滤；`test/build.test.mjs` 守护生成产物。
- **热更新** — 客户端改动在页面内热更新；Host 改动需重载该 bundle 行（禁用 / 启用该 bundle，或重启 Host）。

---

## 配置

该 bundle 行接受一个可选字段：

```yaml
- id: dsh-todos
  name: dsh-todos
  config:
    dataFile: /absolute/path/to/todos.json   # 默认：$DSH_HOME/dsh-todos/todos.json
```

环境变量 `DSH_TODOS_FILE` 可覆盖默认路径。

---

## 数据格式

```json
{
  "version": 2,
  "revision": 3,
  "items": [
    {
      "id": "todo-…",
      "title": "Ship the todo panel",
      "done": false,
      "createdAt": 1730000000000,
      "updatedAt": 1730000000000,
      "sessionId": "session-…",
      "sessionTitle": "Panel work",
      "tags": ["panel", "docs"],
      "priority": "P0",
      "quadrant": "q1",
      "todayDate": "2026-11-03",
      "todayAt": 1730000000000
    }
  ]
}
```

字段约定：

| 字段 | 取值 |
| --- | --- |
| `revision` | 单调递增的文档版本号，用于乐观锁 |
| `tags` | 最多 8 个标签，每个不超过 24 字符，大小写不敏感去重 |
| `priority` | `P0` \| `P1` \| `P2` \| `P3` \| `null` |
| `quadrant` | `q1` \| `q2` \| `q3` \| `q4` \| `null` |
| `todayDate` | 本地日期键 `YYYY-MM-DD` 或 `null` |
| `todayAt` | 该条目加入当天专注清单的时刻，用于排序 |

文档缺失或损坏时会降级为空清单，绝不会阻止插件激活。损坏的文档会先移到
`todos.json.corrupt-<timestamp>`，方便查看或恢复。版本 1 的旧记录会被归一化到版本 2。

### 并发与恢复

- 面板每次变更都带上它渲染时看到的 `revision`。若这期间智能体或另一个标签页写入了，Host 返回 `409` 与 `code: todo_revision_conflict` 及其当前快照；面板采用该快照并重试一次，而不是用旧状态覆盖新清单。
- 每次变更先取同级锁文件 `todos.json.lock`，在锁内重读文档后再应用操作。因此第二个进程会在前一个的结果上合并，而不是用陈旧内存整体替换文件；崩溃进程留下的锁 10 秒后自动回收。
- 持久化写入临时文件、fsync、再原子 rename 覆盖文档，并尽力 fsync 目录。临时文件名带进程唯一后缀，并发写者不会共用同一文件。

---

## License

MIT © 2026 kaelinda。详见 [LICENSE](LICENSE)。
