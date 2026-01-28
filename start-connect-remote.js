#!/usr/bin/env node
/**
 * 连接远程服务器 - Mac 客户端
 * 自动生成唯一房间ID并连接服务器
 */

const { spawn } = require('child_process');
const path = require('path');
const crypto = require('crypto');
const { generateQRCode } = require('./utils');

const clientScript = path.join(__dirname, 'client-mac.js');

// 生成唯一的房间ID（随机8位字符）
function generateRoomId() {
    return crypto.randomBytes(4).toString('hex');
}

const roomId = generateRoomId();
const serverUrl = 'http://156.245.200.31:5001';
const urlWithRoom = `${serverUrl}?room=${roomId}`;

console.log('╔═══════════════════════════════════════╗');
console.log('║  Web Clipboard - 连接远程服务器      ║');
console.log('╚═══════════════════════════════════════╝');
console.log('');
console.log('🚀 启动 Mac 监听客户端...');
console.log('💡 将连接到远程服务器: ws://156.245.200.31:5001');
console.log(`🏠 你的专属房间ID: ${roomId}`);
console.log('');
console.log('📱 手机扫码访问 (带房间ID):');
console.log('─'.repeat(45));

// 生成带房间ID的二维码
generateQRCode(urlWithRoom).then(qrcode => {
    console.log(qrcode);
    console.log('─'.repeat(45));
    console.log('');
    console.log('💡 提示:');
    console.log('   - 扫码后，你的设备和手机将使用独立房间');
    console.log('   - 不会与其他用户的消息冲突');
    console.log('   - 按 Ctrl+C 退出程序');
    console.log('');

    // 启动客户端，传递房间ID环境变量
    const client = spawn('node', [clientScript], {
        stdio: 'inherit',
        cwd: __dirname,
        env: {
            ...process.env,
            ROOM_ID: roomId,
            SERVER_URL: 'ws://156.245.200.31:5001'
        }
    });

client.on('error', (err) => {
    console.error('❌ 启动失败:', err.message);
    process.exit(1);
});

client.on('exit', (code) => {
    if (code !== 0) {
        console.log(`\n进程退出，代码: ${code}`);
    }
    process.exit(code);
});

// 优雅退出
process.on('SIGINT', () => {
    console.log('\n\n🛑 正在退出...');
    client.kill('SIGINT');
});

process.on('SIGTERM', () => {
    client.kill('SIGTERM');
});
}).catch(err => {
    console.error('❌ 生成二维码失败:', err.message);
    console.log('\n💡 你仍然可以使用以下URL访问:');
    console.log(`   ${urlWithRoom}\n');

    // 即使二维码生成失败，也启动客户端
    const client = spawn('node', [clientScript], {
        stdio: 'inherit',
        cwd: __dirname,
        env: {
            ...process.env,
            ROOM_ID: roomId,
            SERVER_URL: 'ws://156.245.200.31:5001'
        }
    });

    client.on('error', (err) => {
        console.error('❌ 启动失败:', err.message);
        process.exit(1);
    });

    client.on('exit', (code) => {
        if (code !== 0) {
            console.log(`\n进程退出，代码: ${code}`);
        }
        process.exit(code);
    });

    // 优雅退出
    process.on('SIGINT', () => {
        console.log('\n\n🛑 正在退出...');
        client.kill('SIGINT');
    });

    process.on('SIGTERM', () => {
        client.kill('SIGTERM');
    });
});
