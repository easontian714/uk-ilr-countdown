#!/usr/bin/env bash

set -euo pipefail

port="${PORT:-3000}"

echo "本地调试服务器已启动： http://127.0.0.1:${port}"
echo "按 Control+C 停止服务器。"

exec python3 -m http.server "${port}" --bind 127.0.0.1
