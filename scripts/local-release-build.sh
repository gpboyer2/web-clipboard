#!/bin/bash

# Web Clipboard 本地构建脚本
# 自动检测当前平台并执行 pkg 打包

set -e

# ============================================
# 工具函数
# ============================================

# 获取项目根目录
get_project_root() {
    local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    echo "$script_dir/.."
}

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

# 获取对应的 pkg 构建命令
get_build_command() {
    local os=$1
    local arch=$2

    case "$os" in
        mac)
            if [ "$arch" = "arm64" ]; then
                echo "pkg:build:mac_arm64"
            else
                echo "pkg:build:mac_x64"
            fi
            ;;
        win)
            echo "pkg:build:win"
            ;;
        linux)
            echo "pkg:build:linux"
            ;;
        *)
            echo ""
            ;;
    esac
}

# 执行构建
do_build() {
    local build_cmd=$1
    local project_root=$(get_project_root)

    echo "正在执行构建: npm run $build_cmd"
    echo ""

    cd "$project_root"
    npm run "$build_cmd"

    echo ""
    echo "构建完成"
}

# 显示构建结果
show_result() {
    local project_root=$(get_project_root)
    local output_dir="$project_root/release-build/pkg"

    echo ""
    echo "========================================"
    echo "构建产物位于: release-build/pkg/"
    echo "========================================"
    echo ""
    echo "产物列表:"

    if [ -d "$output_dir" ]; then
        # 遍历各平台目录
        for platform_dir in "$output_dir"/*; do
            if [ -d "$platform_dir" ]; then
                local platform_name=$(basename "$platform_dir")
                echo ""
                echo "  [$platform_name]"
                for file in "$platform_dir"/*; do
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

# ============================================
# 主流程
# ============================================

main() {
    local project_root=$(get_project_root)
    cd "$project_root"

    local version=$(node -p "require('./package.json').version")

    # 检测当前平台
    local os=$(detect_os)
    local arch=$(detect_arch)

    echo "========================================"
    echo "Web Clipboard 本地构建"
    echo "========================================"
    echo "版本: $version"
    echo "操作系统: $os"
    echo "CPU 架构: $arch"
    echo "========================================"
    echo ""

    # 检查环境依赖
    check_dependencies

    # 检测平台是否支持
    if [ "$os" = "unknown" ]; then
        echo "错误: 无法识别的操作系统 $(uname -s)"
        exit 1
    fi

    # 获取构建命令
    local build_cmd=$(get_build_command "$os" "$arch")

    if [ -z "$build_cmd" ]; then
        echo "错误: 不支持的平台组合 ($os $arch)"
        exit 1
    fi

    echo "将执行构建命令: npm run $build_cmd"
    echo ""

    # 执行构建
    do_build "$build_cmd"

    # 显示结果
    show_result

    echo "========================================"
    echo "全部完成！"
    echo "========================================"
}

# 运行主流程
main "$@"
