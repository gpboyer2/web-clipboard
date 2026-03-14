/**
 * Web Clipboard Server - 公共模块
 * 位于 server/lib/ 目录下
 * 提供 local-dev/server-remote.js 和 local-dev/server-local.js 的公共逻辑
 */

const fs = require('fs/promises');
const path = require('path');
const { WebSocket } = require('ws');
const { ts } = require('../../utils.js');

// 常量定义
const DEFAULT_ROOM_ID = '';
const HISTORY_DIR = 'server/history';
const HEARTBEAT_INTERVAL = 45000;

// 确保历史记录目录存在
async function ensureHistoryDir() {
    await fs.mkdir(HISTORY_DIR, { recursive: true });
}

// 保存历史记录（按房间ID隔离）
async function saveHistory(messageData, roomId = DEFAULT_ROOM_ID) {
    let { id, content, create_at } = messageData;
    if (!id) id = Date.now();
    if (!create_at) create_at = Date.now();

    const roomHistoryDir = path.join(HISTORY_DIR, roomId || 'main');
    await fs.mkdir(roomHistoryDir, { recursive: true });

    const filename = `${id}.txt`;
    const filepath = path.join(roomHistoryDir, filename);
    const dataToSave = JSON.stringify({ id, content, create_at });
    await fs.writeFile(filepath, dataToSave, 'utf-8');
    return filename;
}

// 获取历史记录列表（按房间ID隔离）
async function getHistory(roomId = DEFAULT_ROOM_ID, limit = 10) {
    const roomHistoryDir = path.join(HISTORY_DIR, roomId || 'main');

    try {
        await fs.access(roomHistoryDir);
    } catch {
        return [];
    }

    try {
        const files = await fs.readdir(roomHistoryDir);
        const txtFiles = files.filter(f => f.endsWith('.txt'));

        const fileList = await Promise.all(
            txtFiles.map(async filename => {
                const filepath = path.join(roomHistoryDir, filename);
                const stats = await fs.stat(filepath);
                const fileContent = await fs.readFile(filepath, 'utf-8');

                let messageData;
                try {
                    messageData = JSON.parse(fileContent);
                } catch {
                    const lines = fileContent.split('\n');
                    messageData = {
                        id: parseInt(filename.replace('.txt', '')) || stats.mtimeMs,
                        content: fileContent,
                        create_at: stats.mtimeMs,
                        preview: lines.slice(0, 2).join('\n').trim()
                    };
                }

                const content = messageData.content || '';
                const lines = content.split('\n');
                const preview = lines.slice(0, 2).join('\n').trim();
                const id = messageData.id || parseInt(filename.replace('.txt', '')) || stats.mtimeMs;
                const create_at = messageData.create_at || stats.mtimeMs;

                return { id, content, create_at, preview, mtime: stats.mtimeMs };
            })
        );

        fileList.sort((a, b) => b.create_at - a.create_at);
        return fileList.slice(0, limit);
    } catch (err) {
        console.error(`[${ts()}] 获取历史记录失败:`, err);
        return [];
    }
}

// 房间广播（支持按房间ID分组）
function broadcastToRoom(roomClients, roomHeartbeats, roomId, data, excludeWs = null) {
    const clients = roomClients.get(roomId);
    if (!clients) return;

    const heartbeats = roomHeartbeats?.get(roomId);
    const message = JSON.stringify(data);
    let successCount = 0;
    let failCount = 0;

    clients.forEach(client => {
        if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
            try {
                client.send(message);
                successCount++;
            } catch (err) {
                console.error(`[${ts()}] [错误] 发送消息失败:`, err.message);
                failCount++;
                if (heartbeats) {
                    const heartbeat = heartbeats.get(client);
                    if (heartbeat) heartbeat.isAlive = false;
                }
            }
        }
    });

    if (data.type === 'clipboard') {
        const roomDisplay = roomId === '' ? '主房间' : roomId;
        let logMessage = `[${ts()}] [广播] 已推送给房间 ${roomDisplay} 的 ${successCount} 个客户端`;
        if (failCount > 0) logMessage += `，失败 ${failCount}`;
        console.log(logMessage);
    }
}

// 启动心跳检测
function startHeartbeat(roomClients, roomHeartbeats) {
    return setInterval(() => {
        setImmediate(() => {
            const now = Date.now();
            let deadConnections = 0;

            roomClients.forEach((clients, roomId) => {
                const heartbeats = roomHeartbeats.get(roomId);
                if (!heartbeats) return;

                clients.forEach(client => {
                    const heartbeat = heartbeats.get(client);
                    if (!heartbeat) {
                        client.terminate();
                        clients.delete(client);
                        deadConnections++;
                        return;
                    }

                    if (!heartbeat.isAlive) {
                        client.terminate();
                        clients.delete(client);
                        heartbeats.delete(client);
                        deadConnections++;
                        broadcastToRoom(roomClients, roomHeartbeats, roomId, { type: 'online', count: clients.size });
                        return;
                    }

                    heartbeat.isAlive = false;
                    try {
                        if (client.readyState === WebSocket.OPEN) {
                            client.ping();
                        } else {
                            client.terminate();
                            clients.delete(client);
                            heartbeats.delete(client);
                            deadConnections++;
                        }
                    } catch (err) {
                        console.error(`[${ts()}] [错误] 发送心跳失败:`, err.message);
                        client.terminate();
                        clients.delete(client);
                        heartbeats.delete(client);
                        deadConnections++;
                    }
                });
            });

            if (deadConnections > 0) {
                const totalClients = Array.from(roomClients.values()).reduce((sum, set) => sum + set.size, 0);
                console.log(`[${ts()}] [心跳] 清理 ${deadConnections} 个失效连接`);
            }

            const totalClients = Array.from(roomClients.values()).reduce((sum, set) => sum + set.size, 0);
            console.log(`[${ts()}] [心跳] 检测完成，在线: ${totalClients}`);
        });
    }, HEARTBEAT_INTERVAL);
}

// 优雅退出
function setupGracefulExit(heartbeatInterval, roomClients) {
    const handler = () => {
        console.log(`\n\n[${ts()}] [停止] 正在关闭服务器...`);
        clearInterval(heartbeatInterval);
        roomClients.forEach(clients => clients.forEach(client => client.close()));
        process.exit(0);
    };
    process.on('SIGINT', handler);
    process.on('SIGTERM', handler);
}

// 获取房间显示名称
function getRoomDisplay(roomId) {
    return roomId === '' ? '主房间' : roomId;
}

module.exports = {
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
};
