#!/usr/bin/env node
/**
 * Web Clipboard Server - Node.js + WebSocket 版本
 * 支持多设备实时同步剪贴板
 */

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs').promises;
const path = require('path');
const { generateQRCode, getLocalIP } = require('./utils');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// 配置
const PORT = process.env.PORT || 5001;
const HISTORY_DIR = 'history';

// 确保历史记录目录存在
async function ensureHistoryDir() {
    try {
        await fs.access(HISTORY_DIR);
    } catch {
        await fs.mkdir(HISTORY_DIR);
    }
}

// 保存历史记录
async function saveHistory(text) {
    const timestamp = new Date().toISOString().replace(/[-:T]/g, '').split('.')[0];
    const filename = `${timestamp}.txt`;
    const filepath = path.join(HISTORY_DIR, filename);
    await fs.writeFile(filepath, text, 'utf-8');
    return filename;
}

// 获取历史记录列表
async function getHistory(limit = 10) {
    try {
        const files = await fs.readdir(HISTORY_DIR);
        const txtFiles = files.filter(f => f.endsWith('.txt'));
        
        const fileList = await Promise.all(
            txtFiles.map(async filename => {
                const filepath = path.join(HISTORY_DIR, filename);
                const stats = await fs.stat(filepath);
                const content = await fs.readFile(filepath, 'utf-8');
                const lines = content.split('\n');
                const preview = lines.slice(0, 2).join('\n').trim();
                
                return {
                    filename,
                    preview,
                    content,
                    mtime: stats.mtimeMs
                };
            })
        );
        
        // 按修改时间倒序排列
        fileList.sort((a, b) => b.mtime - a.mtime);
        return fileList.slice(0, limit);
    } catch (err) {
        console.error('获取历史记录失败:', err);
        return [];
    }
}

// WebSocket 连接管理
const clients = new Set();

// 心跳检测配置
const HEARTBEAT_INTERVAL = 30000; // 30秒

// 为每个连接添加心跳状态
const clientHeartbeats = new Map();

wss.on('connection', (ws) => {
    console.log('✅ 新客户端连接，当前在线:', clients.size + 1);
    clients.add(ws);
    
    // 初始化心跳状态
    clientHeartbeats.set(ws, {
        isAlive: true,
        lastPing: Date.now()
    });
    
    // 发送欢迎消息
    ws.send(JSON.stringify({
        type: 'connected',
        message: '已连接到剪贴板服务器',
        online: clients.size
    }));
    
    // 广播在线人数
    broadcast({
        type: 'online',
        count: clients.size
    });
    
    // 处理 pong 响应
    ws.on('pong', () => {
        const heartbeat = clientHeartbeats.get(ws);
        if (heartbeat) {
            heartbeat.isAlive = true;
            heartbeat.lastPing = Date.now();
            // 减少日志输出：只在开发调试时启用
            // console.log('💓 收到客户端心跳响应');
        }
    });
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            console.log('📨 收到消息:', data.type);
            
            if (data.type === 'clipboard') {
                // 保存历史记录
                saveHistory(data.text).catch(console.error);
                
                // 广播给所有客户端（除了发送者）
                broadcast({
                    type: 'clipboard',
                    text: data.text,
                    from: data.from || 'unknown',
                    timestamp: Date.now()
                }, ws);
            }
        } catch (err) {
            console.error('处理消息失败:', err);
        }
    });
    
    ws.on('close', () => {
        clients.delete(ws);
        clientHeartbeats.delete(ws);
        console.log('❌ 客户端断开，当前在线:', clients.size);
        
        // 广播在线人数
        broadcast({
            type: 'online',
            count: clients.size
        });
    });
    
    ws.on('error', (err) => {
        console.error('WebSocket 错误:', err);
        clients.delete(ws);
        clientHeartbeats.delete(ws);
    });
});

