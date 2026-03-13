#!/usr/bin/env node
/**
 * Web Clipboard Server - Node.js + WebSocket 版本
 * 支持多设备实时同步剪贴板
 */

const express = require('express');
const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const fs = require('fs/promises');
const path = require('path');
const { isValidRoomId, generateQRCode, getLocalIP, ts } = require('./utils.js');

const {
    DEFAULT_ROOM_ID,
    HISTORY_DIR,
    HEARTBEAT_INTERVAL,
    ensureHistoryDir,
    saveHistory,
    getHistory,
    broadcastToRoom,
    startHeartbeat,
    setupGracefulExit,
    getRoomDisplay
} = require('./local-dev/lib/server-common.js');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 5001;

const roomClients = new Map();
const roomHeartbeats = new Map();

wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const rawRoomId = url.searchParams.get('room');
    const roomId = isValidRoomId(rawRoomId) ? rawRoomId : DEFAULT_ROOM_ID;
    const deviceId = url.searchParams.get('device_id');

    ws.deviceId = deviceId || '未知设备';
    ws.roomId = roomId;

    const roomDisplay = getRoomDisplay(roomId);
    console.log(`[${ts()}] 客户端 ${ws.deviceId} 连接 (房间: ${roomDisplay})`);

    if (!roomClients.has(roomId)) {
        roomClients.set(roomId, new Set());
        roomHeartbeats.set(roomId, new Map());
    }

    const clients = roomClients.get(roomId);
    const heartbeats = roomHeartbeats.get(roomId);

    clients.add(ws);
    heartbeats.set(ws, { isAlive: true, lastPing: Date.now() });

    ws.send(JSON.stringify({
        type: 'connected',
        message: roomId === '' ? '已连接到主房间' : '已连接到剪贴板服务器',
        roomId: roomId === '' ? '主房间' : roomId,
        online: clients.size
    }));

    broadcastToRoom(roomClients, roomHeartbeats, roomId, { type: 'online', count: clients.size });

    ws.on('pong', () => {
        const heartbeats = roomHeartbeats.get(ws.roomId);
        if (heartbeats) {
            const heartbeat = heartbeats.get(ws);
            if (heartbeat) {
                heartbeat.isAlive = true;
                heartbeat.lastPing = Date.now();
            }
        }
    });

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            const roomDisplay = getRoomDisplay(ws.roomId);

            if (data.type === 'device' && data.device_id) {
                ws.deviceId = data.device_id;
                console.log(`[${ts()}] 客户端设备ID: ${ws.deviceId} (房间: ${roomDisplay})`);
                return;
            }

            if (data.type === 'clipboard') {
                const from = data.from || ws.deviceId || '未知设备';
                const content = data.content || '';
                const length = content.length;
                const preview = content.substring(0, 30);
                console.log(`[${ts()}] [剪贴板] 收到来自 ${from} (${length}字符): "${preview}"`);

                saveHistory({
                    id: data.id,
                    content: data.content,
                    create_at: data.create_at
                }, ws.roomId).catch(console.error);

                broadcastToRoom(roomClients, roomHeartbeats, ws.roomId, {
                    id: data.id,
                    type: 'clipboard',
                    content: data.content,
                    create_at: data.create_at,
                    room: data.room,
                    from: from
                }, ws);
            }
        } catch (err) {
            console.error(`[${ts()}] 处理消息失败:`, err);
        }
    });

    ws.on('close', () => {
        const roomId = ws.roomId;
        const clients = roomClients.get(roomId);
        const heartbeats = roomHeartbeats.get(roomId);
        const roomDisplay = getRoomDisplay(roomId);

        if (clients) {
            clients.delete(ws);
        }
        if (heartbeats) {
            heartbeats.delete(ws);
        }

        console.log(`[${ts()}] [错误] 客户端 ${ws.deviceId} 断开 (房间: ${roomDisplay}), 当前在线: ${clients ? clients.size : 0}`);

        if (clients) {
            broadcastToRoom(roomClients, roomHeartbeats, roomId, { type: 'online', count: clients.size });
        }
    });

    ws.on('error', (err) => {
        console.error(`[${ts()}] WebSocket 错误:`, err);
        const roomId = ws.roomId;
        const clients = roomClients.get(roomId);
        const heartbeats = roomHeartbeats.get(roomId);

        if (clients) {
            clients.delete(ws);
        }
        if (heartbeats) {
            heartbeats.delete(ws);
        }
    });
});

const heartbeatInterval = startHeartbeat(roomClients, roomHeartbeats);

app.use(express.json());
app.use(express.static('.'));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, './index.html'));
});

app.get('/ping', (req, res) => {
    const roomId = req.query.room || DEFAULT_ROOM_ID;
    const clients = roomClients.get(roomId);
    const onlineCount = clients ? clients.size : 0;
    const roomDisplay = getRoomDisplay(roomId);

    res.json({
        status: 'ok',
        message: '服务器运行中',
        roomId: roomDisplay,
        online: onlineCount,
        uptime: process.uptime()
    });
});

app.get('/history', async (req, res) => {
    const roomId = req.query.room || DEFAULT_ROOM_ID;
    const roomDisplay = getRoomDisplay(roomId);
    const list = await getHistory(roomId, 10);
    res.json({ success: true, roomId: roomDisplay, list });
});

