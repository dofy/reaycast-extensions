# JWT Editor

在 Raycast 中本地解码 JWT，查看 Header、Payload、Signature 和时间字段。

## 命令

- **JWT Editor**：粘贴三段式 JWT，解码查看，并复制 Header、Payload 或原 token。
- **Quick Link**：创建 Raycast 快捷链接，打开时预填指定 token。

当前没有编辑、编码、签名或验签功能。有效期显示只比较 `exp` 和本机时间，不代表 token 的签名有效或具备访问权限。

## 输入与使用

Header 和 Payload 必须是 JSON 对象，常见 claim 和时间字段需要符合 JWT 类型要求。无效输入会在表单提示错误。Quick Link 需要非空名称和有效的三段式 token。

## 配置与开发

```sh
cd jwt-editor
pnpm install --frozen-lockfile
pnpm dev
```

不需要联网 API 或密钥。扩展不会进行签名验证。

Quick Link 会将 token 编码在链接上下文中并保存到 Raycast；建议只用于可公开的测试 token。复制操作使用系统剪贴板，并使用 Raycast 的 concealed 选项，不加入 Raycast 剪贴板历史。

## 开发检查

```sh
pnpm test
pnpm lint
pnpm exec tsc --noEmit
pnpm build
```

测试使用本地构造的 token，不访问真实账户。
