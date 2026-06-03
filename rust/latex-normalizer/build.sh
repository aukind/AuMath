#!/usr/bin/env bash
# 构建 Rust → WASM 规范化器，产物输出到 lib/wasm/latex-normalizer/。
#
# 依赖（一次性）：
#   curl https://sh.rustup.rs -sSf | sh -s -- -y       # 安装 rustc/cargo
#   cargo install wasm-pack                            # 安装 wasm-pack
#
# 用法：
#   bash rust/latex-normalizer/build.sh                # nodejs 目标（服务端/录入流程）
#   TARGET=web bash rust/latex-normalizer/build.sh     # web 目标（浏览器/实时录题校验）
set -euo pipefail

CRATE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$CRATE_DIR/../.." && pwd)"
TARGET="${TARGET:-nodejs}"

# 产物去向按目标分流：
#   nodejs → lib/wasm/latex-normalizer/（服务端 createRequire 同步加载）
#   web    → public/wasm/（浏览器经运行时 URL 加载，避开打包器对生成物解析）
if [ "$TARGET" = "web" ]; then
  OUT_DIR="$REPO_ROOT/public/wasm"
else
  OUT_DIR="$REPO_ROOT/lib/wasm/latex-normalizer"
fi

if ! command -v wasm-pack >/dev/null 2>&1; then
  echo "✗ 未找到 wasm-pack。先装：cargo install wasm-pack" >&2
  exit 1
fi

echo "→ 先跑原生单测（cargo test）确保逻辑正确…"
( cd "$CRATE_DIR" && cargo test )

echo "→ 构建 WASM（target=$TARGET）→ $OUT_DIR"
wasm-pack build "$CRATE_DIR" \
  --release \
  --target "$TARGET" \
  --out-dir "$OUT_DIR" \
  --out-name latex_normalizer

# wasm-pack 会在产物目录生成 `.gitignore: *`，挡住产物入库；删掉它（产物需提交给 Vercel）。
rm -f "$OUT_DIR/.gitignore"

echo "✓ 完成。产物："
ls -lh "$OUT_DIR"
