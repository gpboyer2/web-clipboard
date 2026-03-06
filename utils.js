/**
 * 工具函数模块
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';

const execAsync = promisify(exec);

/**
 * 生成带毫秒的时间戳（北京时区）
 * @returns {string} 格式：2026-03-06 14:30:45.123
 */
function ts() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const milliseconds = String(now.getMilliseconds()).padStart(3, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
}

/**
 * WebSocket 智能重连延迟配置
 * 第1次、第2次、第3次、第4次及以后的延迟时间(ms)
 */
const RECONNECT_DELAYS = [0, 1000, 3000, 10000];

/**
 * 最大重连次数
 */
const MAX_RECONNECT_ATTEMPTS = 50;

/**
 * 计算智能重连延迟时间
 * @param {number} reconnect_attempts - 当前重连次数
 * @returns {number} 延迟时间(ms)
 */
function calculateReconnectDelay(reconnect_attempts) {
    const index = Math.min(reconnect_attempts, RECONNECT_DELAYS.length) - 1;
    return RECONNECT_DELAYS[index] || RECONNECT_DELAYS[RECONNECT_DELAYS.length - 1];
}

/**
 * 判断是否为有效的房间ID
 * 无效值：null、undefined、空字符串、NaN、以及字符串格式的 "null"、"undefined"、"NaN"
 * @param {*} value - 待判断的值
 * @returns {boolean} - 是否为有效的房间ID
 */
function isValidRoomId(value) {
    if (value === null || value === undefined) return false;
    if (typeof value === 'number' && isNaN(value)) return false;
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed === '') return false;
        if (trimmed === 'null' || trimmed === 'undefined' || trimmed === 'NaN') return false;
        return true;
    }
    return true;
}

/**
 * 生成二维码（终端显示）
 * @param {string} url - 要生成二维码的 URL
 * @returns {Promise<string>} 二维码字符串或错误提示
 */
async function generateQRCode(url) {
    try {
        // 尝试使用 qrencode
        const { stdout } = await execAsync(`qrencode -t ansiutf8 "${url}"`);
        return stdout;
    } catch (err) {
        // 如果没有安装 qrencode，返回提示
        return `
[警告] 未安装 qrencode 工具
[安装] 安装方法:
   macOS: brew install qrencode
   Linux: apt install qrencode 或 yum install qrencode
或访问在线生成: https://cli.im/url?${url}
`;
    }
}

/**
 * 获取本机 IP 地址
 * @returns {string} 本机 IP 地址
 */
function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}

export {
    calculateReconnectDelay,
    RECONNECT_DELAYS,
    MAX_RECONNECT_ATTEMPTS,
    isValidRoomId,
    generateQRCode,
    getLocalIP,
    ts
};
