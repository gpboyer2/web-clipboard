/**
 * Nexe 配置文件
 * 用于将 ESM 模块打包成单个可执行文件
 * 注意：Nexe 配置文件必须使用 CommonJS 格式
 */

module.exports = {
  // 输入文件
  input: './interactive.js',

  // 输出目录（通过命令行 --output 参数覆盖）
  // output: './release-build/nexe/my-app',

  // Node.js 版本和目标平台（通过命令行 --target 参数覆盖）
  // target: 'macos-x64-18.18.2',

  // 是否从源码构建 Node.js
  build: false,

  // 资源文件（需要包含的 node_modules）
  resources: [
    'node_modules/clipboardy/**/*',
    'node_modules/execa/**/*',
    'node_modules/ws/**/*'
  ],

  // 是否压缩（mangle 会导致代码难以调试）
  mangle: false,

  // 自定义名称
  name: 'web-clipboard',

  // 工作目录
  cwd: process.cwd(),

  // 日志级别
  loglevel: 'info'
};
