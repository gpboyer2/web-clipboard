#!/usr/bin/env node
/**
 * Windows 电脑端监听脚本
 * 连接服务器 WebSocket，自动同步剪贴板到系统
 */

const WebSocket = require('ws');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// 配置服务器地址
const SERVER_URL = process.env.SERVER_URL || 'ws://156.245.200.31:5001';
const DEVICE_NAME = 'Windows';

let ws = null;
let reconnectTimer = null;
let isConnected = false;

// 设置 Windows 剪贴板
async function setClipboard(text) {
    try {
        // 使用 PowerShell 设置剪贴板
        const escapedText = text.replace(/"/g, '`"').replace(/\$/g, '`$');
        await execAsync(`powershell -command "Set-Clipboard -Value \\"${escapedText}\\""`);
        console.log(`✅ 已同步到系统剪贴板: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`);
        return true;
    } catch (err) {
        console.error('❌ 设置剪贴板失败:', err.message);
        return false;
    }
}

// 获取 Windows 剪贴板（用于主动发送）
async function getClipboard() {
    try {
        const { stdout } = await execAsync('powershell -command "Get-Clipboard"');
        return stdout.trim();
    } catch (err) {
        console.error('❌ 获取剪贴板失败:', err.message);
        return '';
    }
}

// 连接 WebSocket
function connect() {
    console.log(`🔄 正在连接服务器: ${SERVER_URL}`);
    
    try {
        ws = new WebSocket(SERVER_URL);
        
        ws.on('open', () => {
            isConnected = true;
            console.log('✅ 已连接到服务器');
            console.log('📱 等待接收剪贴板消息...\n');
            
            // 清除重连定时器
            if (reconnectTimer) {
                clearTimeout(reconnectTimer);
                reconnectTimer = null;
            }
        });
        
        ws.on('message', async (data) => {
            try {
                const message = JSON.parse(data.toString());
                await handleMessage(message);
            } catch (err) {
                console.error('❌ 处理消息失败:', err.message);
            }
        });
        
        ws.on('close', () => {
            isConnected = false;
            console.log('❌ 连接已断开');
            
            // 3秒后自动重连
            reconnectTimer = setTimeout(() => {
                console.log('🔄 尝试重新连接...\n');
                connect();
            }, 3000);
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
    
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
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
console.log('║   Windows 剪贴板监听客户端            ║');
console.log('╚═══════════════════════════════════════╝');
console.log(`服务器地址: ${SERVER_URL}`);
console.log(`设备名称: ${DEVICE_NAME}`);
console.log('─'.repeat(41));
console.log('💡 提示:');
console.log('   - 手机发送剪贴板会自动同步到本机');
console.log('   - 按 Ctrl+C 退出程序');
console.log('═'.repeat(41) + '\n');

// 启动连接
connect();

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
