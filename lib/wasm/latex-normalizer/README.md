# latex-normalizer (Rust → WASM)

aumath.com LaTeX 规范化器的 Rust 实现骨架。目标：把「公式严格规范化」这条核心规则
做成**前后端共用同一份逻辑**——服务端录入批处理 + 浏览器实时录题校验，只写一遍。

## 当前覆盖（词法子集，与 `lib/normalizeLatex.ts` 对齐）

| pass | 状态 |
|------|:---:|
| 同义词归一 `\le→\leq` `\ge→\geq` `\to→\rightarrow` … | ✅ |
| 间距宏剥离 `\,` `\!` `\;` `\:` `\quad` `\qquad` … | ✅ |
| 空白折叠（连续空格 → 单空格） | ✅ |
| 冗余括号扁平 `{{x}}→{x}` | ✅ |
| 上下标重排 `x^{a}_{b}→x_{b}^{a}` | 🚧 TODO（需 AST） |
| `\over → \frac` | 🚧 TODO（需 AST） |

> 生产默认仍用 TS AST 版（覆盖全部 pass）。本骨架用于打通 Rust→WASM 工具链与集成缝。

## 安装工具链（一次性）

```bash
curl https://sh.rustup.rs -sSf | sh -s -- -y
source "$HOME/.cargo/env"
cargo install wasm-pack
```

## 构建

```bash
# 服务端 / 录入流程（默认）
npm run build:wasm
# 浏览器 / 实时录题校验
npm run build:wasm:web
```

产物落在 `lib/wasm/latex-normalizer/`（已 gitignore，按需本地构建）。

## 跑测

```bash
cargo test --manifest-path rust/latex-normalizer/Cargo.toml   # 原生单测
npm test -- normalizeLatexWasm                                # TS 侧 parity（需先 build:wasm）
```

## 接入点

- **录入流程**（已接）：`app/actions/process-paper.ts` → `lib/normalizeLatexSmart.ts`。
  置 `USE_WASM_NORMALIZER=1` 切到 WASM，否则走 TS。
- **渲染/实时录题**（下一步）：用 `npm run build:wasm:web` 出 `--target web` 产物，
  在录题编辑器里 `await init()` 后调 `normalize_latex()` 做即时校验/预览。

## 路线图

1. 补 AST 解析（group/macro/script 三类节点），落地上下标重排与 `\over→\frac`，达成与 TS 全量 parity。
2. parity 达标后，把 `USE_WASM_NORMALIZER` 默认开启，TS 版退化为 fallback。
3. 浏览器侧接 `--target web` 产物，录题即输即校验。
