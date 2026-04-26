#!/usr/bin/env node
// Mac 电脑端监听脚本
// 连接服务器 WebSocket，自动同步剪贴板到系统

const { exec, execFile } = require('child_process');
const { promisify } = require('util');
const { ts } = require('../utils.js');
const { createClient } = require('./lib/client-common.js');

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);
const USER_ID = process.getuid ? process.getuid() : null;

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

async function readClipboardWithCommands(commands, transform = (stdout) => stdout) {
    for (const command of commands) {
        try {
            const { stdout } = await execAsync(command);
            return transform(stdout);
        } catch (err) {
            console.error(`[${ts()}] [错误] 获取剪贴板失败: ${command}`, err.message);
        }
    }

    return '';
}

async function writeClipboardByOsaScript(text) {
    await execFileAsync('/usr/bin/osascript', [
        '-e',
        'on run {x}',
        '-e',
        'set the clipboard to x',
        '-e',
        'end run',
        text
    ]);
}

async function verifyClipboard(text) {
    const clipboardText = await readClipboardWithCommands(
        ["/usr/bin/osascript -e 'the clipboard as text'"],
        (stdout) => stdout.replace(/\r?\n$/, '')
    );
    return clipboardText === text;
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

    const methods = [
        {
            name: '/usr/bin/osascript clipboard',
            run: () => writeClipboardByOsaScript(text)
        },
        {
            name: '/usr/bin/pbcopy',
            run: () => execWithInput('/usr/bin/pbcopy', text)
        },
        USER_ID ? {
            name: `/bin/launchctl asuser ${USER_ID} /usr/bin/pbcopy`,
            run: () => execWithInput(`/bin/launchctl asuser ${USER_ID} /usr/bin/pbcopy`, text)
        } : null
    ].filter(Boolean);

    for (const method of methods) {
        try {
            await method.run();
            if (await verifyClipboard(text)) {
                console.log(`[${ts()}] [OK] 已同步到系统剪贴板: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`);
                return true;
            }
            console.error(`[${ts()}] [错误] 设置剪贴板失败: ${method.name} 写入后校验不一致`);
        } catch (err) {
            console.error(`[${ts()}] [错误] 设置剪贴板失败: ${method.name}`, err.message);
        }
    }

    throw new Error('所有剪贴板写入方式都失败');
}

// 获取 Mac 剪贴板
async function getClipboard() {
    const commands = [
        "/usr/bin/osascript -e 'the clipboard as text'",
        '/usr/bin/pbpaste',
        USER_ID ? `/bin/launchctl asuser ${USER_ID} /usr/bin/pbpaste` : null
    ].filter(Boolean);
    return readClipboardWithCommands(commands, (stdout) => stdout.replace(/\r?\n$/, ''));
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
