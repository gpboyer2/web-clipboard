# Web Clipboard - 服务器部署指南

## 🎯 项目简介

多设备实时同步剪贴板工具，支持 WebSocket 实时广播。
- 任意设备发送剪贴板，其他所有设备实时收到
- 支持持久化历史记录
- 响应式设计，完美支持手机和电脑

---

## 📦 服务器信息

```
服务器 IP: 156.245.200.31
SSH 端口: 22000
用户名: root
项目路径: /www/wwwroot/ppll-web-clipboard
```

---

## 🚀 部署步骤

### 1️⃣ 连接服务器

```bash
ssh root@156.245.200.31 -p 22000
# 密码: US57dBAyKQEG
```

### 2️⃣ 创建项目目录

```bash
mkdir -p /www/wwwroot/ppll-web-clipboard
cd /www/wwwroot/ppll-web-clipboard
```

### 3️⃣ 安装 Node.js（如未安装）

```bash
# 检查是否已安装
node -v

# 如未安装，使用 NVM 安装（推荐）
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 18
nvm use 18
```

### 4️⃣ 上传文件到服务器

在本地执行（或使用 FTP/SFTP 工具）：

```bash
# 从本地上传所有文件
scp -P 22000 -r /Users/peng/Desktop/Project/web-clipboard/* root@156.245.200.31:/www/wwwroot/ppll-web-clipboard/
```

或者在服务器上：

```bash
cd /www/wwwroot/ppll-web-clipboard

# 创建必要的文件（粘贴代码）
# 1. 创建 package.json
# 2. 创建 server.js  
# 3. 创建 index.html
```

### 5️⃣ 安装依赖

```bash
cd /www/wwwroot/ppll-web-clipboard
npm install
```

### 6️⃣ 测试运行

```bash
# 临时运行测试
node server.js

# 访问 http://156.245.200.31:5001 测试
```

### 7️⃣ 使用 PM2 守护进程（推荐）

```bash
# 安装 PM2
npm install -g pm2

# 启动服务
pm2 start server.js --name web-clipboard

# 设置开机自启
pm2 startup
pm2 save

# 查看状态
pm2 status

# 查看日志
pm2 logs web-clipboard

# 重启服务
pm2 restart web-clipboard

# 停止服务
pm2 stop web-clipboard
```

---

## 🔧 配置防火墙

确保端口 5001 已开放：

```bash
# CentOS/RHEL
firewall-cmd --zone=public --add-port=5001/tcp --permanent
firewall-cmd --reload

# Ubuntu/Debian
ufw allow 5001/tcp
ufw reload
```

---

## 🌐 Nginx 反向代理（可选）

如果要使用域名访问，配置 Nginx：

```nginx
server {
    listen 80;
    server_name clipboard.yourdomain.com;

    location / {
        proxy_pass http://localhost:5001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

```bash
# 测试配置
nginx -t

# 重启 Nginx
systemctl restart nginx
```

---

## 📱 使用方法

### 访问地址

- **本地开发**: http://localhost:5001
- **局域网访问**: http://[本机IP]:5001  
- **服务器访问**: http://156.245.200.31:5001

### 多设备同步

1. 在手机、电脑上同时打开网页
2. 任意设备输入文字并点击"确定发送"
3. 其他设备会**实时**收到剪贴板内容
4. 支持查看和重新发送历史记录

---

## 🛠️ 常用命令

```bash
# 查看服务状态
pm2 status

# 查看实时日志
pm2 logs web-clipboard --lines 100

# 重启服务
pm2 restart web-clipboard

# 停止服务
pm2 stop web-clipboard

# 删除服务
pm2 delete web-clipboard

# 查看端口占用
lsof -i:5001

# 杀死端口进程
kill -9 $(lsof -ti:5001)
```

---

## 📊 监控与维护

### 查看在线用户数

访问健康检查接口：
```bash
curl http://156.245.200.31:5001/ping
```

返回示例：
```json
{
  "status": "ok",
  "message": "服务器运行中",
  "online": 3,
  "uptime": 86400.5
}
```

### 历史记录管理

历史记录存储在 `history/` 目录下：

```bash
# 查看历史记录数量
ls -l /www/wwwroot/ppll-web-clipboard/history | wc -l

# 清理 30 天前的历史记录
find /www/wwwroot/ppll-web-clipboard/history -name "*.txt" -mtime +30 -delete
```

---

## 🔐 安全建议

1. **添加访问密码**（可选）
   - 修改 `server.js` 添加简单的认证逻辑
   
2. **限制访问 IP**（可选）
   ```bash
   # 仅允许特定 IP 访问
   firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="your-ip" port protocol="tcp" port="5001" accept'
   ```

3. **HTTPS 加密**（推荐）
   - 使用 Nginx + Let's Encrypt 配置 SSL 证书

---

## 🐛 故障排查

### 服务无法启动

```bash
# 查看详细错误
pm2 logs web-clipboard --err

# 检查端口占用
lsof -i:5001
```

### WebSocket 连接失败

1. 检查防火墙是否开放端口 5001
2. 检查 Nginx 配置是否支持 WebSocket
3. 查看浏览器控制台错误信息

### 历史记录不显示

```bash
# 检查目录权限
ls -la /www/wwwroot/ppll-web-clipboard/history

# 修复权限
chmod 755 /www/wwwroot/ppll-web-clipboard/history
```

---

## 📝 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm start

# 或使用自动重启
npm run dev

# 或使用启动脚本
./start-node.sh
```

---

## 🆚 与 Python 版本对比

| 特性 | Python 版本 | Node.js 版本 |
|------|------------|--------------|
| 实时同步 | ❌ 需手动获取 | ✅ WebSocket 自动同步 |
| 多设备支持 | ⚠️ 仅 Mac 本地 | ✅ 所有设备 |
| 持久化 | ✅ | ✅ |
| 性能 | 中等 | 高（事件驱动）|
| 部署 | 需 Python 环境 | 需 Node.js 环境 |

---

## 📄 项目文件结构

```
web-clipboard/
├── server.js           # Node.js 服务器
├── index.html          # 前端页面
├── package.json        # 依赖配置
├── start-node.sh       # 启动脚本
├── history/            # 历史记录目录（自动创建）
│   └── *.txt          # 时间戳命名的历史文件
└── DEPLOY.md           # 本文档
```

---

## 🎉 完成！

现在你可以：
- ✅ 在任意设备访问 http://156.245.200.31:5001
- ✅ 手机、电脑实时同步剪贴板
- ✅ 查看和重新发送历史记录
- ✅ 24/7 稳定运行

有问题请查看日志：`pm2 logs web-clipboard`
