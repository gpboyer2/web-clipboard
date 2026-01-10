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

# 启动服务器
python server.py
