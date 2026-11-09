<div align="center">
  <img src="icon.svg" width="72" height="72" alt="DSH Todos 图标">
  <h1>DSH 个人工作台</h1>
  <p><strong>安排工作，记录进展，把经验带入下一次行动。</strong></p>
  <p>DeepSeek Harness 的任务、项目与回顾插件。<br>四象限与今日专注、分项目报告、自定义周期复盘，连接计划与实际工作。</p>
  <p>
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-4763e4" alt="MIT License"></a>
    <img src="https://img.shields.io/badge/Node.js-%E2%89%A520-21836c" alt="Node.js 20 或更高">
    <img src="https://img.shields.io/badge/Three.js-%E6%9C%AC%E5%9C%B0%E6%89%93%E5%8C%85-315d75" alt="Three.js 本地打包">
  </p>
  <p>
    <a href="#今天的动画">今天的动画</a> ·
    <a href="#番茄钟">番茄钟</a> ·
    <a href="#安装">安装</a> ·
    <a href="#功能一览">功能</a> ·
    <a href="#开发与验收">开发与验收</a>
  </p>
</div>

**2.0 工作台**：新增项目标签、任务日期与状态、进展记录、日周容量计划、日报 / 周报 / 月报、复盘行动、文档修订和周期草稿。自动化在 Host 运行时工作，生成本地事实草稿供自己修改，不向外部发送。

[工作台使用与数据说明](docs/workbench.md) · [升级规划](docs/personal-workbench-upgrade-plan.md)

以下截图展示保留的任务与专注能力。

![今天的专注空间：心流轨道、番茄钟和今日清单](docs/screenshots/today-orbit.png)

| 整理工作 | 进入专注 | 回到现场 |
| --- | --- | --- |
| 清单、优先级、标签与四象限，把事情安排清楚。 | 今日清单与 25 / 5 番茄钟，一次处理一件事。 | 任务关联 DSH 会话，与智能体共用同一份清单。 |

> 以下截图和动图均来自本地浏览器中的真实插件界面，使用演示数据。番茄钟阶段切换演示缩短了等待时间，产品时长仍为 **25 分钟专注 / 5 分钟休息**。

## 今天的动画

### 心流轨道

进入今天，粒子环与三条星轨围绕计时器缓慢流动。专注时粒子收拢为青绿色，休息时转为暖金色；暂停会定格场景，勾选完成任务会扩散一圈微光。

<p align="center">
  <img src="docs/screenshots/today-orbit-motion.gif" width="640" alt="今天的动态轨道：星点与卫星沿三维轨道缓慢运动，中央计时器保持清晰">
</p>

### 从输入到行动

| 聚焦流光 | 新增微光 |
| --- | --- |
| ![输入框聚焦时光晕展开，两道流光沿圆角边缘移动](docs/screenshots/input-focus-motion.gif) | ![新增成功后输入框发出光脉冲，新任务滑入并闪过微光与星点](docs/screenshots/today-add-motion.gif) |
| 聚焦时展开光晕，双流光沿边框游走；失焦后淡出。 | 新增成功后，新卡片滑入、扫过微光，再渐渐回到普通状态。 |

连续添加会分别反馈，同名任务也能正确识别。请求失败会保留草稿，等待期间输入的下一条内容也不会被清空。

右上角的 **动态 / 静态氛围** 开关会记住偏好；系统开启「减少动态」时，保留静态聚焦和新增高亮。动画装饰不拦截点击，任务与计时器始终由可访问的 HTML 控件承载。无 WebGL 时显示静态轨道。

## 番茄钟

**25 分钟专注 → 5 分钟休息 → 待开始。** 点击「开始专注」，计时器会记录当前排在首位的今日未完成任务；一轮休息结束后，由你决定何时开始下一轮。

| 开始、暂停、继续与结束 | 专注结束，进入休息 |
| --- | --- |
| ![番茄钟实际操作：开始专注，暂停定格，再继续和结束](docs/screenshots/pomodoro-controls.gif) | ![专注倒计时结束后，计时器切换为五分钟休息，轨道渐变为暖金色](docs/screenshots/pomodoro-break-transition.gif) |
| 暂停同时定格倒计时与轨道，继续时接着剩余时间运行。 | 倒计时归零后自动切换阶段，颜色与状态文字同步变化。 |

