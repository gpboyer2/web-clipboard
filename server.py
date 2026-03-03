#!/usr/bin/env python3
"""
Web Clipboard Server
手机访问网页，点击发送，Mac 剪贴板自动接收
"""

from flask import Flask, request, jsonify, send_from_directory
import subprocess
import os
from datetime import datetime

app = Flask(__name__, static_folder='static', static_url_path='')

# 历史记录目录
HISTORY_DIR = 'history'
if not os.path.exists(HISTORY_DIR):
    os.makedirs(HISTORY_DIR)


def set_clipboard(text):
    """设置 Mac 剪贴板"""
    try:
        subprocess.run(['pbcopy'], input=text, text=True, check=True)
        return True
    except:
        return False


def save_history(text):
    """保存历史记录"""
    timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
    filename = f'{timestamp}.txt'
    filepath = os.path.join(HISTORY_DIR, filename)
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(text)
    return filename


def get_history(limit=10):
    """获取历史记录列表"""
    files = []
    for filename in os.listdir(HISTORY_DIR):
        if filename.endswith('.txt'):
            filepath = os.path.join(HISTORY_DIR, filename)
            # 获取文件内容前两行
            with open(filepath, 'r', encoding='utf-8') as f:
                lines = f.readlines()
                preview = ''.join(lines[:2]).strip()
            # 获取文件修改时间
            mtime = os.path.getmtime(filepath)
            files.append({
                'filename': filename,
                'preview': preview,
                'mtime': mtime
            })
    # 按修改时间倒序排列
    files.sort(key=lambda x: x['mtime'], reverse=True)
    return files[:limit]


def get_clipboard():
    """获取 Mac 剪贴板"""
    try:
        result = subprocess.run(['pbpaste'], capture_output=True, text=True, check=True)
        return result.stdout
    except:
        return ""


@app.route('/')
def index():
    """首页"""
    return send_from_directory('.', 'index.html')


@app.route('/send', methods=['POST'])
def send():
    """接收手机发送的内容，写入 Mac 剪贴板"""
    data = request.json
    text = data.get('text', '')

    if not text:
        return jsonify({'success': False, 'message': '内容为空'})

    if set_clipboard(text):
        # 保存历史记录
        save_history(text)
        return jsonify({'success': True, 'message': f'已复制到剪贴板: {text[:50]}...'})
    else:
        return jsonify({'success': False, 'message': '复制失败'})


@app.route('/get', methods=['GET'])
def get():
    """获取 Mac 剪贴板内容"""
    text = get_clipboard()
    return jsonify({'success': True, 'text': text})


@app.route('/history', methods=['GET'])
def history():
    """获取历史记录列表"""
    files = get_history(limit=10)
    # 读取完整内容用于重新发送
    for item in files:
        filepath = os.path.join(HISTORY_DIR, item['filename'])
        with open(filepath, 'r', encoding='utf-8') as f:
            item['content'] = f.read()
    return jsonify({'success': True, 'list': files})


@app.route('/ping', methods=['GET'])
def ping():
    """健康检查"""
    return jsonify({'status': 'ok', 'message': '服务器运行中'})


if __name__ == '__main__':
    # 获取本机 IP
    import socket
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.connect(("8.8.8.8", 80))
    local_ip = s.getsockname()[0]
    s.close()

    print("=" * 50)
    print("     Web Clipboard Server")
    print("=" * 50)
    print(f"本地访问: http://localhost:5001")
    print(f"手机访问: http://{local_ip}:5001")
    print("=" * 50)

    # 允许外网访问
    app.run(host='0.0.0.0', port=5001, debug=False)
