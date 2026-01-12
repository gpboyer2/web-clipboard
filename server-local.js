#!/usr/bin/env node
/**
 * 本地模式服务器 - Mac 直接当服务器
 * 手机直接连接 Mac，Mac 自动同步系统剪贴板
 */

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

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

// Mac 剪贴板操作
async function setClipboard(text) {
    try {
        await execAsync(`echo ${JSON.stringify(text)} | pbcopy`);
        return true;
    } catch (err) {
        console.error('设置剪贴板失败:', err.message);
        return false;
    }
}

async function getClipboard() {
    try {
        const { stdout } = await execAsync('pbpaste');
        return stdout;
    } catch (err) {
        console.error('获取剪贴板失败:', err.message);
        return '';
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
        
        fileList.sort((a, b) => b.mtime - a.mtime);
        return fileList.slice(0, limit);
    } catch (err) {
        console.error('获取历史记录失败:', err);
        return [];
    }
}

// WebSocket 连接管理
const clients = new Set();

wss.on('connection', (ws) => {
    console.log('✅ 新设备连接，当前在线:', clients.size + 1);
    clients.add(ws);
    
    ws.send(JSON.stringify({
        type: 'connected',
        message: '已连接到 Mac 本地服务器',
        mode: 'local',
        online: clients.size
    }));
    
    broadcast({
        type: 'online',
        count: clients.size
    });
    
    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            console.log('📨 收到消息:', data.type);
            
            if (data.type === 'clipboard') {
                // 同步到 Mac 系统剪贴板
                await setClipboard(data.text);
                console.log('✅ 已同步到 Mac 剪贴板:', data.text.substring(0, 50));
                
                // 保存历史记录
                await saveHistory(data.text);
                
                // 广播给其他客户端
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
        console.log('❌ 设备断开，当前在线:', clients.size);
        
        broadcast({
            type: 'online',
            count: clients.size
        });
    });
    
    ws.on('error', (err) => {
        console.error('WebSocket 错误:', err);
        clients.delete(ws);
    });
});

function broadcast(data, excludeWs = null) {
    const message = JSON.stringify(data);
    clients.forEach(client => {
        if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
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
        message: 'Mac 本地服务器运行中',
        mode: 'local',
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
    
    // 同步到 Mac 系统剪贴板
    await setClipboard(text);
    
    // 保存历史记录
    await saveHistory(text);
    
    // 通过 WebSocket 广播
    broadcast({
        type: 'clipboard',
        text,
        from: 'api',
        timestamp: Date.now()
    });
    
    res.json({ 
        success: true, 
        message: `已同步到 Mac 剪贴板，并发送给 ${clients.size} 个设备` 
    });
});

app.get('/get', async (req, res) => {
    const text = await getClipboard();
    res.json({ success: true, text });
});

// 获取本机 IP
function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}

// 启动服务器
async function start() {
    await ensureHistoryDir();
    
    server.listen(PORT, '0.0.0.0', () => {
        const localIP = getLocalIP();
        console.log('\n' + '='.repeat(50));
        console.log('     📱 本地模式 - Mac 直接当服务器');
        console.log('='.repeat(50));
        console.log(`本机访问: http://localhost:${PORT}`);
        console.log(`手机访问: http://${localIP}:${PORT}`);
        console.log('='.repeat(50) + '\n');
        console.log('💡 使用说明:');
        console.log('   - 手机和 Mac 需在同一局域网');
        console.log('   - 手机访问上面的地址即可同步剪贴板');
        console.log('   - Mac 会自动同步到系统剪贴板\n');
    });
}

start().catch(console.error);