| 状态 | 时钟行为 | 视觉反馈 |
| --- | --- | --- |
| 准备 | 显示 `25:00`，等待开始 | 蓝色星轨缓慢流动 |
| 专注 | 按截止时间递减 | 青绿色粒子收拢，进度环随时间变化 |
| 暂停 | 保存剩余时间 | 场景静止，显示「已暂停」 |
| 休息 | 自动开始 5 分钟倒计时 | 轨道与进度环转为暖金色 |
| 结束 | 清除本轮计时，返回准备状态 | 显示开始按钮；全部任务完成时保留完成氛围 |

计时依据绝对截止时间，动画停止不会让时钟变慢。有效的运行或暂停状态可在刷新、重新打开面板后恢复；截止时间已过去超过 5 分钟的运行记录会被视为过期。计时器与动态偏好保存在浏览器中，清理浏览器存储会重置它们。

<details>
<summary><strong>更多界面：静态专注 / 休息、浅深主题、四象限与窄屏</strong></summary>

### 专注与休息 · 静态截图

| 专注 | 休息 |
| --- | --- |
| ![专注状态的青绿色轨道与计时器](docs/screenshots/today-focus.png) | ![休息状态的暖金色轨道与计时器](docs/screenshots/today-break.png) |

### 清单 · 跟随宿主主题

| 浅色 | 深色 |
| --- | --- |
| ![浅色清单：任务、标签与关联会话](docs/screenshots/list-light.png) | ![深色清单：主题适配后的同一套控件](docs/screenshots/list-dark.png) |

### 四象限 · 区分重要与紧急

![四象限视图：四个象限及未分类任务](docs/screenshots/matrix.png)

### 窄屏 · 保留完整操作

375px 英文界面，系统「减少动态」生效后的静态场景。

<img src="docs/screenshots/today-mobile.png" width="320" alt="375px 英文今天页，计时器和任务保持可操作">

</details>

## 安装

需要 DeepSeek Harness；Host 的 Node.js 版本要求为 20 或更高。插件安装到指定 **profile**：桌面端通常使用 `desktop`，浏览器构建通常使用 `web`。

### 推荐：从本地源码安装

```bash
git clone git@github.com:kaelinda/dsh-today-todo.git
```

在 DSH 中打开 **插件 → 添加插件 → 从本地目录安装**，选择刚克隆的目录；也可以使用 CLI：

```bash
dsh plugin --profile desktop add /absolute/path/to/dsh-today-todo
```

CLI 安装后重启 Host。也可在会话中调用 `plugin_manager` 的 `install_bundle`，传入本地绝对路径。

仓库提交了构建后的 `client.js`，Three.js 已包含在其中。**安装无需运行构建，也不依赖 CDN 下载界面资源。**

<details>
<summary>可选：使用 Git 地址安装</summary>

pnpm 支持 Git spec，可尝试：

```bash
dsh plugin --profile desktop add git+ssh://git@github.com/kaelinda/dsh-today-todo.git
```

若当前桌面端不接受 Git spec，请使用上面的本地安装方式。本包设置了 `private: true`，不发布到 npm。

</details>

## 功能一览

| 能力 | 使用方式 |
| --- | --- |
| 待办管理 | 新增、重命名、完成、状态 / 日期 / 估时、筛选、归档与恢复；删除和清除已完成均保留历史。 |
| 项目与进展 | 稳定项目标签、目标、活动记录、产出与阻塞；可把旧标签归入项目。 |
| 规划 | 日 / 周目标、容量与缓冲、初始承诺快照、未估时提示和基于事实的规划建议。 |
| 报告 | 日报 / 周报 / 月报；单项目、项目组或所有项目；编辑、定稿、Markdown 导出与修订恢复。 |
| 复盘 | 事实对照与问题引导、上次行动检查、改进行动转任务；私人反思与报告分开。 |
| 周期规则 | 每天、指定星期、每月、每 N 天 / 周；独立范围、时区与覆盖窗口，到期生成本地草稿。 |
| 优先级与标签 | `P0`–`P3` 或不分级；标签可编辑，点击行内标签即可筛选。 |
| 四象限 | 按重要性、紧急性分组，保留未分类区域；颜色、文字与 Q1–Q4 标识共同区分。 |
| 今日清单 | 在详情中「加入今天」，或直接进入今天新增；按优先级、同级创建时间新到旧排序。 |
| 任务详情 | 点击标题或行尾箭头展开；键盘与触屏均可访问重命名、删除等操作。 |
| 会话关联 | 任务关联 DSH 会话，一键回到上下文；归档或不可用会话会显示提示。 |
| 智能体协作 | `todo_track` 提供 `list / add / update / remove / clearDone`，与面板使用同一个存储入口；列表支持分页和过滤。 |
| 中英与主题 | 中英文文案；列表和四象限跟随宿主主题，今天使用独立夜色配色。 |

