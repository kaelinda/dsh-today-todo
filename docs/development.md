# 开发与数据参考

[返回 README](../README.md)

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
| `todayAt` | 该条目加入当天专注清单的时刻；列表按优先级及创建时间排序 |

文档缺失或损坏时会降级显示空清单，不阻止插件激活。读取不会移动文件；第一次变更会在锁内先把损坏文档移到
`todos.json.corrupt-<timestamp>`，方便查看或恢复。备份失败或文档无法读取时拒绝变更，避免以空清单覆盖原数据。版本 1 的旧记录会被归一化到版本 2。

### 并发与恢复

- 面板每次变更都带上它渲染时看到的 `revision`。若这期间智能体或另一个标签页写入了，Host 返回 `409` 与 `code: todo_revision_conflict` 及其当前快照；面板采用该快照并重试一次，而不是用旧状态覆盖新清单。
- 每次变更先取同级锁文件 `todos.json.lock`，在锁内重读文档后再应用操作。因此第二个进程会在前一个的结果上合并，而不是用陈旧内存整体替换文件；崩溃进程留下的锁 10 秒后自动回收。
- 持久化写入临时文件、fsync、再原子 rename 覆盖文档，并尽力 fsync 目录。临时文件名带进程唯一后缀，并发写者不会共用同一文件。
- 只有临时文件写入、fsync 和 rename 成功后，才发布新清单与 revision。任何一步失败均返回 `todo_persistence_failed`（HTTP 503），保留已提交快照，不会声称保存成功。用户可以修复磁盘问题后重试；重试仍在锁内重读，保留其他实例的变更。
- 无法安全读取或备份时返回 `todo_storage_unavailable`（HTTP 503）。面板持续显示 `lastError` 存储警告；智能体工具也会返回失败或在列表里显示警告。
- rename 后目录 fsync 是尽力执行：此时文件已保存，不能返回普通保存失败而诱发重复添加。无法同步时返回已保存结果与警告。
