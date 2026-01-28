#!/usr/bin/env node
/**
 * Windows 客户端交互式启动入口
 * 打包后的主程序，提供用户交互界面
 */

const { spawn } = require('child_process');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');

/**
 * 生成唯一的房间ID（随机8位字符）
 */
function generateRoomId() {
    return crypto.randomBytes(4).toString('hex');
}

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
 * 询问用户房间ID
 */
function askRoomId(rl) {
    return new Promise((resolve) => {
        rl.question('请输入房间ID (直接回车生成随机房间): ', (answer) => {
            const roomId = answer.trim() || generateRoomId();
            resolve(roomId);
        });
    });
}

/**
 * 主函数
 */
async function main() {
    const rl = createInterface();
    const SERVER_URL = 'ws://156.245.200.31:5001';

    console.log('╔═══════════════════════════════════════╗');
    console.log('║  Web Clipboard - Windows 客户端      ║');
    console.log('╚═══════════════════════════════════════╝');
    console.log('');
    console.log(`💡 服务器地址: ${SERVER_URL}`);
    console.log('');

    // 询问房间ID
    const roomId = await askRoomId(rl);
    rl.close();

    const urlWithRoom = `http://${SERVER_URL.replace('ws://', '').replace('wss://', '')}?room=${roomId}`;

    console.log('');
    console.log('🚀 启动客户端...');
    console.log(`🏠 你的房间ID: ${roomId}`);
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

    // 启动客户端，传递环境变量
    const clientScript = path.join(__dirname, 'client-windows.js');
    const client = spawn(process.execPath, [clientScript], {
        stdio: 'inherit',
        cwd: __dirname,
        env: {
            ...process.env,
            ROOM_ID: roomId,
            SERVER_URL: SERVER_URL
        }
    });

    client.on('error', (err) => {
        console.error('❌ 启动失败:', err.message);
        console.error('完整错误信息:', err);
        console.log('\n按任意键退出...');
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.on('data', () => process.exit(1));
    });

    client.on('exit', (code) => {
        if (code !== 0) {
            console.log(`\n❌ 进程异常退出，代码: ${code}`);
            console.log('按任意键退出...');
            process.stdin.setRawMode(true);
            process.stdin.resume();
            process.stdin.on('data', () => process.exit(code));
        } else {
            process.exit(code);
        }
    });

    // 优雅退出
    process.on('SIGINT', () => {
        console.log('\n\n🛑 正在退出...');
        try {
            client.kill('SIGINT');
        } catch (err) {
            console.error('退出时出错:', err.message);
        }
    });

    process.on('SIGTERM', () => {
        try {
            client.kill('SIGTERM');
        } catch (err) {
            console.error('退出时出错:', err.message);
        }
    });

    // 捕获未处理的异常
    process.on('uncaughtException', (err) => {
        console.error('\n❌ 未捕获的异常:', err);
        console.error('错误堆栈:', err.stack);
        console.log('\n按任意键退出...');
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.on('data', () => process.exit(1));
    });

    process.on('unhandledRejection', (reason, promise) => {
        console.error('\n❌ 未处理的Promise拒绝:', reason);
        console.log('\n按任意键退出...');
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.on('data', () => process.exit(1));
    });
}

// 启动
main().catch(err => {
    console.error('❌ 启动失败:', err);
    console.error('完整错误信息:', err);
    console.log('\n按任意键退出...');
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', () => process.exit(1));
});