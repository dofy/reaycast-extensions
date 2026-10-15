# OpenClaw for Raycast

在 Raycast 中查看和管理本机 OpenClaw Gateway。需要已安装的 OpenClaw CLI；功能按钮使用英文，状态概览使用中文。

## 命令

| 命令 | 用途 |
| --- | --- |
| OpenClaw Status | Gateway 状态、检查耗时、渠道状态、会话数量及需关注项目 |
| OpenClaw Sessions | 会话列表、模型和 token 使用量，可刷新或手动清理 |
| OpenClaw Logs | 可搜索的日志列表和详情，按级别筛选、合并重复项并保留原文 |
| Restart OpenClaw Gateway | 手动重启本机 Gateway 服务 |

**Refresh** 使用 `⌘R`；状态页的 **Restart Gateway** 使用 `⌘⇧R`，会话页的 **Cleanup Sessions** 使用 `⌘⇧D`。重启、清理只在执行相应动作时触发，CLI 调用为异步，超时为 20 秒。

## 状态与日志

- 状态来自 `openclaw health --json --no-color`。渠道的配置、运行、连接和探测结果分别展示；缺失字段显示“未报告”，不直接判为故障。
- 会话来自 `openclaw sessions --json --no-color`。缺失的指标显示未知，无效响应显示错误。
- 日志只读取文件尾部最多 256 KiB，展示最近最多 80 条记录，最新在前。重复项合并并显示次数，选中后可查看或复制全部原文。
- 日志支持纯文本与按日 JSON 记录、UTC `Z` 和数值时区。详情使用代码块展示，路径和正文不会被解释为 Markdown 格式。

## 配置

**OpenClaw Binary Path** 留空时，自动从 `.local/bin`、pnpm/npm 目录、PATH、fnm 默认别名及 Homebrew 等位置查找。也可填写完整可执行文件路径或 `~/` 路径。子进程 PATH 根据本机环境构建。

**Log File Path** 可选填日志文件完整路径或 `~/` 路径。留空时依次查找：

1. `~/Library/Logs/openclaw/gateway.log`
2. OpenClaw 状态目录下的 `logs/gateway.log`，状态目录默认为 `~/.openclaw`，可由 `OPENCLAW_STATE_DIR` 指定。
3. `/tmp/openclaw/` 或系统临时目录中最新的 `openclaw-YYYY-MM-DD.log`。

日志页的 **Configure Log Path** 可打开设置。文件缺失、权限不足或路径错误时会显示相应提示。扩展面向本机，不提供远程主机管理。

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
