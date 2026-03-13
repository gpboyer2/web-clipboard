# Web Clipboard

多设备实时剪贴板同步工具，通过 WebSocket 实现设备间的即时通信。

## 功能

- 任意设备复制内容，其他所有设备实时同步
- 支持历史记录持久化存储
- 响应式设计，完美支持手机和电脑
- 支持专属房间，保护隐私
- 纯净无依赖，单个 HTML 文件即可使用

## 快速开始

### 本地运行

```bash
# 安装依赖
npm install

# 启动本地服务器
npm start
```

访问 http://localhost:5001

### 远程部署

```bash
# 连接远程服务器
ssh root@156.226.177.6 -p 22000

# 使用 PM2 启动服务
pm2 start remote.js --name web-clipboard
pm2 save
```

访问 http://156.226.177.6:5001

## 构建可执行文件

本项目支持将应用打包为独立可执行文件，无需安装 Node.js 即可运行。

### 支持平台

| 平台 | 架构 | 文件名 |
|------|------|--------|
| macOS | x64 | web-clipboard-macos-x64 |
| macOS | arm64 | web-clipboard-macos-arm64 |
| Linux | x64 | web-clipboard-linux |
| Windows | x64 | web-clipboard-win.exe |

### 本地构建

使用提供的构建脚本自动检测当前平台并构建：

```bash
# 安装依赖
npm install

# 执行本地构建（自动检测当前平台）
npm run build:local
```

构建产物位于 `release-build/` 目录。

### GitHub Release 自动构建

推送 tag 到 GitHub 后，会自动触发多平台构建并创建 Release：

```bash
# 创建并推送 tag
git tag v1.0.0
git push origin v1.0.0
```

### 版本信息

打包后的可执行文件会包含 Git 版本信息，启动时会显示：
- Commit ID（7位短哈希）
- 构建日期

例如：`版本: a1b2c3d (2026-03-09)`

## 使用方法

1. 在多台设备上同时打开网页或运行客户端
2. 任意设备输入文字并发送
3. 其他设备实时收到内容
4. 点击历史记录可快速重新发送

### 房间功能

- **主房间**：默认连接到主房间，所有设备互通（公开环境不建议使用）
- **专属房间**：输入房间ID创建专属房间，只有相同房间ID的设备可以互通

## 项目结构

```
web-clipboard/
├── client/                    # 前端代码（部署到服务器）
│   ├── index.html             # Web 界面
│   ├── index.css              # 样式文件
│   ├── index.js               # 前端逻辑
│   └── utils-browser.js       # 浏览器工具函数
├── local-dev/                 # 本地开发入口
│   ├── server-local.js        # 本地服务器（Mac 直连模式）
│   ├── lib/                   # 本地开发专用库
│   │   ├── server-common.js   # 服务端公共逻辑
│   │   └── client-common.js   # 客户端公共逻辑
│   ├── client-mac.js          # Mac 客户端入口
│   └── client-windows.js      # Windows 客户端入口
├── remote.js                  # 远程服务器入口
├── start-connect-remote.js    # 远程客户端启动脚本
├── utils.js                   # 公共工具函数
├── scripts/                   # 构建脚本
│   ├── local-release-build.sh
│   ├── github-release-build.sh
│   └── build-common.sh
└── .github/
    └── workflows/
        └── build.yml          # GitHub Actions 自动构建
```

## 可用脚本

```bash
npm start              # 启动本地服务器（Mac 直连）
npm run start:local    # 同上
npm run start:remote   # 启动远程服务器
npm run client:mac     # 运行 Mac 客户端
npm run client:windows # 运行 Windows 客户端
npm run dev:local      # 本地开发模式（nodemon）
npm run dev:remote     # 远程开发模式（nodemon）
npm run build:local    # 本地构建
npm run build:github   # GitHub Release 构建
```

## 依赖

- express: Web 服务器
- ws: WebSocket 实现
- execa: 进程执行
- uuid: 设备 ID 生成

## 数据流向

```
手机(Web) <--WebSocket/HTTP--> 远程服务器 <--WebSocket--> 电脑客户端(CLI)
```

## 常见问题

### Windows 客户端启动失败

确保已安装 Node.js 18+。或使用打包后的 .exe 文件（无需 Node.js）。

### 打包后运行提示找不到模块

请使用最新版本 v0.0.2，已修复依赖打包问题。

### 如何查看版本号

启动客户端后，标题栏会显示版本 Commit ID 和构建日期。

## 许可证

MIT