「今天」由 **工作台设置的时区**决定，初始取 Host 时区。跨日后，旧任务仍保留；需要继续处理的任务可从待重排重新安排。

## 数据与偏好

| 内容 | 保存位置 | 行为 |
| --- | --- | --- |
| 任务、项目、活动、计划、报告、复盘与周期运行 | Host v3 文件 | 独立于浏览器存储，支持自定义路径，保留历史与修订。 |
| 番茄钟状态 | 浏览器 `localStorage` | 恢复有效计时；清理浏览器存储后重置。 |
| 动态开关偏好 | 浏览器 `localStorage` | 刷新后保留，并服从系统「减少动态」设置。 |

新版默认保存在 `$DSH_HOME/dsh-todos/todos.v3.json`。`DSH_TODOS_FILE` 或 `dataFile` 若指向旧 `todos.json`，会使用同目录的 `todos.v3.json` 并保留原文件；直接配置 `.v3.json` 则使用该文件。

Host 使用文件锁与原子事务协调多端修改；写入失败返回错误并保留之前已提交的状态。损坏或无法读取的文件拒绝覆盖，修复后重试。普通任务冲突可刷新重试，文档编辑另有修订检查。[迁移与恢复说明](docs/workbench.md)。

## 升级规划

[个人工作台升级规划](docs/personal-workbench-upgrade-plan.md)记录产品范围、数据口径和验收目标；实际使用与实现边界以[工作台说明](docs/workbench.md)为准。

## 开发与验收

```bash
npm ci          # 安装锁定的开发依赖
npm run build   # 从 src/client 生成 client.js
npm test        # 先构建，再运行 Node 测试
npm run preview # 使用临时数据启动真实 API 与界面预览
npm run test:browser # Playwright 浏览器流程；首次使用需 npx playwright install chromium
```

修改 `src/client/` 后再构建，**不要直接编辑 `client.js`**。Three.js 与 esbuild 用于构建，React / ReactDOM 仅用于开发预览；插件界面使用宿主 React。测试会检查产物与源码是否一致。

**2.0 验证：75 项自动测试、17 项隔离浏览器流程检查通过。** 覆盖迁移、并发、报告 / 复盘事实、周期与重试，以及桌面、窄屏深色英文界面。[查看 2.0 验收证据](docs/qa/2026-11-10-workbench-acceptance.md)。尚未在当前用户的真实 DSH profile 安装验收。

以下是 1.0 版本基于功能提交 `8f6f1fb` 的历史验收，不代表 2.0 的完整验证范围：

- **38 项自动测试通过**：覆盖生成产物、存储并发、接口、工具分页、动效调度和新增反馈边界。
- **22 项浏览器验收通过**：覆盖今天页交互、计时全流程、刷新恢复、动态偏好、WebGL 降级与资源清理，以及窄屏英文布局。
- **2 次 axe 检查未发现违规项**：桌面今天页及 375px 英文详情。

[查看完整验收报告](docs/qa/2026-11-04-today-acceptance.md) · [开发与数据参考](docs/development.md) · [更新记录](CHANGELOG.md)

验收使用隔离演示数据与本地浏览器预览；阶段到期通过缩短测试截止时间验证。本轮未进行真实 DSH Host 安装验收，也未实际等待完整的 30 分钟。

## License

[MIT](LICENSE) © 2026 kaelinda · [第三方许可](THIRD_PARTY_NOTICES.md)
