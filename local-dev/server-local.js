#!/usr/bin/env node
/**
 * 本地模式服务器 - Mac 直接当服务器
 * 手机直接连接 Mac，Mac 自动同步系统剪贴板
 */

const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const fs = require('fs/promises');
const path = require('path');
const { generateQRCode, getLocalIP, ts } = require('../utils.js');
const { execa } = require('execa');

const {
    HISTORY_DIR,
    ensureHistoryDir,
    getHistory
} = require('./lib/server-common.js');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 5001;

const clients = new Set();

// Mac 剪贴板操作
async function setClipboard(text) {
    try {
        await execa('pbcopy', { input: text });
        return true;
    } catch (err) {
        console.error(`[${ts()}] 设置剪贴板失败:`, err.message);
        return false;
    }
}

// 保存历史记录（本地模式简化版）
async function saveHistory(text) {
    await ensureHistoryDir();
    const timestamp = new Date().toISOString().replace(/[-:T]/g, '').split('.')[0];
    const filename = `${timestamp}.txt`;
    const filepath = path.join(HISTORY_DIR, filename);
    await fs.writeFile(filepath, text, 'utf-8');
    return filename;
}

// 广播给所有客户端（本地模式简单版本）
function broadcast(data, excludeWs = null) {
    const message = JSON.stringify(data);
    clients.forEach(client => {
        if (client !== excludeWs && client.readyState === 1) {
            client.send(message);
        }
    });
}

wss.on('connection', (ws, req) => {
    // 从URL参数中读取设备ID
    try {
        const url = new URL(req.url, `http://localhost`);
        const device_id = url.searchParams.get('device_id');
        ws.deviceId = device_id || '未知设备';
    } catch (e) {
        ws.deviceId = '未知设备';
    }

    console.log(`[${ts()}] 客户端 ${ws.deviceId} 连接，当前在线: ${clients.size + 1}`);
    clients.add(ws);

    ws.send(JSON.stringify({
        type: 'connected',
        message: '已连接到 Mac 本地服务器',
        mode: 'local',
        online: clients.size
    }));

    broadcast({ type: 'online', count: clients.size });

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            if (data.type === 'device' && data.device_id) {
                ws.deviceId = data.device_id;
                console.log(`[${ts()}] 客户端设备ID: ${ws.deviceId}`);
                return;
            }

            if (data.type === 'clipboard') {
                const text = data.content || '';
                const from = data.from || ws.deviceId || 'unknown';
                const length = text.length;
                const preview = text.substring(0, 30).replace(/\n/g, '\\n');
                console.log(`[${ts()}] [剪贴板] 收到来自 ${from} (${length}字符): "${preview}"`);

                broadcast({
                    type: 'clipboard',
                    content: text,
                    from: from,
                    id: data.id || Date.now(),
                    create_at: data.create_at || Date.now()
                }, ws);

                setClipboard(text).then(() => {
                    console.log(`[${ts()}] [OK] 已同步到系统剪贴板 (${length}字符)`);
                }).catch(err => {
                    console.error(`[${ts()}] [错误] 同步到系统剪贴板失败:`, err.message);
                });

                saveHistory(text).catch(err => {
                    console.error(`[${ts()}] [错误] 保存历史记录失败:`, err.message);
                });
            }
        } catch (err) {
            console.error(`[${ts()}] [错误] 处理消息失败:`, err);
        }
    });

    ws.on('close', () => {
        clients.delete(ws);
        console.log(`[${ts()}] [断开] 客户端 ${ws.deviceId} 断开，当前在线: ${clients.size}`);
        broadcast({ type: 'online', count: clients.size });
    });

    ws.on('error', (err) => {
        console.error(`[${ts()}] [错误] WebSocket 错误:`, err);
        clients.delete(ws);
    });
});

app.use(express.json());
app.use(express.static('.'));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../index.html'));
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
    const list = await getHistory('', 10);
    res.json({ success: true, list });
});

app.post('/send', async (req, res) => {
    const { id, content, create_at } = req.body;
    const device_id = req.query.device_id;

    if (!content) {
        return res.json({ success: false, message: '内容为空' });
    }

    const from = device_id || 'api';
    console.log(`[${ts()}] [API] 收到剪贴板来自 ${from} (${content.length}字符)`);

    await setClipboard(content);
    await saveHistory(content);

    broadcast({
        type: 'clipboard',
        content: content,
        from: from,
        id: id || Date.now(),
        create_at: create_at || Date.now()
    });

    res.json({
        success: true,
        message: `已同步到 Mac 剪贴板，并发送给 ${clients.size} 个设备`
    });
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

async function start() {
    await ensureHistoryDir();

    server.listen(PORT, '0.0.0.0', async () => {
        const localIP = getLocalIP();
        const url = `http://${localIP}:${PORT}`;

        console.log(`\n[${ts()}] ${'='.repeat(50)}`);
        console.log(`[${ts()}]      [手机] 本地模式 - Mac 直接当服务器`);
        console.log(`[${ts()}] ${'='.repeat(50)}`);
        console.log(`[${ts()}] 本机访问: http://localhost:${PORT}`);
        console.log(`[${ts()}] 手机访问: ${url}`);
        console.log(`[${ts()}] ${'='.repeat(50)}\n`);
        console.log(`[${ts()}] [提示] 使用说明:`);
        console.log(`[${ts()}]    - 手机和 Mac 需在同一局域网`);
        console.log(`[${ts()}]    - 手机访问上面的地址即可同步剪贴板`);
        console.log(`[${ts()}]    - Mac 会自动同步到系统剪贴板\n`);

        console.log(`[${ts()}] [手机] 手机扫码访问:`);
        const qrcode = await generateQRCode(url);
        console.log(qrcode);
    });
}

start().catch(console.error);
