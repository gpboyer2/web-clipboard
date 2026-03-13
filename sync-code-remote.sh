#!/bin/bash
# 同步代码到远程服务器
# 排除 .git、node_modules、history 等不需要的文件

echo "🚀 开始部署到远程服务器..."
echo ""

# 服务器配置
SERVER="root@156.226.177.6"
PORT="22000"
REMOTE_PATH="/www/wwwroot/ppll-web-clipboard"

# 当前目录
LOCAL_PATH="$(cd "$(dirname "$0")" && pwd)"

echo "📦 压缩项目文件（排除不需要的文件）..."

# 创建临时压缩包（排除不需要的文件）
tar -czf /tmp/web-clipboard.tar.gz \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='server/history' \
  --exclude='venv' \
  --exclude='__pycache__' \
  --exclude='*.pyc' \
  --exclude='.DS_Store' \
  --exclude='*.log' \
  --exclude='sync-code-remote.sh' \
  -C "$LOCAL_PATH" .

echo "✅ 压缩完成"
echo ""

echo "📤 上传到服务器..."
scp -P $PORT /tmp/web-clipboard.tar.gz $SERVER:/tmp/

echo "✅ 上传完成"
echo ""

echo "📂 解压到目标目录..."
ssh -p $PORT $SERVER << 'EOF'
# 创建目录（如果不存在）
mkdir -p /www/wwwroot/ppll-web-clipboard

# 解压文件
cd /www/wwwroot/ppll-web-clipboard
tar -xzf /tmp/web-clipboard.tar.gz

# 清理临时文件
rm /tmp/web-clipboard.tar.gz

echo "✅ 解压完成"
echo ""

# 安装依赖
echo "📦 安装 Node.js 依赖..."
npm install

echo ""
echo "✅ 部署完成！"
echo ""
echo "🎯 下一步操作："
echo "   1. 启动服务: pm2 start remote.js --name web-clipboard"
echo "   2. 或重启服务: pm2 restart web-clipboard"
echo "   3. 查看状态: pm2 status"
echo "   4. 查看日志: pm2 logs web-clipboard"
EOF

# 清理本地临时文件
rm /tmp/web-clipboard.tar.gz

echo ""
echo "🎉 全部完成！"
echo "📱 手机访问: http://156.226.177.6:5001"
