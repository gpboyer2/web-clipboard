#!/bin/bash

# Web Clipboard 本地构建脚本
# 自动检测当前平台并执行 pkg 打包

set -e

# 获取脚本目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 加载公共函数库
source "$SCRIPT_DIR/build-common.sh"

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
