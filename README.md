# Web Clipboard

多设备实时剪贴板同步工具，通过 WebSocket 实现设备间的即时通信。

## 功能

- 任意设备复制内容，其他所有设备实时同步
- 支持历史记录持久化存储
- 响应式设计，完美支持手机和电脑
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
ssh root@156.245.200.31 -p 22000

# 使用 PM2 启动服务
pm2 start server-remote.js --name web-clipboard
pm2 save
```

访问 http://156.245.200.31:5001

## 使用方法

1. 在多台设备上同时打开网页
2. 任意设备输入文字并发送
3. 其他设备实时收到内容
4. 点击内容可快速复制到剪贴板

## 项目结构

```
web-clipboard/
├── server-local.js       # 本地服务器
├── server-remote.js      # 远程服务器
├── client-mac.js         # Mac 客户端
├── client-windows.js     # Windows 客户端
├── index.html            # Web 界面
├── utils.js              # 工具函数
└── history/              # 历史记录
```

## 可用脚本

```bash
npm start              # 启动本地服务器
npm run start:local    # 启动本地服务器
npm run start:remote   # 启动远程服务器
npm run client:mac     # 运行 Mac 客户端
npm run client:windows # 运行 Windows 客户端
npm run dev:local      # 本地开发模式（nodemon）
npm run dev:remote     # 远程开发模式（nodemon）
```

## 依赖

- express: Web 服务器
- ws: WebSocket 实现

## 许可证

MIT
