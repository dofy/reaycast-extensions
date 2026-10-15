# OpenClaw for Raycast

在 Raycast 中查看和管理本机 OpenClaw Gateway。需要已安装的 OpenClaw CLI；功能按钮使用英文，状态概览使用中文。

## 命令

| 命令                     | 用途                                                     |
| ------------------------ | -------------------------------------------------------- |
| OpenClaw Status          | Gateway 状态、检查耗时、渠道状态、会话数量及需关注项目   |
| OpenClaw Sessions        | 会话列表、模型和 token 使用量，可刷新或手动清理          |
| OpenClaw Logs            | 可搜索的日志列表和详情，按级别筛选、合并重复项并保留原文 |
| Restart OpenClaw Gateway | 手动重启本机 Gateway 服务                                |

**Refresh** 使用 `⌘R`；状态页的 **Restart Gateway** 使用 `⌘⇧R`，会话页的 **Cleanup Sessions** 使用 `⌘⇧D`。重启、清理只在执行相应动作时触发，CLI 调用为异步，默认超时为 20 秒，可在设置中调整。

## 状态与日志

- 状态来自 `openclaw health --json --no-color`。渠道的配置、运行、连接和探测结果分别展示；缺失字段显示“未报告”，不直接判为故障。
- 会话来自 `openclaw sessions --json --no-color`。缺失的指标显示未知，无效响应显示错误。
- 日志默认只读取文件尾部最多 256 KiB，展示最近最多 80 条记录；读取大小和条数可配置，最新在前。重复项合并并显示次数，选中后可查看或复制全部原文。
- 日志支持纯文本与按日 JSON 记录、UTC `Z` 和数值时区。详情使用代码块展示，路径和正文不会被解释为 Markdown 格式。

## 配置

在日志、状态或会话页的 Actions 中选择 **Extension Preferences** 打开设置。路径支持绝对路径和 `~/`；标为 `auto` 的选项留空也表示自动。

| 设置                        | 默认值          | 用途                                                   |
| --------------------------- | --------------- | ------------------------------------------------------ |
| OpenClaw Binary Path        | `auto`          | 自动查找 CLI，也可指定可执行文件                       |
| Log File Path               | `auto`          | 自动查找日志，也可直接指定日志文件                     |
| State Directory             | `auto`          | 继承 OpenClaw 环境；通常为 `~/.openclaw`               |
| Config File Path            | `auto`          | 继承 OpenClaw 配置；通常为状态目录中的 `openclaw.json` |
| Additional Executable Paths | 空              | 补充 CLI / Node 搜索目录，以冒号分隔                   |
| Diagnostic Log Directory    | `/tmp/openclaw` | 按日日志目录，读取最新的 `openclaw-YYYY-MM-DD.log`     |
| Command Timeout (Seconds)   | `20`            | 所有 CLI 命令的超时，范围 1–300 秒                     |
| CLI Output Limit (MiB)      | `2`             | CLI 响应大小上限，范围 1–16 MiB                        |
| Log Entry Limit             | `80`            | 合并重复项之前的最近记录数量，范围 1–1000              |
| Log Read Window (KiB)       | `256`           | 日志尾部读取大小，范围 16–4096 KiB                     |
| Default Log Level           | All Levels      | 打开日志页时的默认级别筛选                             |
| Group Repeated Logs         | 开启            | 合并重复消息，详情保留所有原文                         |

CLI 自动从 `.local/bin`、pnpm/npm 目录、PATH、fnm 默认别名及 Homebrew 等位置查找。额外搜索目录优先使用，可用于非标准 Node 安装。

默认实例的日志自动查找顺序：

1. `~/Library/Logs/openclaw/gateway.log`
2. 状态目录中的 `logs/gateway.log`
3. 按日日志目录或系统临时目录中最新的 `openclaw-YYYY-MM-DD.log`

设置状态目录或配置文件只影响扩展启动的 CLI 子进程，不修改系统环境或 OpenClaw 配置文件。`auto` 保留已有的 `OPENCLAW_STATE_DIR`、`OPENCLAW_HOME`、`OPENCLAW_CONFIG_PATH` 等环境设置；Raycast 进程未继承终端环境时可直接填写路径。

使用自定义状态目录、配置文件或继承的 profile 时，自动发现会跳过默认服务日志及默认临时日志，避免混入另一实例。此时先查找状态目录的日志，或使用自定义 **Log File Path** / **Diagnostic Log Directory**。日志路径直接指定时优先级最高。

文件缺失、权限不足或路径错误会显示相应提示；数字设置超出范围会要求修正。扩展面向本机，不提供远程主机管理。

## 开发

```sh
cd openclaw
pnpm install --frozen-lockfile
pnpm dev
```

检查命令：

```sh
pnpm test
pnpm lint
pnpm exec tsc --noEmit
pnpm build
```

测试使用模拟数据、临时文件和测试进程，不重启真实 Gateway，不清理实际会话。
