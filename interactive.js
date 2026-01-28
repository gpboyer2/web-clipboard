#!/usr/bin/env node
/**
 * 通用交互式启动入口
 * 打包后的主程序，提供用户交互界面，并直接运行客户端逻辑
 *
 * 支持多平台剪贴板工具:
 * - macOS: pbcopy
 * - Linux: xclip, xsel, wl-copy
 * - Windows: PowerShell Set-Clipboard
 */

const path = require('path');
const readline = require('readline');
const WebSocket = require('ws');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

/**
 * 创建交互式输入界面
 */
function createInterface() {
    return readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
}

/**
 * 验证房间ID格式
 */
function validateRoomId(roomId) {
    if (!roomId) return true; // 空房间ID（主房间）有效
    if (/^[A-Z0-9]{8}$/i.test(roomId)) return true;
    return false;
}

/**
 * 询问用户房间ID
 */
function askRoomId(rl) {
    return new Promise((resolve) => {
        rl.question('请输入房间ID (直接回车连接主房间): ', (answer) => {
            const roomId = answer.trim();

            // 验证房间ID格式
            if (roomId && !validateRoomId(roomId)) {
                console.log('⚠️  房间ID格式应为8位字母数字');
                resolve('');
                return;
            }

            // 主房间风险提示
            if (!roomId) {
                console.log('');
                console.log('⚠️  注意：主房间为公共房间，您的剪贴板内容可能被其他用户看到');
                console.log('   建议输入专属房间ID以保护隐私');
                console.log('');
            }

            resolve(roomId);
        });
    });
}

// ==================== WebSocket 客户端逻辑 ====================

let ws = null;
let reconnectTimer = null;
let isConnected = false;
let currentServerUrl = '';
let currentRoomId = '';

/**
 * 检测平台类型
 */
function detectPlatform() {
    const platform = process.platform;
    if (platform === 'darwin') return 'macos';
    if (platform === 'win32') return 'windows';
    return 'linux';
}

/**
 * 检测可用的剪贴板命令
 */
async function detectClipboardCommand() {
    const platform = detectPlatform();
    const commands = [];

    if (platform === 'macos') {
        commands.push({ cmd: 'pbcopy', type: 'macos', args: [] });
    } else if (platform === 'windows') {
        commands.push({ cmd: 'powershell', type: 'windows', args: ['-command', 'Set-Clipboard'] });
    } else {
        // Linux
        commands.push({ cmd: 'wl-copy', type: 'wayland', args: [] });
        commands.push({ cmd: 'xclip', type: 'x11', args: ['-selection', 'clipboard'] });
        commands.push({ cmd: 'xsel', type: 'x11', args: ['--clipboard', '--input'] });
    }

    for (const { cmd, type, args } of commands) {
        try {
            if (platform === 'windows') {
                // Windows PowerShell 默认可用，不需要检测
                console.log(`✅ 检测到剪贴板工具: ${cmd} (${type})`);
                return { cmd, type, args };
            } else {
                await execAsync(`which ${cmd}`);
                console.log(`✅ 检测到剪贴板工具: ${cmd} (${type})`);
                return { cmd, type, args };
            }
        } catch (err) {
            // 命令不存在，继续尝试下一个
        }
    }

    if (platform === 'macos') {
        throw new Error('未找到 pbcopy 命令，macOS 系统应该自带此工具');
    } else if (platform === 'windows') {
        throw new Error('未找到 PowerShell，Windows 系统应该自带此工具');
    } else {
        throw new Error('未找到可用的剪贴板工具，请安装 xclip 或 xsel:\n  sudo apt install xclip\n  或\n  sudo apt install xsel');
    }
}

/**
 * 设置剪贴板（跨平台）
 */
let clipboardCommand = null;

