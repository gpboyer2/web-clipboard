/**
 * PKG 打包配置文件
 * 指定需要打包到可执行文件中的资源
 */
module.exports = {
    // 需要打包的脚本文件
    scripts: [
        'interactive.js'
    ],
    // 需要打包的资源文件
    assets: [],
    // 输出目标
    targets: [
        'node18-win-x64',
        'node18-macos-x64',
        'node18-linux-x64'
    ]
};
