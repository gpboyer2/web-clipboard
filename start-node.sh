#!/bin/bash
# Web Clipboard 启动脚本 (Node.js 版本)

echo "╔═══════════════════════════════════════╗"
echo "║  Web Clipboard Server (Node.js)      ║"
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

# 检查并清理端口 5001
PORT=5001
PID=$(lsof -ti:$PORT 2>/dev/null)
if [ -n "$PID" ]; then
    echo "🔄 端口 $PORT 被占用 (PID: $PID)，正在终止..."
    kill -9 $PID
    sleep 1
fi

# 启动服务器
echo "🚀 启动服务器..."
node server.js
