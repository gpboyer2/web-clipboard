#!/usr/bin/env node
// Mac 电脑端监听脚本
// 连接服务器 WebSocket，自动同步剪贴板到系统

const { exec } = require('child_process');
const { promisify } = require('util');
const { ts } = require('../utils.js');
const { createClient } = require('./lib/client-common.js');

const execAsync = promisify(exec);

// 包装 exec 支持 stdin 输入
function execWithInput(command, input) {
    return new Promise((resolve, reject) => {
        const child = exec(command, (error, stdout, stderr) => {
            if (error) {
                reject(error);
            } else {
                resolve({ stdout, stderr });
            }
        });
        if (input !== undefined) {
            child.stdin.write(input);
            child.stdin.end();
        }
    });
}

// 设置 Mac 剪贴板
async function setClipboard(text) {
    if (typeof text !== 'string') {
        throw new Error('剪贴板内容必须是字符串');
    }

    if (text.length === 0) {
        console.log(`[${ts()}] [警告] 剪贴板内容为空，跳过设置`);
        return true;
    }

    try {
        await execWithInput('pbcopy', text);
        console.log(`[${ts()}] [OK] 已同步到系统剪贴板: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`);
        return true;
    } catch (err) {
        console.error(`[${ts()}] [错误] 设置剪贴板失败:`, err.message);
        return false;
    }
}

// 获取 Mac 剪贴板
async function getClipboard() {
    try {
        const { stdout } = await execAsync('pbpaste');
        return stdout;
    } catch (err) {
        console.error(`[${ts()}] [错误] 获取剪贴板失败:`, err.message);
        return '';
    }
}

// 配置服务器地址
const SERVER_URL = process.env.SERVER_URL || 'ws://156.226.177.6:5001';
const ROOM_ID = process.env.ROOM_ID || '';
const DEVICE_NAME = 'Mac';

// 创建并启动客户端
const client = createClient({
    serverUrl: SERVER_URL,
    roomId: ROOM_ID,
    deviceName: DEVICE_NAME,
    setClipboard,
    getClipboard
});

client.start();
