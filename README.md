# PRD与评审管理工具

用于编写 PRD、管理评审记录的 Electron 桌面应用。当前版本：1.3.3。

## 开发运行

需要 Node.js、npm 和 Windows 桌面环境。

```sh
npm ci
npm start
```

本机浏览器预览：`npm run preview`（默认 http://127.0.0.1:4173）。

测试：`npm test`。

仅在需要发行包时运行 `npm run build`，输出位于 `releases/`。

## MCP 接入

参见 `MCP入口.txt` 和 `mcp.config.example.json`。本机配置文件 `mcp.config.local.json` 不纳入版本管理。

## 目录说明

- `desktop/`：桌面应用源码、编辑器模板、MCP 服务和测试。
- `package-lock.json`：依赖锁定文件。
- `使用说明.txt`：使用说明。
- `第三方许可.txt`：第三方许可说明。

依赖、发行包、预览数据、测试输出、备份和历史封存保留在本地，不上传到源码仓库。