async function setClipboard(text) {
    try {
        if (typeof text !== 'string') {
            throw new Error('剪贴板内容必须是字符串');
        }

        if (text.length === 0) {
            console.log('⚠️  剪贴板内容为空，跳过设置');
            return true;
        }

        // 首次使用时检测剪贴板命令
        if (!clipboardCommand) {
            clipboardCommand = await detectClipboardCommand();
        }

        const { cmd, type, args } = clipboardCommand;
        let command;

        if (type === 'macos') {
            const escapedText = text.replace(/"/g, '\\"');
            command = `echo "${escapedText}" | ${cmd}`;
        } else if (type === 'windows') {
            const escapedText = text.replace(/"/g, '`"').replace(/\$/g, '`$');
            command = `${cmd} ${args.join(' ')} -Value \\"${escapedText}\\"`;
        } else {
            // Linux
            const escapedText = text.replace(/"/g, '\\"').replace(/\$/g, '\\$');
            command = `echo "${escapedText}" | ${cmd} ${args.join(' ')}`;
        }

        await execAsync(command);
        console.log(`✅ 已同步到系统剪贴板: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`);
        return true;
    } catch (err) {
        console.error('❌ 设置剪贴板失败:', err.message);
        return false;
    }
}

/**
 * 连接 WebSocket
 */
function connect(serverUrl, roomId) {
    currentServerUrl = serverUrl;
    currentRoomId = roomId;

    // 构建带房间ID的WebSocket URL（只有指定房间时才添加room参数）
    const wsUrl = roomId
        ? (serverUrl.includes('?')
            ? `${serverUrl}&room=${roomId}`
            : `${serverUrl}?room=${roomId}`)
        : serverUrl;

    const roomDisplay = roomId || '主房间（公共房间）';

    console.log(`🔄 正在连接服务器: ${wsUrl}`);
    console.log(`🏠  房间: ${roomDisplay}`);

    try {
        ws = new WebSocket(wsUrl);

        ws.on('open', () => {
            isConnected = true;
            console.log('✅ 已连接到服务器');
            console.log('📱 等待接收剪贴板消息...\n');

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

        ws.on('close', (code, reason) => {
            isConnected = false;
            console.log(`❌ 连接已断开 (代码: ${code}, 原因: ${reason || '未知'})`);

            reconnectTimer = setTimeout(() => {
                console.log('🔄 尝试重新连接...\n');
                connect(currentServerUrl, currentRoomId);
            }, 3000);
        });

        ws.on('error', (err) => {
            console.error('❌ WebSocket 错误:', err.message);
        });

    } catch (err) {
        console.error('❌ 连接失败:', err.message);
        reconnectTimer = setTimeout(connect, 3000, currentServerUrl, currentRoomId);
    }
}

/**
 * 处理接收到的消息
 */
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
            console.log(`\n📨 [${timestamp}] 收到来自 ${message.from} 的剪贴板:`);
            console.log(`   内容: ${message.text.substring(0, 100)}${message.text.length > 100 ? '...' : ''}`);
            await setClipboard(message.text);
            console.log('');
            break;

        default:
            console.log('📩 收到消息:', message);
    }
}

/**
 * 优雅退出
 */
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

/**
 * 主函数
 */
async function main() {
    const rl = createInterface();
    const SERVER_URL = 'ws://156.245.200.31:5001';
    const platform = detectPlatform();
    const platformName = platform === 'macos' ? 'macOS' : platform.charAt(0).toUpperCase() + platform.slice(1);

    console.log('╔═══════════════════════════════════════╗');
    console.log(`║  Web Clipboard - ${platformName} 客户端      ║`);
    console.log('╚═══════════════════════════════════════╝');
    console.log('');
    console.log(`💡 服务器地址: ${SERVER_URL}`);
    console.log('');

    // 预检测剪贴板工具
    try {
        await detectClipboardCommand();
    } catch (err) {
        console.error(`❌ ${err.message}`);
        process.exit(1);
    }

    // 询问房间ID
    const roomId = await askRoomId(rl);
    rl.close();

    // 根据是否有房间ID构建URL
    const baseUrl = `http://${SERVER_URL.replace('ws://', '').replace('wss://', '')}`;
    const urlWithRoom = roomId ? `${baseUrl}?room=${roomId}` : baseUrl;

    console.log('');
    console.log('🚀 启动客户端...');
    console.log(`🏠  房间: ${roomId || '主房间（公共房间）'}`);
    console.log('');
    console.log('📱 手机访问:');
    console.log('─'.repeat(45));
    console.log(urlWithRoom);
    console.log('─'.repeat(45));
    console.log('');
    console.log('💡 提示:');
    console.log('   - 用手机浏览器访问上述链接');
    console.log('   - 手机复制文本会同步到电脑剪贴板');
    console.log('   - 按 Ctrl+C 退出程序');
    console.log('');
    console.log('═'.repeat(45));
    console.log('');

    // 直接启动 WebSocket 客户端（不使用 spawn）
    connect(SERVER_URL, roomId);

    // 监听退出信号
    process.on('SIGINT', gracefulShutdown);
    process.on('SIGTERM', gracefulShutdown);

    // 捕获未处理的异常
    process.on('uncaughtException', (err) => {
        console.error('\n❌ 未捕获的异常:', err);
        console.error('错误堆栈:', err.stack);
        process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
        console.error('\n❌ 未处理的Promise拒绝:', reason);
        process.exit(1);
    });
}

// 启动
main().catch(err => {
    console.error('❌ 启动失败:', err);
    console.error('完整错误信息:', err);
    process.exit(1);
});
