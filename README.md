# dsh-todos

DeepSeek Harness 的待办与专注插件：在左侧栏管理任务，用四象限理清优先级，再进入 Three.js「心流轨道」，一次专注一件事。

![License](https://img.shields.io/github/license/kaelinda/dsh-today-todo)
![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)

[界面预览](#界面预览) · [功能](#功能) · [安装](#安装) · [开发](#开发)

## 界面预览

以下为本地浏览器预览截图，使用演示数据。

### 今天 · 心流轨道

粒子环与三维星轨围绕番茄钟缓慢流动，任务清单保持清晰可操作。右上角可随时切换动态 / 静态氛围。

![今天模式：蓝色粒子轨道环绕计时器，下方展示今日任务清单](docs/screenshots/today-orbit.png)

### 输入框 · 聚焦流光

聚焦时光晕轻轻展开，两道微光沿圆角边框流动，离开输入框后淡出。列表跟随主题色，今天使用青绿色；重命名、标签和搜索框使用短暂的亮起反馈。关闭动态或开启系统「减少动态」时保留静态聚焦高亮。

![今天输入框聚焦动效：光晕展开、双流光沿边缘移动、失焦后收起](docs/screenshots/input-focus-motion.gif)

<details>
<summary>更多截图：专注与休息、浅深色清单、四象限、移动端</summary>

### 专注与休息

专注时粒子逐渐收拢，休息时转为暖金色；暂停会定格场景，完成任务会扩散一圈微光。

| 25 分钟专注 | 5 分钟休息 |
| --- | --- |
| ![专注状态：青绿色粒子环、倒计时与暂停和结束按钮](docs/screenshots/today-focus.png) | ![休息状态：暖金色粒子环和五分钟休息倒计时](docs/screenshots/today-break.png) |

### 浅色与深色清单

任务卡片直接展示优先级、今天标记、标签和关联会话；完成项单独归组。

| 浅色主题 | 深色主题 |
| --- | --- |
| ![浅色待办清单：新增入口、筛选器、任务卡片与已完成分组](docs/screenshots/list-light.png) | ![深色待办清单：相同的任务结构与适配深色背景的控件](docs/screenshots/list-dark.png) |

### 四象限

按重要性与紧急性分组，颜色、Q1–Q4 标识和操作提示共同区分象限；未分类任务保留在下方。

![四象限视图：重要且紧急、重要不紧急、紧急不重要、不急不重要及未分类任务](docs/screenshots/matrix.png)

### 窄屏与减少动态

375px 窄屏下，计时器、任务和操作仍完整可用。下图展示英文界面及系统「减少动态」生效后的静态场景。

<img src="docs/screenshots/today-mobile.png" alt="375px 英文今天模式：静态粒子轨道、计时器、今日清单与减少动态状态" width="320">

</details>

---

## 功能

- **左侧栏入口** — 一个清单图标，点开后在主栏打开待办面板。
- **待办管理** — 新增、重命名、完成、删除、筛选、一键清理已完成。清单由 Host 持久化在
  `$DSH_HOME/dsh-todos/todos.json`，网页刷新、应用重启、浏览器数据清空都不会丢。
  写入先 fsync 再原子替换，修改前会在文件锁内重读，两个 DSH 进程并发写也不会互相覆盖。
- **单条详情**（点行尾的 chevron 展开）：
  - **标签** — 自由分类（如 `#panel`、`#docs`），详情里用 chip 编辑，工具栏筛选器里按标签过滤。
  - **优先级** — `P0`–`P3`，或不分级。行内以色点与等级文字展示，详情与筛选器里显示完整控件和各级计数；优先级驱动排序（最急在前）。
  - **四象限** — 标记为 Q1 重要且紧急、Q2 重要、Q3 紧急、Q4 都不重要。「四象限 / Matrix」视图把清单分成这四个格子，外加一个「未分类」桶。
  - **今天** — 把某条放进今天的专注清单（行内太阳按钮，或详情里的「今天」控件）。「今天」范围只显示这些条目，在该范围下新增会自动归入今天。「今天」的日期由 Host 统一下发，浏览器时区不同也不会错位；`todayDate` 记录的是规划日期，专注清单每天自动重置而记录保留。
- **今天的心流轨道** — 独立的夜色专注空间：Three.js 绘制有纵深的粒子环、三条星轨和微光，日期、计时器与任务操作保留为可访问的 HTML。专注时粒子逐渐收拢，休息时转为暖金色，暂停时定格，完成任务时扩散一圈微光。今日清单保留详情和完成项折叠，`← 退出` 或 `Esc` 返回列表。
- **番茄钟** — 25 分钟专注 → 5 分钟休息，支持暂停、继续、结束；`localStorage` 在面板重挂载与页面刷新后恢复计时，并捕获当天第一条未完成任务作为专注标签。计时基于截止时间计算，不依赖动画帧率。
- **动效与降级** — 右上角可以切换动态 / 静态氛围并记住偏好；实时遵循系统 `prefers-reduced-motion`。场景最多约 30 FPS、DPR 上限 1.5；手机使用更少粒子，标签页隐藏、场景滚出视口或暂停专注时停止持续渲染。无 WebGL 时显示静态轨道；退出今天后释放动画、监听器和 GPU 资源。
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

插件是纯 JavaScript；Three.js 已本地打包进随仓库提交的 `client.js`，进入今天时才初始化。安装时无需构建，也不需要访问 CDN 或额外下载浏览器资源。

### 从 git 安装

pnpm 支持 git spec，所以下面这条 CLI 命令通常可行：

```bash
dsh plugin --profile desktop add git+ssh://git@github.com/kaelinda/dsh-today-todo.git
```

若桌面端拒绝 git spec，就克隆仓库后按「从源码安装」处理。本包**不发布到 npm**（`private: true`），这个仓库就是分发物。

---

## 面板布局

列表与四象限跟随 DSH 浅色 / 深色主题；今天使用独立、局部作用域的夜色调色板。无额外字体或 UI 框架依赖。

- **标题与今日专注**：明确的标题层级、列表 / 四象限切换，以及显示今日未完成数量的专注入口。
- **新增待办**：带可见标签的输入框和「添加」按钮，支持回车保存；输入法选词回车不会提前提交。
- **范围与筛选**：今天 / 全部 / 待办 / 已完成页签带计数；优先级、标签筛选收进可展开面板，启用后保留角标。
- **任务卡片**：标题下展示优先级、今天标记、标签和关联会话；点击标签直接筛选，点击会话直接跳转。长标题自动换行。
- **详情编辑**：点击标题或行尾箭头展开；桌面悬停 / 键盘聚焦提供快捷操作，窄窗口和触屏可在详情中重命名、删除。
- **已完成分组**：完成项单独归组并划线，底部保留「清除已完成」。
- **四象限**：不同颜色的顶边、Q1–Q4 标识与操作提示共同区分象限；窄面板自动改为单列。
- **今天与番茄钟**：三维心流轨道承载专注氛围，清晰的 HTML 计时器、进度条与今日清单承载操作；可随时关闭动态。
- **可访问性**：可见键盘焦点、明确的按钮名称、扩大触屏点击区域，并遵循 `prefers-reduced-motion`；响应式布局根据插件面板宽度调整。

---

## 目录结构

| 文件 | 职责 |
| --- | --- |
| `index.js` | Host 半边：挂载存储、面板 API、智能体工具。 |
| `lib/store.js` | 持久化 JSON 存储：归一化、revision 乐观锁、文件锁、fsync、坏文件备份，以及唯一的变更入口。 |
| `lib/routes.js` | 仅本机的 `GET /plugins/dsh-todos/state` 与 `POST /plugins/dsh-todos/mutate`。 |
| `lib/tool.js` | 分页版 `todo_track` 智能体工具。 |
| `src/client/` | 客户端源码：入口、常量、词典、番茄钟、共享辅助、图标、CSS、面板、注册。 |
| `src/client/focus-canvas.js` | React 场景挂载、状态同步与无 WebGL 降级。 |
| `src/client/focus-scene.js` | Three.js 粒子、轨道、状态动效与 GPU 资源生命周期。 |
| `src/client/focus-motion.js` | 可取消的 30 FPS 动画调度。 |
| `scripts/build-client.mjs` | 展开 include，并用 esbuild 嵌入本地 Three.js 场景。 |
| `client.js` | 生成的浏览器产物：`sidebar.panellist` 入口、列表面板、禅模式。**不要直接编辑**。 |
| `locale/*.json` | 插件管理器的标题 / 描述。 |
| `cordis.patch.yml` | 插入激活该 bundle 的那一行。 |
| `docs/screenshots/` | README 使用的界面截图，均为演示数据。 |

---

## 开发

开发构建需要锁定版本的 `three` 与 `esbuild`（仅 devDependencies）。发布的 `client.js` 已包含浏览器所需代码，因此要改 `src/client/*.js` 后再构建：

```bash
npm ci          # 安装锁定的构建依赖
npm run build   # 从 src/client 生成 client.js
npm test        # 先构建，再 node --test
```

`npm test` 还会校验仓库里的 `client.js` 与构建产物完全一致，防止产物悄悄偏离源码。

- **Host 半边** — `index.js` 加 `lib/`；Loader 挂载 `cordis.patch.yml` 声明的行，并把 `config` 传给 `apply(ctx, config)`。
- **客户端半边** — `src/client/index.js` 是 factory 入口；构建展开它的 `// @include` 行，并在延迟初始化函数内嵌入 Three.js 场景，生成单个 `window.__ModuleLoader__` 产物。`client.js` 以该模块形式下发给页面，其 `id` 必须等于包名，`dsh.client.immediately` 让侧栏入口在启动时注册。
- **样式** — 列表使用宿主主题 token（`--dsw-alias-*`），今天在局部重定义夜色 token；类名带前缀，不用全局选择器。CSS 与 WebGL 动效都响应 `prefers-reduced-motion`。
- **开发期数据** — `$DSH_HOME/dsh-todos/todos.json`；可用 `DSH_TODOS_FILE` 或该行的 `dataFile` 指向别处。
- **测试** — `test/smoke.test.mjs` 用 React stub 渲染客户端；`test/store.test.mjs` 覆盖 fsync、坏文件恢复、revision 冲突、锁与并发写；`test/routes.test.mjs` 锁定 HTTP 契约；`test/tool.test.mjs` 覆盖分页与过滤；`test/build.test.mjs` 守护生成产物与嵌入代码语法；`test/focus-motion.test.mjs` 验证限帧、暂停、恢复、卸载与延迟回调。
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
