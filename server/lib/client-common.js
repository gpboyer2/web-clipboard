#!/usr/bin/env node
// 客户端公共模块

const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const { calculateReconnectDelay, MAX_RECONNECT_ATTEMPTS, ts } = require('../../utils.js');

// 常量定义
const HEARTBEAT_CHECK_INTERVAL = 60000;
const HEARTBEAT_TIMEOUT = 90000;

// 生成并持久化设备 ID
function getDeviceId() {
    const fs = require('fs');
    const path = require('path');
    const deviceIdFile = path.join(process.cwd(), '.device-id');

    if (fs.existsSync(deviceIdFile)) {
        try {
            const savedId = fs.readFileSync(deviceIdFile, 'utf-8').trim();
            if (savedId) return savedId;
        } catch (err) {
            console.error(`[${ts()}] [警告] 读取设备 ID 文件失败:`, err.message);
        }
    }

    const newDeviceId = uuidv4();
    try {
        fs.writeFileSync(deviceIdFile, newDeviceId, 'utf-8');
    } catch (err) {
        console.error(`[${ts()}] [警告] 保存设备 ID 文件失败:`, err.message);
    }
    return newDeviceId;
}

// 创建客户端实例
function createClient(config) {
    const {
        serverUrl,
        roomId,
        deviceName,
        setClipboard,
        getClipboard
    } = config;

    const deviceId = getDeviceId();
    const roomDisplay = roomId === '' ? '主房间' : roomId;

    let ws = null;
    let reconnectTimer = null;
    let heartbeatTimer = null;
    let isConnected = false;
    let lastHeartbeat = Date.now();
    let reconnectAttempts = 0;

    // 处理接收到的消息
    function handleMessage(message) {
        switch (message.type) {
            case 'connected':
                console.log(`[${ts()}] [连接] ${message.message}`);
                break;

            case 'online':
                console.log(`[${ts()}] [设备] 在线设备数: ${message.count}`);
                break;

            case 'clipboard':
                const receiveTime = Date.now();
                const serverTimestamp = message.timestamp || 0;
                const networkDelay = receiveTime - serverTimestamp;
                const text = message.content || '';
                const from = message.from || 'unknown';
                const preview = text.length > 50 ? text.substring(0, 50) + '...' : text;

                console.log(`\n[${ts()}] [剪贴板] 收到来自 ${from} (${text.length}字符): "${preview}"`);
                if (serverTimestamp > 0) {
                    console.log(`[${ts()}] [性能] 网络延迟 ${networkDelay}ms`);
                }

                const clipboardStart = Date.now();
                setClipboard(text).then(() => {
                    const clipboardEnd = Date.now();
                    const clipboardDuration = clipboardEnd - clipboardStart;
                    const totalDuration = clipboardEnd - receiveTime;
                    console.log(`[${ts()}] [性能] 写入剪贴板 ${clipboardDuration}ms, 总耗时 ${totalDuration}ms\n`);
                }).catch(err => {
                    console.error(`[${ts()}] [错误] 设置剪贴板失败:`, err.message);
                });
                break;

            default:
                console.log(`[${ts()}] [消息] 未知类型:`, message);
        }
    }

    // 连接 WebSocket
    function connect() {
        let wsUrl = serverUrl;
        const params = [];

        if (roomId) params.push(`room=${roomId}`);
        params.push(`device_id=${deviceId}`);

        if (params.length > 0) {
            wsUrl = wsUrl.includes('?')
                ? `${wsUrl}&${params.join('&')}`
                : `${wsUrl}?${params.join('&')}`;
        }

        console.log(`[${ts()}] [重连] 正在连接服务器: ${wsUrl}`);
        console.log(`[${ts()}] [房间] ${roomDisplay}`);
        console.log(`[${ts()}] [设备ID] ${deviceId}`);

        try {
            ws = new WebSocket(wsUrl);

            ws.on('open', () => {
                isConnected = true;
                lastHeartbeat = Date.now();
                reconnectAttempts = 0;
                console.log(`[${ts()}] [OK] 已连接到服务器`);
                console.log(`[${ts()}] [消息] 等待接收剪贴板消息...\n`);

                if (reconnectTimer) {
                    clearTimeout(reconnectTimer);
                    reconnectTimer = null;
                }
            });

            ws.on('ping', () => {
                lastHeartbeat = Date.now();
                console.log(`[${ts()}] [心跳] 收到服务器心跳 ping，已自动响应 pong`);
            });

            ws.on('message', (data) => {
                try {
                    lastHeartbeat = Date.now();
                    const message = JSON.parse(data.toString());
                    handleMessage(message);
                } catch (err) {
                    console.error(`[${ts()}] [错误] 处理消息失败:`, err.message);
                }
            });

            ws.on('close', () => {
                isConnected = false;
                reconnectAttempts++;
                scheduleReconnect();
            });

            ws.on('error', (err) => {
                console.error(`[${ts()}] [错误] WebSocket 错误:`, err.message);
            });

        } catch (err) {
            console.error(`[${ts()}] [错误] 连接失败:`, err.message);
            reconnectAttempts++;
            scheduleReconnect();
        }
    }

    // 调度重连
    function scheduleReconnect() {
        const reconnectDelay = calculateReconnectDelay(reconnectAttempts);

        if (reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
            console.log(`\n[${ts()}] [警告] 已达到最大重连次数 (${MAX_RECONNECT_ATTEMPTS}次)，停止重连`);
            console.log(`[${ts()}] [提示] 请检查网络连接或服务器状态后重启程序\n`);
            process.exit(1);
        }

        console.log(`[${ts()}] [错误] 连接已断开，${reconnectDelay}ms 后重连 (重连次数: ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);

        if (!reconnectTimer) {
            reconnectTimer = setTimeout(() => {
                console.log(`[${ts()}] [重连] 尝试重新连接...\n`);
                reconnectTimer = null;
                connect();
            }, reconnectDelay);
        }
    }

    // 主动发送剪贴板到服务器
    async function sendClipboard() {
        if (!isConnected || !ws || ws.readyState !== WebSocket.OPEN) {
            console.log(`[${ts()}] [错误] 未连接到服务器`);
            return;
        }

        const text = await getClipboard();
        if (!text.trim()) {
            console.log(`[${ts()}] [错误] 剪贴板为空`);
            return;
        }

        ws.send(JSON.stringify({
            type: 'clipboard',
            content: text,
            from: deviceName,
            id: Date.now(),
            create_at: Date.now()
        }));

        console.log(`[${ts()}] [OK] 已发送剪贴板到服务器`);
    }

    // 优雅退出
    function gracefulShutdown() {
        console.log(`\n\n[${ts()}] [停止] 正在退出...`);

        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }

        if (heartbeatTimer) {
            clearInterval(heartbeatTimer);
            heartbeatTimer = null;
        }

        if (ws) {
            ws.close();
        }

        process.exit(0);
    }

    // 显示启动信息
    function showStartupInfo() {
        const border = '═'.repeat(41);
        const deviceTitle = deviceName === 'Mac' ? 'Mac 剪贴板监听客户端' : 'Windows 剪贴板监听客户端';

        console.log('╔═══════════════════════════════════════╗');
        console.log(`║   ${deviceTitle.padEnd(33)}║`);
        console.log('╚═══════════════════════════════════════╝');
        console.log(`服务器地址: ${serverUrl}`);
        console.log(`房间: ${roomDisplay}`);
        console.log(`设备名称: ${deviceName}`);
        console.log(`设备ID: ${deviceId}`);
        console.log('─'.repeat(41));
        console.log('[提示] 提示:');
        console.log('   - 手机发送剪贴板会自动同步到本机');
        console.log('   - 主房间为总房间，所有未指定房间的连接都在此');
        console.log('   - 设备ID用于唯一标识本设备，保存在本地 .device-id 文件');
        console.log('   - 按 Ctrl+C 退出程序');
        console.log(border + '\n');
    }

    // 启动心跳检测
    function startHeartbeat() {
        heartbeatTimer = setInterval(() => {
            const timeSinceLastHeartbeat = Date.now() - lastHeartbeat;

            if (isConnected && timeSinceLastHeartbeat > HEARTBEAT_TIMEOUT) {
                console.log(`\n[${ts()}] [警告] 心跳超时 (${Math.floor(timeSinceLastHeartbeat / 1000)}秒未收到服务器消息)`);
                console.log(`[${ts()}] [重连] 主动断开并重连...\n`);

                if (reconnectTimer) {
                    clearTimeout(reconnectTimer);
                    reconnectTimer = null;
                }

                isConnected = false;
                if (ws) {
                    ws.terminate();
                    ws = null;
                }
                connect();
            } else if (isConnected && timeSinceLastHeartbeat > 45000) {
                console.log(`[${ts()}] [警告] 心跳延迟 (距上次: ${Math.floor(timeSinceLastHeartbeat / 1000)}秒)`);
            }
        }, HEARTBEAT_CHECK_INTERVAL);
    }

    // 启动客户端
    function start() {
        showStartupInfo();
        connect();
        startHeartbeat();

        process.on('SIGINT', gracefulShutdown);
        process.on('SIGTERM', gracefulShutdown);

        process.on('uncaughtException', (err) => {
            console.error(`[${ts()}] [错误] 未捕获的异常:`, err.message);
            console.error(`[${ts()}]    堆栈:`, err.stack);
        });

        process.on('unhandledRejection', (reason) => {
            console.error(`[${ts()}] [错误] 未处理的 Promise rejection:`, reason);
        });
    }

    return { start, sendClipboard };
}

module.exports = { createClient, HEARTBEAT_CHECK_INTERVAL, HEARTBEAT_TIMEOUT };
