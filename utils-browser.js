/**
 * 浏览器环境工具函数
 */

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
