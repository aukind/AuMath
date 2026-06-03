# latex-normalizer (Rust → WASM)

aumath.com LaTeX 规范化器的 Rust 实现骨架。目标：把「公式严格规范化」这条核心规则
做成**前后端共用同一份逻辑**——服务端录入批处理 + 浏览器实时录题校验，只写一遍。

## 覆盖范围 —— 与 `lib/normalizeLatex.ts` **全量 parity** ✅

| pass | 状态 |
|------|:---:|
| 同义词归一 `\le→\leq` `\ge→\geq` `\to→\rightarrow` … | ✅ |
| 间距宏剥离 `\,` `\!` `\;` `\:` `\quad` `\qquad` … | ✅ |
| 空白折叠 + 闭合 `}` 后空白丢弃 | ✅ |
| 冗余括号扁平 `{{x}}→{x}` | ✅ |
| 上下标重排 `x^{a}_{b}→x_{b}^{a}` | ✅ |
| `\over → \frac` | ✅ |
| 未括参数补括 `x^2→x^{2}`、`\frac 1 2→\frac{1}{2}` | ✅ |

> parity 由 `lib/__tests__/normalizeLatexWasm.test.ts` 交叉断言 `wasm(x) === ts(x)` 保证（31 例全过）。
> 实现：解析成最小 AST（`src/lib.rs` 的 `Parser`）→ 变换 → 序列化，非纯正则。

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

## 接入点（均已接通）

- **录入流程**：`app/actions/process-paper.ts` → `lib/normalizeLatexSmart.ts`。
  置 `USE_WASM_NORMALIZER=1` 切到 WASM（nodejs 产物，`createRequire` 同步加载），否则走 TS。
- **实时录题校验**：`components/AddQuestionForm.tsx` 预览区挂 `components/editor/LatexNormalizeHint.tsx`。
  防抖调用 `lib/wasm/normalizeLatexWasmBrowser.ts`（运行时 URL import `public/wasm/`），
  检测到非规范写法即浮出「一键规范化」。WASM 缺失时静默不显示，不影响录题。

## 路线图（后续可选）

1. parity 长期稳定后，把 `USE_WASM_NORMALIZER` 默认开启，TS 版退化为 fallback。
2. 把规范化提示扩展到 `DualPaneEditor`（试卷编辑）与论坛发帖编辑器。
3. 性能基线对比（大批量入库时 WASM vs TS 吞吐）。
