#!/bin/bash

# Web Clipboard 公共构建函数库
# 被 local-release-build.sh 和 GitHub Actions 共用

set -e

# ============================================
# 环境依赖检查
# ============================================

# 检查命令是否存在
check_command() {
    local cmd=$1
    if ! command -v "$cmd" &> /dev/null; then
        return 1
    fi
    return 0
}

# 检查必要的环境依赖
check_dependencies() {
    local missing_deps=()
    local checked_shell

    # 检查 node
    if ! check_command "node"; then
        missing_deps+=("node")
    fi

    # 检查 npm
    if ! check_command "npm"; then
        missing_deps+=("npm")
    fi

    # 如果有缺失的依赖，给出友好提示并退出
    if [ ${#missing_deps[@]} -gt 0 ]; then
        checked_shell=$(basename "$SHELL" 2>/dev/null || echo "unknown")

        echo ""
        echo "========================================"
        echo "错误: 缺少必要的环境依赖"
        echo "========================================"
        echo ""
        echo "以下命令未找到: ${missing_deps[*]}"
        echo ""
        echo "可能的原因:"
        echo ""
        echo "1. 您当前使用的是 $checked_shell 终端，而 Node.js 可能只在 BASH 环境中配置了环境变量"
        echo ""
        echo "2. Node.js 环境变量未正确加载"
        echo ""
        echo "建议解决方案:"
        echo ""
        if [ "$checked_shell" != "bash" ]; then
            echo "  方案一: 切换到 BASH 终端"
            echo "          执行: bash"
            echo "          然后重新运行构建脚本"
            echo ""
        fi
        echo "  方案二: 检查 Node.js 是否已安装"
        echo "          执行: which node || echo 'Node.js 未安装'"
        echo ""
        echo "  方案三: 手动加载环境变量"
        echo "          如果使用 nvm: source ~/.nvm/nvm.sh"
        echo "          如果使用 fnm: eval \"\$(fnm env)\""
        echo ""
        echo "  方案四: 重启终端后重试"
        echo ""
        echo "========================================"
        exit 1
    fi

    # 显示 Node.js 版本信息
    echo "环境检查通过:"
    echo "  Node.js: $(node --version 2>/dev/null || echo '未知')"
    echo "  npm: $(npm --version 2>/dev/null || echo '未知')"
    echo ""
}

# 获取项目根目录
get_project_root() {
    local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    echo "$script_dir/.."
}

# 判断是否在 CI 环境中
is_ci() {
    [ "$CI" = "true" ] || [ -n "$GITHUB_ACTIONS" ]
}

# 安装依赖
install_dependencies() {
    local project_root=$(get_project_root)

    echo "正在安装依赖..."

    cd "$project_root"
    npm ci || npm install

    echo "依赖安装完成"
}

# 检测当前操作系统
detect_os() {
    case "$(uname -s)" in
        Darwin*)
            echo "mac"
            ;;
        MINGW*|MSYS*|CYGWIN*)
            echo "win"
            ;;
        Linux*)
            echo "linux"
            ;;
        *)
            echo "unknown"
            ;;
    esac
}

# 检测当前 CPU 架构
detect_arch() {
    case "$(uname -m)" in
        x86_64|amd64)
            echo "x64"
            ;;
        arm64|aarch64)
            echo "arm64"
            ;;
        *)
            echo "unknown"
            ;;
    esac
}

# 获取对应的 pkg 构建目标
get_build_target() {
    local os=$1
    local arch=$2

    case "$os" in
        mac)
            if [ "$arch" = "arm64" ]; then
                echo "node18-macos-arm64"
            else
                echo "node18-macos-x64"
            fi
            ;;
        win)
            case "$arch" in
                x64)
                    echo "node18-win-x64"
                    ;;
                ia32)
                    echo "node18-win-ia32"
                    ;;
                *)
                    echo "node18-win-x64"
                    ;;
            esac
            ;;
        linux)
            case "$arch" in
                x64)
                    echo "node18-linux-x64"
                    ;;
                arm64)
                    echo "node18-linux-arm64"
                    ;;
                *)
                    echo "node18-linux-x64"
                    ;;
            esac
            ;;
        *)
            echo ""
            ;;
    esac
}

# 执行构建
do_build() {
    local build_target=$1
    local project_root=$(get_project_root)
    local entry_point=$2
    local output_filename=$(get_output_filename $build_target)

    echo "正在执行 pkg 打包..."
    echo "目标: $build_target"
    echo "入口: $entry_point"
    echo ""

    cd "$project_root"

    # 获取 git commit ID
    local git_commit=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
    local git_date=$(git log -1 --format=%cd --date=short 2>/dev/null || echo "unknown")
    local version_info="// 版本信息（构建时自动生成）
exports.__VERSION__ = '$git_commit';
exports.__BUILD_DATE__ = '$git_date';
"

    # 写入版本信息文件
    echo "$version_info" > "$project_root/version-info.js"
    echo "版本: $git_commit ($git_date)"

    # 检查 pkg 是否已安装
    if ! command -v npx pkg &> /dev/null; then
        echo "pkg 未安装，正在安装..."
        npm install --save-dev pkg
    fi

    # 创建平台子目录
    mkdir -p "release-build/$(dirname "$output_filename")"

    # 执行 pkg 打包
    # --public 参数让 pkg 包含所有依赖，即使它们是动态 require 的
    npx pkg "$entry_point" --targets "$build_target" --output "release-build/$output_filename" --public

    echo ""
    echo "构建完成"
}

# 获取输出文件名（包含平台子目录的完整相对路径）
get_output_filename() {
    local target=$1

    case "$target" in
        *macos-x64*)
            echo "mac-x64/web-clipboard-macos-x64"
            ;;
        *macos-arm64*)
            echo "mac-arm64/web-clipboard-macos-arm64"
            ;;
        *win-x64*)
            echo "win-x64/web-clipboard-win-x64.exe"
            ;;
        *win-ia32*)
            echo "win-ia32/web-clipboard-win-ia32.exe"
            ;;
        *linux-x64*)
            echo "linux-x64/web-clipboard-linux-x64"
            ;;
        *linux-arm64*)
            echo "linux-arm64/web-clipboard-linux-arm64"
            ;;
        *win*)
            echo "win/web-clipboard-win.exe"
            ;;
        *linux*)
            echo "linux/web-clipboard-linux"
            ;;
        *)
            echo "web-clipboard"
            ;;
    esac
}

# 显示构建结果
show_result() {
    local project_root=$(get_project_root)
    local output_dir="$project_root/release-build"

    echo ""
    echo "========================================"
    echo "构建产物位于: release-build/"
    echo "========================================"
    echo ""
    echo "产物列表:"

    if [ -d "$output_dir" ]; then
        # 按平台子目录分类显示
        for platform_dir in mac-x64 mac-arm64 win linux; do
            if [ -d "$output_dir/$platform_dir" ]; then
                echo ""
                echo "  [$platform_dir]"
                for file in "$output_dir/$platform_dir"/*; do
                    if [ -f "$file" ]; then
                        local filename=$(basename "$file")
                        local filesize=$(du -h "$file" | cut -f1)
                        echo "    $filename ($filesize)"
                    fi
                done
            fi
        done
    else
        echo "  (无产物)"
    fi

    echo ""
}
