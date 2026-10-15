# Raycast 扩展

个人维护的 Raycast 扩展集合。每个一级目录都是独立项目，分别安装依赖、配置和开发；根目录不是 pnpm workspace。当前以 macOS 为验证平台。

## 插件清单

| 插件 | 目录 | 命令与用途 | 依赖 |
| --- | --- | --- | --- |
| JWT Editor | [jwt-editor](jwt-editor/README.md) | JWT Editor：解码 Header/Payload、查看过期时间；Quick Link：创建预填 token 的快捷链接 | 本地处理，无需 API |
| OpenClaw | [openclaw](openclaw/README.md) | Status、Sessions、Logs、Restart：查看本机 Gateway 状态、会话、日志，以及手动重启/清理 | 本机 OpenClaw CLI 和 Gateway |
| LinguaDock | [linguadock](linguadock/README.md) | Translate Text：选区或手动输入翻译，支持 21 种目标语言及中英自动互译 | 自定义 OpenAI-compatible API |
| Emoji Append | [emoji-append](emoji-append/README.md) | Append Contextual Emoji：按快捷键为选中文字追加 1～3 个应景 emoji | 自定义 OpenAI-compatible API |

JWT Editor 提供解码和查看功能，不验证 token 签名。

## 安装与开发

需要安装 Raycast、Node.js 和 pnpm。建议使用 Node.js 22.22.2+ 或 24 LTS；这是本地构建工具的运行环境，扩展执行时的 Node 由 Raycast 管理。参见 [Raycast 版本说明](https://developers.raycast.com/information/versioning)和 [CLI 运行环境变更](https://developers.raycast.com/misc/changelog)。

在目标插件目录执行，例如 Emoji Append：

```sh
cd emoji-append
pnpm install --frozen-lockfile
pnpm dev
```

`pnpm dev` 将扩展编译并加入本机 Raycast，持续监听源码变化。在 Raycast 的扩展设置中填写配置并绑定快捷键；开发进程可用 `Ctrl+C` 停止。目录迁移后，应先停止旧目录的开发进程，再从新目录启动。

Emoji Append 是普通 `no-view` command，不依赖 PopClip 仓库、Raycast AI Command 或 Raycast Pro。

常用开发检查：

```sh
pnpm test
pnpm lint
pnpm exec tsc --noEmit
pnpm build
```

各插件均提供 `pnpm test`，使用模拟响应、临时文件和本地测试进程，不调用真实付费 API。`ray build` 会打包代码，但不能替代 `tsc --noEmit`；构建成功不代表类型检查通过。

## 配置与数据处理

- Emoji Append 和 LinguaDock 在各自扩展设置中独立填写 API Base URL、API Key、模型。API Key 使用 password 字段，源码不包含密钥；执行时，输入文字会发送到配置的服务。
- JWT Editor 在本地解码，不验证签名。Quick Link 会将 token 放入链接上下文并保存到 Raycast；不适合保存长期有效或生产用途的 token。
- OpenClaw 调用本机 CLI，日志路径支持自动发现或自定义。重启和清理会改变 Gateway/会话状态，只有执行相应动作时才触发。
- `pnpm dev`/`pnpm build` 是本地开发操作；`publish` 类脚本会发布扩展，应在确认发布目标后单独执行。
