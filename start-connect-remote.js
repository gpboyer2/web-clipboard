#!/usr/bin/env node
/**
 * 连接远程服务器 - Mac 客户端
 * 自动连接服务器并同步剪贴板到系统
 */

const { spawn } = require('child_process');
const path = require('path');

const clientScript = path.join(__dirname, 'client-mac.js');

console.log('╔═══════════════════════════════════════╗');
console.log('║  Web Clipboard - 连接远程服务器      ║');
console.log('╚═══════════════════════════════════════╝');
console.log('');
console.log('🚀 启动 Mac 监听客户端...');
console.log('💡 将连接到远程服务器: ws://156.245.200.31:5001');
console.log('');

// 启动客户端
const client = spawn('node', [clientScript], {
    stdio: 'inherit',
    cwd: __dirname
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
