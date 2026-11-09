# Kaon Router for Raycast

在 Raycast 中查看 Kaon Router 的当日花费与用量明细。与 [dofy/hammerspoon](https://github.com/dofy/hammerspoon) 的 `statusbar/kaon.lua` 读同一个接口、同一个 token 文件，二者可共存，也可只留其一。功能按钮使用英文，数据展示使用中文。

## 命令

| 命令         | 模式     | 用途                                                                |
| ------------ | -------- | ------------------------------------------------------------------- |
| Kaon Balance | menu-bar | 菜单栏常驻显示当日花费，下拉查看预算、限速和用量明细，每 5 分钟刷新 |
| Kaon Usage   | view     | 完整列表：预算、限速、按模型/Key/供应商/天的明细，可搜索筛选        |

菜单栏标题不支持着色，因此用量超过阈值时改为给图标着色：达到 Warning Threshold 变黄，达到 Critical Threshold 变红。标题内容可在设置中切换为 `$46`、`$46.06`、`$46/$80` 或 `58%`。

**Refresh** 使用 `⌘R`，**Force Refetch** 使用 `⌘⇧R`（忽略退避与明细缓存，重新拉取），**Open Console** 使用 `⌘O`。

## 配置 token

1. 打开 <https://kaon-router-admin.kaonai.com>，进入侧边栏 **Automation Tokens**。
2. 新建 token，勾选 **`usage:read`** scope。Kaon 的写 scope 不包含用量访问，只给写权限会得到 403。
3. 二选一：
   - 在扩展设置的 **Automation Token** 填入 `kaon_pat_...`（password 字段，不进源码）；
   - 或写入文件，留空 Automation Token，扩展会读 **Token File Path**（默认 `~/.config/kaon/token`）：

     ```sh
     mkdir -p ~/.config/kaon
     printf '%s' 'kaon_pat_...' > ~/.config/kaon/token
     chmod 600 ~/.config/kaon/token
     ```

设置里填的 token 优先于文件。token 不会写入缓存，也不会出现在任何界面文案或错误信息里。

启动后扩展会额外请求一次 `/auth/me` 读取 token 有效期，在到期前 14 天（可配置）开始提醒；否则 token 静默过期后只会看到 401。

## 数据来源

- **当日花费**取自 `/users/me/budget`，这是权威计数：控制台 /keys 横幅显示的就是它，真正拦截请求的也是它。
- **明细**取自 `/usage/summary`，来自 Prometheus，与预算计数不对账。2026-11-09 实测预算计数为 46.06 USD，而同一天 `by_day` 桶为 54.23 USD，因此明细只用于分解，并按区间标注，不当作「今日」。
- 区间 token 为 `5m | 1h | 24h | 7d | 30d`，其中 `24h` 上游坏掉：返回 5 个一分钟桶而非一天，因此默认用 `7d`，它的桶确实是整天。没有办法只取今天的 by_model 分解。
- `source=starrocks` 是 T+1 数仓，最新桶是昨天，所以从不使用。
- `by_provider` 的 `total_requests` 对每个供应商都是 0，因此按供应商只展示金额。

## 失败处理

401、403、429，以及响应里带 `automation_protocol_throttled`、`automation_token_suspended`、`operation_plan_denied` 的情况都是停止信号，不是重试信号：扩展会停止发请求，而不是继续冲击控制面。修好原因后用 **Retry (Clear Stop State)** 清除。

其他失败按每次失败 +60 秒退避，上限 30 分钟，期间保留上一次成功的数字并在「上次失败」里说明。错误信息只包含状态码和固定文案，不包含响应体——响应体属于控制面数据。

菜单栏命令每次刷新都是独立进程，因此停止状态、退避截止时间和上次成功的数字存在 Raycast Cache（`kaon-router` namespace）里；token 不进缓存。打开菜单也会触发一次启动，为避免反复开关造成连续请求，相邻两次拉取之间至少间隔 270 秒；明细更重，TTL 为 30 分钟。

## 开发

```sh
cd kaon
pnpm install --frozen-lockfile
pnpm dev
```

检查项：

```sh
pnpm test                 # node --test，纯逻辑，不调用真实 API
pnpm lint
pnpm exec tsc --noEmit
pnpm build
```

`src/` 中模块间相对 import 带 `.ts` 后缀，这样 `node --experimental-strip-types` 能直接解析，测试无需打包；tsconfig 对应开启 `allowImportingTsExtensions`。测试通过注入的 fetch 与 stub client 覆盖错误分级、停止信号、退避、明细 TTL 和 token 解析，不发真实请求。
