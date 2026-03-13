#!/usr/bin/env node
// Windows 电脑端监听脚本
// 连接服务器 WebSocket，自动同步剪贴板到系统

const { exec, spawn } = require('child_process');
const { promisify } = require('util');
const { ts } = require('../utils.js');
const { createClient } = require('./lib/client-common.js');

const execAsync = promisify(exec);

// Windows clip 命令需要 UTF-16LE 编码（带 BOM）
function encodeForClipboard(text) {
    const bom = Buffer.from([0xFF, 0xFE]);
    const content = Buffer.from(text, 'utf16le');
    return Buffer.concat([bom, content]);
}

// 设置 Windows 剪贴板
async function setClipboard(text) {
    if (typeof text !== 'string') {
        throw new Error('剪贴板内容必须是字符串');
    }

    if (text.length === 0) {
        console.log(`[${ts()}] [警告] 剪贴板内容为空，跳过设置`);
        return true;
    }

    return new Promise((resolve) => {
        const clip = spawn('clip');
        clip.stdin.write(encodeForClipboard(text));
        clip.stdin.end();

        clip.on('close', (code) => {
            if (code === 0) {
                console.log(`[${ts()}] [OK] 已同步到系统剪贴板: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`);
                resolve(true);
            } else {
                console.error(`[${ts()}] [错误] 设置剪贴板失败，退出码: ${code}`);
                resolve(false);
            }
        });

        clip.on('error', (err) => {
            console.error(`[${ts()}] [错误] 设置剪贴板失败:`, err.message);
            resolve(false);
        });
    });
}

// 获取 Windows 剪贴板
async function getClipboard() {
    try {
        const { stdout } = await execAsync('powershell -command "Get-Clipboard"', { timeout: 5000 });
        return stdout ? stdout.trim() : '';
    } catch (err) {
        console.error(`[${ts()}] [错误] 获取剪贴板失败:`, err.message);
        return '';
    }
}

// 配置服务器地址
const SERVER_URL = process.env.SERVER_URL || 'ws://156.226.177.6:5001';
const ROOM_ID = process.env.ROOM_ID || '';
const DEVICE_NAME = 'Windows';

// 创建并启动客户端
const client = createClient({
    serverUrl: SERVER_URL,
    roomId: ROOM_ID,
    deviceName: DEVICE_NAME,
    setClipboard,
    getClipboard
});

client.start();