// 心跳检测定时器
const heartbeatInterval = setInterval(() => {
    const now = Date.now();
    let deadConnections = 0;
    
    clients.forEach(client => {
        const heartbeat = clientHeartbeats.get(client);
        
        if (!heartbeat) {
            console.log('⚠️  发现未初始化心跳的连接，移除');
            client.terminate();
            clients.delete(client);
            deadConnections++;
            return;
        }
        
        // 检查上次心跳时间
        const timeSinceLastPing = now - heartbeat.lastPing;
        
        if (!heartbeat.isAlive) {
            console.log(`❌ 客户端心跳超时 (${timeSinceLastPing}ms)，强制断开连接`);
            client.terminate();
            clients.delete(client);
            clientHeartbeats.delete(client);
            deadConnections++;
            
            // 广播在线人数更新
            broadcast({
                type: 'online',
                count: clients.size
            });
            return;
        }
        
        // 发送 ping
        heartbeat.isAlive = false;
        try {
            if (client.readyState === WebSocket.OPEN) {
                client.ping();
            } else {
                console.log(`⚠️  连接状态异常 (readyState: ${client.readyState})，移除连接`);
                client.terminate();
                clients.delete(client);
                clientHeartbeats.delete(client);
                deadConnections++;
            }
        } catch (err) {
            console.error('❌ 发送心跳失败:', err.message);
            client.terminate();
            clients.delete(client);
            clientHeartbeats.delete(client);
            deadConnections++;
        }
    });
    
    // 只在有异常时才输出详细日志
    if (deadConnections > 0) {
        console.log(`\n💓 [心跳检测] 清理了 ${deadConnections} 个失效连接，当前在线: ${clients.size}\n`);
    }
}, HEARTBEAT_INTERVAL);

// 广播消息给所有客户端（可选排除某个客户端）
function broadcast(data, excludeWs = null) {
    const message = JSON.stringify(data);
    let successCount = 0;
    let failCount = 0;
    
    clients.forEach(client => {
        if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
            try {
                client.send(message);
                successCount++;
            } catch (err) {
                console.error('❌ 发送消息失败:', err.message);
                failCount++;
                // 发送失败，标记为需要清理
                const heartbeat = clientHeartbeats.get(client);
                if (heartbeat) {
                    heartbeat.isAlive = false;
                }
            }
        }
    });
    
    if (data.type === 'clipboard') {
        console.log(`📡 广播剪贴板消息: 成功 ${successCount} 个, 失败 ${failCount} 个`);
    }
}

// Express 中间件
app.use(express.json());
app.use(express.static('.'));

// API 路由
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/ping', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: '服务器运行中',
        online: clients.size,
        uptime: process.uptime()
    });
});

app.get('/history', async (req, res) => {
    const list = await getHistory(10);
    res.json({ success: true, list });
});

app.post('/send', async (req, res) => {
    const { text } = req.body;
    
    if (!text) {
        return res.json({ success: false, message: '内容为空' });
    }
    
    console.log(`\n📡 [API发送] 收到剪贴板内容 (${text.length} 字符)`);
    console.log(`   预览: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`);
    console.log(`   当前在线客户端: ${clients.size}`);
    
    // 保存历史记录
    await saveHistory(text);
    
    // 通过 WebSocket 广播给所有客户端
    broadcast({
        type: 'clipboard',
        text,
        from: 'api',
        timestamp: Date.now()
    });
    
    console.log(`✅ API发送完成\n`);
    
    res.json({ 
        success: true, 
        message: `已发送给 ${clients.size} 个客户端` 
    });
});

// 启动服务器
async function start() {
    await ensureHistoryDir();
    
    server.listen(PORT, '0.0.0.0', async () => {
        const localIP = getLocalIP();
        const url = `http://${localIP}:${PORT}`;
        
        console.log('\n' + '='.repeat(50));
        console.log('     Web Clipboard Server (Node.js + WebSocket)');
        console.log('='.repeat(50));
        console.log(`本地访问: http://localhost:${PORT}`);
        console.log(`手机访问: ${url}`);
        console.log(`WebSocket: ws://${localIP}:${PORT}`);
        console.log('='.repeat(50) + '\n');
        console.log('💡 多设备实时同步已启用');
        console.log('💓 心跳检测已启动 (每 30秒检查一次)');
        console.log('📱 在任意设备发送剪贴板，其他设备会实时收到\n');
        
        // 显示二维码
        console.log('📱 手机扫码访问:');
        const qrcode = await generateQRCode(url);
        console.log(qrcode);
    });
}

start().catch(console.error);

// 优雅退出
process.on('SIGINT', () => {
    console.log('\n\n🛑 正在关闭服务器...');
    clearInterval(heartbeatInterval);
    clients.forEach(client => client.close());
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n\n🛑 正在关闭服务器...');
    clearInterval(heartbeatInterval);
    clients.forEach(client => client.close());
    process.exit(0);
});
