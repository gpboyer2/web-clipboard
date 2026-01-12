/**
 * 工具函数模块
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const os = require('os');

const execAsync = promisify(exec);

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
⚠️  未安装 qrencode 工具
📦 安装方法:
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

module.exports = {
    generateQRCode,
    getLocalIP
};