app.delete('/history', async (req, res) => {
    const roomId = req.query.room || DEFAULT_ROOM_ID;
    const roomHistoryDir = path.join(HISTORY_DIR, roomId || 'main');
    const roomDisplay = getRoomDisplay(roomId);

    console.log(`[${ts()}] [DELETE /history] 开始处理清空历史记录请求`);
    console.log(`[${ts()}] [DELETE /history] 参数: room=${req.query.room}, roomId=${roomId}, roomHistoryDir=${roomHistoryDir}`);

    try {
        await fs.access(roomHistoryDir);
        console.log(`[${ts()}] [DELETE /history] 历史目录存在: ${roomHistoryDir}`);
    } catch (accessErr) {
        console.log(`[${ts()}] [DELETE /history] 历史目录不存在，直接返回成功: ${accessErr.message}`);
        const response = {
            status: 'success',
            message: '历史记录已清空',
            datum: null
        };
        console.log(`[${ts()}] [DELETE /history] 响应: ${JSON.stringify(response)}`);
        return res.json(response);
    }

    try {
        const files = await fs.readdir(roomHistoryDir);
        console.log(`[${ts()}] [DELETE /history] 找到 ${files.length} 个历史文件: ${files.join(', ')}`);
        await Promise.all(
            files.map(file => fs.unlink(path.join(roomHistoryDir, file)))
        );

        console.log(`[${ts()}] [清空] 房间 ${roomDisplay} 历史记录已清空 (${files.length} 个文件)`);

        const response = {
            status: 'success',
            message: '历史记录已清空',
            datum: { deletedCount: files.length }
        };
        console.log(`[${ts()}] [DELETE /history] 响应: ${JSON.stringify(response)}`);
        res.json(response);
    } catch (err) {
        console.error(`[${ts()}] [错误] 清空历史记录失败:`, err);
        const response = {
            status: 'error',
            message: '清空历史记录失败',
            datum: null
        };
        console.log(`[${ts()}] [DELETE /history] 响应: ${JSON.stringify(response)}`);
        res.json(response);
    }
});

app.post('/generate-room', async (req, res) => {
    const { room } = req.body;
    const roomId = room;
    const urlWithRoom = `${req.protocol}://${req.get('host')}?room=${roomId}`;

    try {
        const qrcode = await generateQRCode(urlWithRoom);
        res.json({
            success: true,
            roomId,
            url: urlWithRoom,
            qrcode
        });
    } catch (err) {
        res.json({
            success: false,
            roomId,
            url: urlWithRoom,
            error: err.message
        });
    }
});

app.post('/send', async (req, res) => {
    const { id, content, create_at, room } = req.body;
    const device_id = req.query.device_id;
    const roomId = room || DEFAULT_ROOM_ID;
    const roomDisplay = getRoomDisplay(roomId);

    if (!content) {
        return res.json({ success: false, message: '内容为空' });
    }

    const messageId = id || Date.now();
    const messageCreateAt = create_at || Date.now();

    const clients = roomClients.get(roomId);
    const onlineCount = clients ? clients.size : 0;

    const from = device_id || 'api';
    console.log(`\n[${ts()}] [API] 收到剪贴板 (房间: ${roomDisplay}, 来自: ${from}, ${content.length} 字符)`);
    console.log(`[${ts()}]    预览: ${content.substring(0, 50)}${content.length > 50 ? '...' : ''}`);
    console.log(`[${ts()}]    当前在线客户端: ${onlineCount}`);

    await saveHistory({
        id: messageId,
        content: content,
        create_at: messageCreateAt
    }, roomId);

    broadcastToRoom(roomClients, roomHeartbeats, roomId, {
        id: messageId,
        type: 'clipboard',
        content: content,
        create_at: messageCreateAt,
        room: roomId
    });

    console.log(`[${ts()}] [OK] API发送完成\n`);

    res.json({
        success: true,
        roomId: roomDisplay,
        message: `已发送给 ${onlineCount} 个客户端`
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

// 获取数据版本信息（用于前端数据清理判断）
app.get('/api/data-version', (req, res) => {
    try {
        const packageJson = require('./package.json');
        const current_version = packageJson.version;
        const cleanup_before_version = '0.0.1';

        res.json({
            status: 'success',
            message: '操作成功',
            datum: {
                current_version,
                cleanup_before_version
            }
        });
    } catch (err) {
        res.json({
            status: 'error',
            message: '获取数据版本失败',
            datum: null
        });
    }
});

async function start() {
    await ensureHistoryDir();

    server.listen(PORT, '0.0.0.0', async () => {
        const localIP = getLocalIP();
        const baseUrl = `http://${localIP}:${PORT}`;

        console.log(`\n[${ts()}] ${'='.repeat(50)}`);
        console.log(`[${ts()}]      Web Clipboard Server (Node.js + WebSocket)`);
        console.log(`[${ts()}] ${'='.repeat(50)}`);
        console.log(`[${ts()}] 本地访问: http://localhost:${PORT}`);
        console.log(`[${ts()}] 手机访问: ${baseUrl}`);
        console.log(`[${ts()}] WebSocket: ws://${localIP}:${PORT}`);
        console.log(`[${ts()}] ${'='.repeat(50)}\n`);
        console.log(`[${ts()}] [提示] 多用户隔离模式已启用`);
        console.log(`[${ts()}] [心跳] 心跳检测已启动 (每 45秒检查一次)`);
        console.log(`[${ts()}] [手机] 每个用户使用独立的房间ID进行隔离`);
        console.log(`[${ts()}] [房间] 主房间(无room参数)为总房间\n`);

        console.log(`[${ts()}] [手机] 手机扫码访问 (主房间):`);
        const qrcode = await generateQRCode(baseUrl);
        console.log(qrcode);
        console.log(`\n[${ts()}] [提示] 提示: 在URL后添加 ?room=你的房间ID 来使用独立房间`);
        console.log(`[${ts()}] [提示] 主房间访问: 不添加参数或 ?room= (总房间)`);
        console.log(`[${ts()}] [提示] 生成新房间: POST /generate-room`);
    });
}

start().catch(console.error);
setupGracefulExit(heartbeatInterval, roomClients);
