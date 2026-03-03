#!/usr/bin/env node
/**
 * 连接远程服务器 - Mac 客户端
 * 默认连接主房间（公共房间）
 */

const { spawn } = require('child_process');
const path = require('path');
const { generateQRCode } = require('./utils');

const clientScript = path.join(__dirname, 'client-mac.js');
const serverUrl = 'http://156.245.200.31:5001';

console.log('╔═══════════════════════════════════════╗');
console.log('║  Web Clipboard - 连接远程服务器      ║');
console.log('╚═══════════════════════════════════════╝');
console.log('');
console.log('🚀 启动 Mac 监听客户端...');
console.log('💡 将连接到远程服务器: ws://156.245.200.31:5001');
console.log('🏠 默认房间: 主房间（公共房间）');
console.log('');
console.log('📱 手机扫码访问:');
console.log('─'.repeat(45));

// 生成主房间URL的二维码
generateQRCode(serverUrl).then(qrcode => {
    console.log(qrcode);
    console.log('─'.repeat(45));
    console.log('');
    console.log('💡 提示:');
    console.log('   - 主房间为公共房间，所有设备在此互通');
    console.log('   - 按 Ctrl+C 退出程序');
    console.log('');

    // 启动客户端，不传递房间ID（使用主房间）
    const client = spawn('node', [clientScript], {
        stdio: 'inherit',
        cwd: __dirname,
        env: {
            ...process.env,
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
    console.log(`   ${serverUrl}\n`);

    // 即使二维码生成失败，也启动客户端
    const client = spawn('node', [clientScript], {
        stdio: 'inherit',
        cwd: __dirname,
        env: {
            ...process.env,
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
