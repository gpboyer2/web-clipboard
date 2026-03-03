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
const { isValidRoomId, generateQRCode, getLocalIP } = require('./utils');
const crypto = require('crypto');

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

// 保存历史记录（按房间ID隔离）
async function saveHistory(text, roomId = DEFAULT_ROOM_ID) {
    const timestamp = new Date().toISOString().replace(/[-:T]/g, '').split('.')[0];

    // 为每个房间创建独立的历史记录目录，主房间使用main目录
    const roomHistoryDir = path.join(HISTORY_DIR, roomId || 'main');

    try {
        await fs.access(roomHistoryDir);
    } catch {
        await fs.mkdir(roomHistoryDir, { recursive: true });
    }

    const filename = `${timestamp}.txt`;
    const filepath = path.join(roomHistoryDir, filename);
    await fs.writeFile(filepath, text, 'utf-8');
    return filename;
}

// 获取历史记录列表（按房间ID隔离）
async function getHistory(roomId = DEFAULT_ROOM_ID, limit = 10) {
    const roomHistoryDir = path.join(HISTORY_DIR, roomId || 'main');

    try {
        await fs.access(roomHistoryDir);
    } catch {
        // 房间目录不存在，返回空列表
        return [];
    }

    try {
        const files = await fs.readdir(roomHistoryDir);
        const txtFiles = files.filter(f => f.endsWith('.txt'));

        const fileList = await Promise.all(
            txtFiles.map(async filename => {
                const filepath = path.join(roomHistoryDir, filename);
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

// WebSocket 连接管理（按房间ID分组）
const roomClients = new Map(); // Map<roomId, Set<ws>>

// 心跳检测配置
const HEARTBEAT_INTERVAL = 45000; // 45秒（降低服务器压力，给客户端更多响应时间）

// 为每个连接添加心跳状态（按房间ID分组）
const roomHeartbeats = new Map(); // Map<roomId, Map<ws, heartbeat>>

// 默认房间ID（主房间/总房间）
const DEFAULT_ROOM_ID = '';

wss.on('connection', (ws, req) => {
    // 从URL参数解析房间ID
    const url = new URL(req.url, `http://${req.headers.host}`);
    // 统一判断无效值：null、undefined、空字符串、NaN 都进入主房间
    const rawRoomId = url.searchParams.get('room');
    const roomId = isValidRoomId(rawRoomId) ? rawRoomId : DEFAULT_ROOM_ID;

    // 显示房间信息，主房间特殊标识
    const roomDisplay = roomId === '' ? '主房间' : (roomId || 'default');
    console.log(`✅ 新客户端连接 (房间: ${roomDisplay})`);

    // 初始化房间
    if (!roomClients.has(roomId)) {
        roomClients.set(roomId, new Set());
        roomHeartbeats.set(roomId, new Map());
    }

    const clients = roomClients.get(roomId);
    const heartbeats = roomHeartbeats.get(roomId);

    clients.add(ws);

    // 初始化心跳状态
    heartbeats.set(ws, {
        isAlive: true,
        lastPing: Date.now()
    });

    // 发送欢迎消息
    ws.send(JSON.stringify({
        type: 'connected',
        message: roomId === '' ? '已连接到主房间' : '已连接到剪贴板服务器',
        roomId: roomId === '' ? '主房间' : roomId,
        online: clients.size
    }));

    // 保存房间ID到ws实例，方便后续使用
    ws.roomId = roomId;

    // 广播在线人数给本房间
    broadcastToRoom(roomId, {
        type: 'online',
        count: clients.size
    });

    // 处理 pong 响应
    ws.on('pong', () => {
        const heartbeats = roomHeartbeats.get(ws.roomId);
        if (heartbeats) {
            const heartbeat = heartbeats.get(ws);
            if (heartbeat) {
                heartbeat.isAlive = true;
                heartbeat.lastPing = Date.now();
                // 减少日志输出：只在开发调试时启用
                // console.log('💓 收到客户端心跳响应');
            }
        }
    });
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            const roomDisplay = ws.roomId === '' ? '主房间' : ws.roomId;
            console.log(`📨 收到消息 (房间: ${roomDisplay}):`, data.type);

            if (data.type === 'clipboard') {
                // 保存历史记录（按房间ID隔离）
                saveHistory(data.text, ws.roomId).catch(console.error);

                // 广播给同房间的客户端（除了发送者）
                broadcastToRoom(ws.roomId, {
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
        const roomId = ws.roomId;
        const clients = roomClients.get(roomId);
        const heartbeats = roomHeartbeats.get(roomId);
        const roomDisplay = roomId === '' ? '主房间' : roomId;

        if (clients) {
            clients.delete(ws);
        }
        if (heartbeats) {
            heartbeats.delete(ws);
        }

        console.log(`❌ 客户端断开 (房间: ${roomDisplay}), 当前在线: ${clients ? clients.size : 0}`);

        // 广播在线人数给本房间
        if (clients) {
            broadcastToRoom(roomId, {
                type: 'online',
                count: clients.size
            });
        }
    });

    ws.on('error', (err) => {
        console.error('WebSocket 错误:', err);
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

// 心跳检测定时器
const heartbeatInterval = setInterval(() => {
    const now = Date.now();
    let deadConnections = 0;

    // 遍历所有房间
    roomClients.forEach((clients, roomId) => {
        const heartbeats = roomHeartbeats.get(roomId);

        if (!heartbeats) return;

        clients.forEach(client => {
            const heartbeat = heartbeats.get(client);

            if (!heartbeat) {
                const roomDisplay = roomId === '' ? '主房间' : roomId;
                console.log(`⚠️  发现未初始化心跳的连接 (房间: ${roomDisplay})，移除`);
                client.terminate();
                clients.delete(client);
                deadConnections++;
                return;
            }

            // 检查上次心跳时间
            const timeSinceLastPing = now - heartbeat.lastPing;

            if (!heartbeat.isAlive) {
                const roomDisplay = roomId === '' ? '主房间' : roomId;
                console.log(`❌ 客户端心跳超时 (房间: ${roomDisplay}, ${timeSinceLastPing}ms)，强制断开连接`);
                client.terminate();
                clients.delete(client);
                heartbeats.delete(client);
                deadConnections++;

                // 广播在线人数更新给本房间
                broadcastToRoom(roomId, {
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
                    const roomDisplay = roomId === '' ? '主房间' : roomId;
                    console.log(`⚠️  连接状态异常 (房间: ${roomDisplay}, readyState: ${client.readyState})，移除连接`);
                    client.terminate();
                    clients.delete(client);
                    heartbeats.delete(client);
                    deadConnections++;
                }
            } catch (err) {
                console.error('❌ 发送心跳失败:', err.message);
                client.terminate();
                clients.delete(client);
                heartbeats.delete(client);
                deadConnections++;
            }
        });
    });

    // 只在有异常时才输出详细日志
    if (deadConnections > 0) {
        const totalClients = Array.from(roomClients.values()).reduce((sum, set) => sum + set.size, 0);
        console.log(`\n💓 [心跳检测] 清理了 ${deadConnections} 个失效连接，当前在线: ${totalClients}\n`);
    }
}, HEARTBEAT_INTERVAL);

// 广播消息给指定房间的所有客户端（可选排除某个客户端）
function broadcastToRoom(roomId, data, excludeWs = null) {
    const clients = roomClients.get(roomId);
    if (!clients) return;

    const heartbeats = roomHeartbeats.get(roomId);
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
                if (heartbeats) {
                    const heartbeat = heartbeats.get(client);
                    if (heartbeat) {
                        heartbeat.isAlive = false;
                    }
                }
            }
        }
    });

    if (data.type === 'clipboard') {
        const roomDisplay = roomId === '' ? '主房间' : roomId;
        console.log(`📡 [房间 ${roomDisplay}] 广播剪贴板消息: 成功 ${successCount} 个, 失败 ${failCount} 个`);
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
    const roomId = req.query.room || DEFAULT_ROOM_ID;
    const clients = roomClients.get(roomId);
    const onlineCount = clients ? clients.size : 0;
    const roomDisplay = roomId === '' ? '主房间' : roomId;

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
    const roomDisplay = roomId === '' ? '主房间' : roomId;
    const list = await getHistory(roomId, 10);
    res.json({ success: true, roomId: roomDisplay, list });
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
    const { text, room } = req.body;
    const roomId = room || DEFAULT_ROOM_ID;
    const roomDisplay = roomId === '' ? '主房间' : roomId;

    if (!text) {
        return res.json({ success: false, message: '内容为空' });
    }

    const clients = roomClients.get(roomId);
    const onlineCount = clients ? clients.size : 0;

    console.log(`\n📡 [API发送] 收到剪贴板内容 (房间: ${roomDisplay}, ${text.length} 字符)`);
    console.log(`   预览: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`);
    console.log(`   当前在线客户端: ${onlineCount}`);

    // 保存历史记录
    await saveHistory(text, roomId);

    // 通过 WebSocket 广播给指定房间的所有客户端
    broadcastToRoom(roomId, {
        type: 'clipboard',
        text,
        from: 'api',
        timestamp: Date.now()
    });

    console.log(`✅ API发送完成\n`);

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

// 启动服务器
async function start() {
    await ensureHistoryDir();

    server.listen(PORT, '0.0.0.0', async () => {
        const localIP = getLocalIP();
        const baseUrl = `http://${localIP}:${PORT}`;

        console.log('\n' + '='.repeat(50));
        console.log('     Web Clipboard Server (Node.js + WebSocket)');
        console.log('='.repeat(50));
        console.log(`本地访问: http://localhost:${PORT}`);
        console.log(`手机访问: ${baseUrl}`);
        console.log(`WebSocket: ws://${localIP}:${PORT}`);
        console.log('='.repeat(50) + '\n');
        console.log('💡 多用户隔离模式已启用');
        console.log('💓 心跳检测已启动 (每 45秒检查一次)');
        console.log('📱 每个用户使用独立的房间ID进行隔离');
        console.log('🏠 主房间（不指定room参数）为总房间\n');

        // 显示二维码
        console.log('📱 手机扫码访问 (主房间):');
        const qrcode = await generateQRCode(baseUrl);
        console.log(qrcode);
        console.log('\n💡 提示: 在URL后添加 ?room=你的房间ID 来使用独立房间');
        console.log('💡 主房间访问: 不添加参数或 ?room= (总房间)');
        console.log('💡 生成新房间: POST /generate-room');
    });
}

start().catch(console.error);

// 优雅退出
process.on('SIGINT', () => {
    console.log('\n\n🛑 正在关闭服务器...');
    clearInterval(heartbeatInterval);

    // 关闭所有房间的所有连接
    roomClients.forEach((clients) => {
        clients.forEach(client => client.close());
    });

    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n\n🛑 正在关闭服务器...');
    clearInterval(heartbeatInterval);

    // 关闭所有房间的所有连接
    roomClients.forEach((clients) => {
        clients.forEach(client => client.close());
    });

    process.exit(0);
});
