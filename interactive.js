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
const { isValidRoomId, calculateReconnectDelay, MAX_RECONNECT_ATTEMPTS } = require('./utils');
const clipboardy = require('clipboardy');

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
    if (/^[A-Z0-9]{1,}$/i.test(roomId)) return true; // 至少1位字母数字
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
                console.log('⚠️  房间ID只能包含字母和数字');
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
let heartbeatTimer = null;
let isConnected = false;
let reconnect_attempts = 0;
let lastHeartbeat = Date.now();
const HEARTBEAT_CHECK_INTERVAL = 60000;
const HEARTBEAT_TIMEOUT = 90000;

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
 * 设置剪贴板（双重保险：clipboardy -> 系统命令）
 */
let clipboardCommand = null;

async function setClipboard(text) {
    if (typeof text !== 'string') {
        throw new Error('剪贴板内容必须是字符串');
    }

    if (text.length === 0) {
        console.log('⚠️  剪贴板内容为空，跳过设置');
        return true;
    }

    // 方式1: 尝试 clipboardy
    try {
        await clipboardy.write(text);
        console.log(`✅ 已同步到系统剪贴板 (clipboardy): ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`);
        return true;
    } catch (err) {
        console.log('⚠️ clipboardy 失败，尝试系统命令...');
    }

    // 方式2: 回退到系统命令
    try {
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
        console.log(`✅ 已同步到系统剪贴板 (${type}): ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`);
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
    // 构建带房间ID的WebSocket URL（只有指定房间时才添加room参数）
    const wsUrl = isValidRoomId(roomId)
        ? `${serverUrl}${serverUrl.includes('?') ? '&' : '?'}room=${encodeURIComponent(roomId)}`
        : serverUrl;

    const roomDisplay = roomId || '主房间（公共房间）';

    console.log(`🔄 正在连接服务器: ${wsUrl}`);
    console.log(`🏠  房间: ${roomDisplay}`);

    try {
        ws = new WebSocket(wsUrl);

        // 将房间ID和服务器URL绑定到 ws 实例上，避免多实例时全局变量互相覆盖
        ws.targetRoomId = roomId;
        ws.targetServerUrl = serverUrl;

        ws.on('open', () => {
            isConnected = true;
            lastHeartbeat = Date.now();
            reconnect_attempts = 0;
            console.log('✅ 已连接到服务器');
            console.log('📱 等待接收剪贴板消息...\n');

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
                lastHeartbeat = Date.now();
                const message = JSON.parse(data.toString());
                await handleMessage(message);
            } catch (err) {
                console.error('❌ 处理消息失败:', err.message);
            }
        });

        ws.on('close', (code, reason) => {
            isConnected = false;
            reconnect_attempts++;

            // 智能重连策略：0ms → 1s → 3s → 10s
            const reconnectDelay = calculateReconnectDelay(reconnect_attempts);

            // 检查重连次数上限
            if (reconnect_attempts > MAX_RECONNECT_ATTEMPTS) {
                console.log(`\n⚠️  已达到最大重连次数 (${MAX_RECONNECT_ATTEMPTS}次)，停止重连`);
                console.log('💡 请检查网络连接或服务器状态后重启程序\n');
                process.exit(1);
            }

            // 保存房间ID到局部变量，避免 ws.terminate() 后无法访问
            const savedRoomId = ws.targetRoomId;
            const savedServerUrl = ws.targetServerUrl;

            console.log(`❌ 连接已断开 (代码: ${code}, 原因: ${reason || '未知'})`);
            console.log(`${reconnectDelay}ms 后重连 (重连次数: ${reconnect_attempts}/${MAX_RECONNECT_ATTEMPTS})`);

            // 使用保存的房间ID和服务器URL进行重连
            reconnectTimer = setTimeout(() => {
                console.log('🔄 尝试重新连接...\n');
                console.log(`🔑 重连房间: ${savedRoomId || '主房间'}`);
                connect(savedServerUrl, savedRoomId);
            }, reconnectDelay);
        });

        ws.on('error', (err) => {
            console.error('❌ WebSocket 错误:', err.message);
        });

    } catch (err) {
        console.error('❌ 连接失败:', err.message);
        // 连接失败也算作一次断开，增加重连计数
        reconnect_attempts++;

        // 智能重连策略：0ms → 1s → 3s → 10s
        const reconnectDelay = calculateReconnectDelay(reconnect_attempts);

        // 检查重连次数上限
        if (reconnect_attempts > MAX_RECONNECT_ATTEMPTS) {
            console.log(`\n⚠️  已达到最大重连次数 (${MAX_RECONNECT_ATTEMPTS}次)，停止重连`);
            console.log('💡 请检查网络连接或服务器状态后重启程序\n');
            process.exit(1);
        }

        console.log(`${reconnectDelay}ms 后重试 (重连次数: ${reconnect_attempts}/${MAX_RECONNECT_ATTEMPTS})`);
        // 重连时使用原始参数
        reconnectTimer = setTimeout(() => connect(serverUrl, roomId), reconnectDelay);
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
    const urlWithRoom = isValidRoomId(roomId)
        ? `${baseUrl}?room=${encodeURIComponent(roomId)}`
        : baseUrl;

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
            connect(SERVER_URL, roomId);
        } else if (isConnected) {
            // 只在心跳异常时才输出日志，减少噪音
            if (timeSinceLastHeartbeat > 45000) {
                console.log(`⚠️  心跳延迟 (距上次: ${Math.floor(timeSinceLastHeartbeat / 1000)}秒)`);
            }
        }
    }, HEARTBEAT_CHECK_INTERVAL);

    // 捕获未处理的异常 - 不退出进程，继续运行
    process.on('uncaughtException', (err) => {
        console.error('\n❌ 未捕获的异常:', err.message);
        console.error('   堆栈:', err.stack);
        // 不退出进程，继续运行
    });

    process.on('unhandledRejection', (reason, promise) => {
        console.error('\n❌ 未处理的Promise拒绝:', reason);
        // 不退出进程，继续运行
    });
}

// 启动
main().catch(err => {
    console.error('❌ 启动失败:', err);
    console.error('完整错误信息:', err);
    process.exit(1);
});
