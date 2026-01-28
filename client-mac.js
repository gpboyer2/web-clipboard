#!/usr/bin/env node
/**
 * Mac 电脑端监听脚本
 * 连接服务器 WebSocket，自动同步剪贴板到系统
 */

const WebSocket = require('ws');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// 配置服务器地址
const SERVER_URL = process.env.SERVER_URL || 'ws://156.245.200.31:5001';
const ROOM_ID = process.env.ROOM_ID || ''; // 空字符串表示主房间
const ROOM_DISPLAY = ROOM_ID === '' ? '主房间' : ROOM_ID;
const DEVICE_NAME = 'Mac';

let ws = null;
let reconnectTimer = null;
let heartbeatTimer = null; // 心跳检测定时器
let isConnected = false;
let lastHeartbeat = Date.now(); // 记录最后收到服务器消息的时间
const HEARTBEAT_CHECK_INTERVAL = 60000; // 60秒检查一次心跳
const HEARTBEAT_TIMEOUT = 90000; // 90秒无响应则重连

// 设置 Mac 剪贴板
async function setClipboard(text) {
    try {
        await execAsync(`echo ${JSON.stringify(text)} | pbcopy`);
        console.log(`✅ 已同步到系统剪贴板: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`);
        return true;
    } catch (err) {
        console.error('❌ 设置剪贴板失败:', err.message);
        return false;
    }
}

// 获取 Mac 剪贴板（用于主动发送）
async function getClipboard() {
    try {
        const { stdout } = await execAsync('pbpaste');
        return stdout;
    } catch (err) {
        console.error('❌ 获取剪贴板失败:', err.message);
        return '';
    }
}

// 连接 WebSocket
function connect() {
    // 构建带房间ID的WebSocket URL（只有指定房间时才添加room参数）
    const wsUrl = ROOM_ID
        ? (SERVER_URL.includes('?')
            ? `${SERVER_URL}&room=${ROOM_ID}`
            : `${SERVER_URL}?room=${ROOM_ID}`)
        : SERVER_URL;

    console.log(`🔄 正在连接服务器: ${wsUrl}`);
    console.log(`🏠 房间: ${ROOM_DISPLAY}`);

    try {
        ws = new WebSocket(wsUrl);

        ws.on('open', () => {
            isConnected = true;
            lastHeartbeat = Date.now();
            console.log('✅ 已连接到服务器');
            console.log('📱 等待接收剪贴板消息...\n');

            // 清除重连定时器
            if (reconnectTimer) {
                clearTimeout(reconnectTimer);
                reconnectTimer = null;
            }
        });
        
        // 处理 ping - 自动响应 pong
        ws.on('ping', () => {
            lastHeartbeat = Date.now();
            console.log('💓 收到服务器心跳 ping，已自动响应 pong');
        });
        
        ws.on('message', async (data) => {
            try {
                lastHeartbeat = Date.now(); // 更新心跳时间
                const message = JSON.parse(data.toString());
                await handleMessage(message);
            } catch (err) {
                console.error('❌ 处理消息失败:', err.message);
            }
        });
        
        ws.on('close', () => {
            isConnected = false;
            console.log('❌ 连接已断开');
            
            // 只有在没有手动触发重连时才自动重连
            if (!reconnectTimer) {
                reconnectTimer = setTimeout(() => {
                    console.log('🔄 尝试重新连接...\n');
                    reconnectTimer = null;
                    connect();
                }, 3000);
            }
        });
        
        ws.on('error', (err) => {
            console.error('❌ WebSocket 错误:', err.message);
        });
        
    } catch (err) {
        console.error('❌ 连接失败:', err.message);
        // 3秒后重试
        reconnectTimer = setTimeout(connect, 3000);
    }
}

// 处理接收到的消息
async function handleMessage(message) {
    const timestamp = new Date().toLocaleString('zh-CN');
    
    switch (message.type) {
        case 'connected':
            console.log(`📡 [${timestamp}] ${message.message}`);
            break;
            
        case 'online':
            console.log(`👥 在线设备数: ${message.count}`);
            break;
            
        case 'clipboard':
            // 核心功能：收到剪贴板内容，同步到系统
            console.log(`\n📨 [${timestamp}] 收到来自 ${message.from} 的剪贴板:`);
            console.log(`   内容: ${message.text.substring(0, 100)}${message.text.length > 100 ? '...' : ''}`);
            
            // 同步到系统剪贴板
            await setClipboard(message.text);
            console.log('');
            break;
            
        default:
            console.log('📩 收到消息:', message);
    }
}

// 主动发送剪贴板到服务器（可选功能）
async function sendClipboard() {
    if (!isConnected || !ws || ws.readyState !== WebSocket.OPEN) {
        console.log('❌ 未连接到服务器');
        return;
    }
    
    const text = await getClipboard();
    if (!text.trim()) {
        console.log('❌ 剪贴板为空');
        return;
    }
    
    ws.send(JSON.stringify({
        type: 'clipboard',
        text,
        from: DEVICE_NAME,
        timestamp: Date.now()
    }));
    
    console.log('✅ 已发送剪贴板到服务器');
}

// 优雅退出
function gracefulShutdown() {
    console.log('\n\n🛑 正在退出...');
    
    // 清理所有定时器
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

// 监听退出信号
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// 显示启动信息
console.log('╔═══════════════════════════════════════╗');
console.log('║   Mac 剪贴板监听客户端                ║');
console.log('╚═══════════════════════════════════════╝');
console.log(`服务器地址: ${SERVER_URL}`);
console.log(`房间: ${ROOM_DISPLAY}`);
console.log(`设备名称: ${DEVICE_NAME}`);
console.log('─'.repeat(41));
console.log('💡 提示:');
console.log('   - 手机发送剪贴板会自动同步到本机');
console.log('   - 主房间为总房间，所有未指定房间的连接都在此');
console.log('   - 按 Ctrl+C 退出程序');
console.log('═'.repeat(41) + '\n');

// 启动连接
connect();

// 心跳检测 - 定期检查是否收到服务器消息
heartbeatTimer = setInterval(() => {
    const timeSinceLastHeartbeat = Date.now() - lastHeartbeat;
    
    if (isConnected && timeSinceLastHeartbeat > HEARTBEAT_TIMEOUT) {
        console.log(`\n⚠️  心跳超时 (${Math.floor(timeSinceLastHeartbeat / 1000)}秒未收到服务器消息)`);
        console.log('🔄 主动断开并重连...\n');
        
        // 清除可能存在的重连定时器，避免竞态条件
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }
        
        // 强制断开并重连
        isConnected = false;
        if (ws) {
            ws.terminate();
            ws = null;
        }
        connect();
    } else if (isConnected) {
        // 只在心跳异常时才输出日志，减少噪音
        if (timeSinceLastHeartbeat > 45000) {
            console.log(`⚠️  心跳延迟 (距上次: ${Math.floor(timeSinceLastHeartbeat / 1000)}秒)`);
        }
    }
}, HEARTBEAT_CHECK_INTERVAL);

// 可选：监听本地剪贴板变化并主动发送（高级功能）
// 取消注释下面的代码启用此功能
/*
let lastClipboard = '';
setInterval(async () => {
    if (!isConnected) return;
    
    const current = await getClipboard();
    if (current && current !== lastClipboard) {
        lastClipboard = current;
        await sendClipboard();
    }
}, 1000);
*/
