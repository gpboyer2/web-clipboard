#!/usr/bin/env python3
"""
Web Clipboard Server
手机访问网页，点击发送，Mac 剪贴板自动接收
"""

from flask import Flask, request, jsonify, send_from_directory
import subprocess
import os

app = Flask(__name__, static_folder='static', static_url_path='')


def set_clipboard(text):
    """设置 Mac 剪贴板"""
    try:
        subprocess.run(['pbcopy'], input=text, text=True, check=True)
        return True
    except:
        return False


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
        return jsonify({'success': True, 'message': f'已复制到剪贴板: {text[:50]}...'})
    else:
        return jsonify({'success': False, 'message': '复制失败'})


@app.route('/get', methods=['GET'])
def get():
    """获取 Mac 剪贴板内容"""
    text = get_clipboard()
    return jsonify({'success': True, 'text': text})


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
