module.exports = {
    apps: [
        {
            name: 'web-clipboard',
            script: './start-connect-remote.js',
            cwd: '/Users/peng/Desktop/Project/web-clipboard',
            args: '--room=',
            interpreter: '/Users/peng/.nvm/versions/node/v20.18.2/bin/node',
            env: {
                PATH: '/Users/peng/.nvm/versions/node/v20.18.2/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin',
                LANG: 'zh_CN.UTF-8'
            }
        }
    ]
};
