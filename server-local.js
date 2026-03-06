#!/usr/bin/env node
// 本地模式服务器 - Mac 直接当服务器
// 手机直接连接 Mac，Mac 自动同步系统剪贴板

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const { generateQRCode, getLocalIP } = require('./utils');
const { execa } = require('execa');

const execAsync = promisify(exec);

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// 配置
const PORT = process.env.PORT || 5001;
const HISTORY_DIR = 'history';

// 确保历史记录目录存在
async function ensureHistoryDir() {
    await fs.mkdir(HISTORY_DIR, { recursive: true });
}

// Mac 剪贴板操作
async function setClipboard(text) {
    try {
        await execa('pbcopy', { input: text });
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
        console.error('[错误] 获取剪贴板失败:', err.message);
        return '';
    }
}

// 保存历史记录
async function saveHistory(text) {
    await ensureHistoryDir();
    const timestamp = new Date().toISOString().replace(/[-:T]/g, '').split('.')[0];
    const filename = `${timestamp}.txt`;
    const filepath = path.join(HISTORY_DIR, filename);
    await fs.writeFile(filepath, text, 'utf-8');
    return filename;
}

// 获取历史记录列表
async function getHistory(limit = 10) {
    try {
        await fs.access(HISTORY_DIR);
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
        if (err.code === 'ENOENT') {
            return [];
        }
        console.error('获取历史记录失败:', err);
        return [];
    }
}

// WebSocket 连接管理
const clients = new Set();

wss.on('connection', (ws) => {
    console.log('[OK] 新设备连接，当前在线:', clients.size + 1);
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

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            console.log('[消息] 收到消息:', data.type);

            if (data.type === 'clipboard') {
                // 立即广播给其他客户端（最重要，确保实时同步）
                broadcast({
                    type: 'clipboard',
                    text: data.text,
                    from: data.from || 'unknown',
                    timestamp: Date.now()
                }, ws);

                // 异步执行副作用（不阻塞）
                setClipboard(data.text).then(() => {
                    console.log('[OK] 已同步到系统剪贴板 (pbcopy):', data.text.substring(0, 50));
                }).catch(err => {
                    console.error('[错误] 同步到系统剪贴板失败:', err.message);
                });

                saveHistory(data.text).catch(err => {
                    console.error('[错误] 保存历史记录失败:', err.message);
                });
            }
        } catch (err) {
            console.error('[错误] 处理消息失败:', err);
        }
    });

    ws.on('close', () => {
        clients.delete(ws);
        console.log('[断开] 设备断开，当前在线:', clients.size);

        broadcast({
            type: 'online',
            count: clients.size
        });
    });

    ws.on('error', (err) => {
        console.error('[错误] WebSocket 错误:', err);
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

app.get('/api/version', async (req, res) => {
    try {
        const versionData = await fs.readFile('.version.json', 'utf-8');
        const parsed = JSON.parse(versionData);
        const version = parsed?.version;

        if (!version) {
            return res.json({
                status: 'error',
                message: '版本号格式错误',
                datum: null
            });
        }

        res.json({
            status: 'success',
            message: '获取版本号成功',
            datum: { version }
        });
    } catch (err) {
        res.json({
            status: 'error',
            message: err.code === 'ENOENT' ? '版本文件不存在' : '读取版本文件失败',
            datum: null
        });
    }
});

// 启动服务器
async function start() {
    await ensureHistoryDir();

    server.listen(PORT, '0.0.0.0', async () => {
        const localIP = getLocalIP();
        const url = `http://${localIP}:${PORT}`;

        console.log('\n' + '='.repeat(50));
        console.log('     [手机] 本地模式 - Mac 直接当服务器');
        console.log('='.repeat(50));
        console.log(`本机访问: http://localhost:${PORT}`);
        console.log(`手机访问: ${url}`);
        console.log('='.repeat(50) + '\n');
        console.log('[提示] 使用说明:');
        console.log('   - 手机和 Mac 需在同一局域网');
        console.log('   - 手机访问上面的地址即可同步剪贴板');
        console.log('   - Mac 会自动同步到系统剪贴板\n');

        // 显示二维码
        console.log('[手机] 手机扫码访问:');
        const qrcode = await generateQRCode(url);
        console.log(qrcode);
    });
}

start().catch(console.error);
