#!/bin/bash
# Web Clipboard 启动脚本

echo "╔═══════════════════════════════════════╗"
echo "║     Web Clipboard Server              ║"
echo "╚═══════════════════════════════════════╝"
echo ""

# 进入项目目录
cd "$(dirname "$0")"

# 检查虚拟环境
if [ ! -d "venv" ]; then
    echo "创建虚拟环境..."
    python3 -m venv venv
fi

# 激活虚拟环境
source venv/bin/activate

# 安装依赖
pip install flask -q

# 检查并清理端口 5001
PORT=5001
PID=$(lsof -ti:$PORT)
if [ -n "$PID" ]; then
    echo "端口 $PORT 被占用 (PID: $PID)，正在终止..."
    kill -9 $PID
    sleep 1
fi

# 启动服务器
python server.py
