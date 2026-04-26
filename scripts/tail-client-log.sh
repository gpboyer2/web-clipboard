#!/bin/zsh

cd /Users/peng/Desktop/Project/web-clipboard || exit 1

mkdir -p logs
touch logs/web-clipboard.out.log logs/web-clipboard.error.log

tail -n 80 -f logs/web-clipboard.out.log logs/web-clipboard.error.log
