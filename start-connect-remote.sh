#!/bin/bash
# Web Clipboard 启动脚本 - 连接远程服务器
# Mac 客户端连接远程服务器，自动同步剪贴板

echo "╔═══════════════════════════════════════╗"
echo "║  Web Clipboard - 连接远程服务器      ║"
echo "╚═══════════════════════════════════════╝"
echo ""

# 进入项目目录
cd "$(dirname "$0")"

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 未安装 Node.js，请先安装: https://nodejs.org/"
    exit 1
fi

# 检查并安装依赖
if [ ! -d "node_modules" ]; then
    echo "📦 安装依赖..."
    npm install
fi

# 启动 Mac 监听客户端
echo "🚀 启动 Mac 监听客户端..."
echo "💡 将连接到远程服务器: ws://156.245.200.31:5001"
echo ""
node client-mac.js
