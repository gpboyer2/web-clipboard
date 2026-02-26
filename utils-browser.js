/**
 * 浏览器环境工具函数
 */

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
