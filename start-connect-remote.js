#!/usr/bin/env node
/**
 * 连接远程服务器 - 跨平台客户端
 *
 * 使用方法：
 *   node start-connect-remote.js ABC123        # 位置参数
 *   node start-connect-remote.js --room=ABC123 # 命名参数
 *   ROOM_ID=ABC123 node start-connect-remote.js # 环境变量
 *   pm2 start 0 -- ABC123                      # PM2 方式
 *   pm2 start 0 -- --room=ABC123               # PM2 方式
 *   pm2 start ./start-connect-remote.js --name web-clipboard -- --room="" 
 */

const path = require('path');
const readline = require('readline');
const { generateQRCode } = require('./utils.js');

// 尝试加载版本信息
let VERSION_INFO = { commit: 'dev', date: 'dev' };
try {
    const vi = require('./version-info.js');
    VERSION_INFO.commit = vi.__VERSION__ || 'unknown';
    VERSION_INFO.date = vi.__BUILD_DATE__ || 'unknown';
} catch (e) {
    // 版本信息文件不存在，使用默认值
}

// 验证房间ID格式
function validateRoomId(roomId) {
    if (!roomId) return true; // 空房间ID（主房间）有效
    if (/^[A-Z0-9]{1,}$/i.test(roomId)) return true; // 至少1位字母数字
    return false;
}

// 询问用户房间ID
function askRoomId(rl) {
    return new Promise((resolve) => {
        rl.question('请输入房间ID (直接回车连接主房间): ', (answer) => {
            const roomId = answer.trim();

            // 验证房间ID格式
            if (roomId && !validateRoomId(roomId)) {
                console.log('[警告] 房间ID只能包含字母和数字');
                resolve('');
                return;
            }

            // 主房间风险提示
            if (!roomId) {
                console.log('');
                console.log('[警告] 注意：主房间为公共房间，您的剪贴板内容可能被其他用户看到');
                console.log('   建议输入专属房间ID以保护隐私');
                console.log('');
            }

            resolve(roomId);
        });
    });
}

const serverUrl = 'http://156.226.177.6:5001';
const wsServerUrl = 'ws://156.226.177.6:5001';

// 根据操作系统选择客户端
const platform = process.platform;
const isWindows = platform === 'win32';
const osName = isWindows ? 'Windows' : 'Mac';

// 获取房间ID：优先级 命令行参数 > 环境变量 > 交互式输入
function getRoomIdFromArgs() {
    // 检查 --room=xxx 格式
    const roomArg = process.argv.find(arg => arg.startsWith('--room='));
    if (roomArg) {
        return roomArg.split('=')[1];
    }
    // 检查位置参数 process.argv[2]
    if (process.argv[2] && !process.argv[2].startsWith('--')) {
        return process.argv[2];
    }
    // 检查环境变量
    if (process.env.ROOM_ID) {
        return process.env.ROOM_ID;
    }
    return null;
}

// 主函数
async function main() {
    console.log('╔═══════════════════════════════════════╗');
    console.log('║  Web Clipboard - 连接远程服务器      ║');
    console.log(`║  版本: ${VERSION_INFO.commit} (${VERSION_INFO.date})`.padEnd(47) + '║');
    console.log('╚═══════════════════════════════════════╝');
    console.log('');
    console.log(`[提示] 服务器地址: ${serverUrl}`);
    console.log('');

    // 获取房间ID
    let roomId = getRoomIdFromArgs();

    // 如果没有通过参数/环境变量获取到，则交互式询问
    if (roomId === null) {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        roomId = await askRoomId(rl);
        rl.close();
    } else {
        // 验证房间ID格式
        if (roomId && !validateRoomId(roomId)) {
            console.log('[错误] 房间ID只能包含字母和数字');
            process.exit(1);
        }
        // 主房间风险提示
        if (!roomId) {
            console.log('[警告] 注意：主房间为公共房间，您的剪贴板内容可能被其他用户看到');
            console.log('   建议输入专属房间ID以保护隐私');
            console.log('');
        }
    }

    // 设置环境变量
    process.env.SERVER_URL = wsServerUrl;
    process.env.ROOM_ID = roomId;

    // 根据是否有房间ID构建URL
    const urlWithRoom = roomId
        ? `${serverUrl}?room=${encodeURIComponent(roomId)}`
        : serverUrl;

    console.log('');
    console.log(`[启动] 启动 ${osName} 监听客户端...`);
    console.log(`[房间] ${roomId || '主房间(公共)'}`);
    console.log('');
    console.log('[手机] 手机访问方式:');
    console.log('   方式1: 扫描下方二维码');
    console.log('   方式2: 浏览器直接访问以下地址');
    console.log('');
    console.log(`   ${urlWithRoom}`);
    console.log('');
    console.log('─'.repeat(45));

    // 生成二维码
    try {
        const qrcode = await generateQRCode(urlWithRoom);
        console.log(qrcode);
    } catch (err) {
        console.log('[警告] 生成二维码失败，请手动访问URL');
    }

    console.log('─'.repeat(45));
    console.log('');
    console.log('[提示] 提示:');
    if (roomId) {
        console.log('   - 您已连接到专属房间，只有相同房间ID的设备可以互通');
    } else {
        console.log('   - 主房间为公共房间，所有设备在此互通');
    }
    console.log('   - 按 Ctrl+C 退出程序');
    console.log('');

    // 直接运行客户端逻辑
    if (isWindows) {
        require('./server/windows-clipboard-connector.js');
    } else {
        require('./server/mac-clipboard-connector.js');
    }
}

// 启动
main().catch(err => {
    console.error('[错误] 启动失败:', err.message);
    process.exit(1);
});
