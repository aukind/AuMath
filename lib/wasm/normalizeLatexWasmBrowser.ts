/**
 * 浏览器侧 Rust→WASM 规范化器加载器（实时录题校验）。
 *
 * 产物 `public/wasm/`（`npm run build:wasm:web`）经**运行时 URL 动态 import** 加载，
 * 用 webpack/turbopack-ignore 注释绕开打包器对生成物的静态解析——与本仓库
 * react-dom/server 动态 import 同一套路。`__wbg_init()` 无参时会就近 fetch
 * `/wasm/latex_normalizer_bg.wasm`。
 *
 * 产物缺失 / 加载失败时静默降级（返回 null），录题表单照常工作。
 */

interface WasmModule {
  default: (input?: unknown) => Promise<unknown>;
  normalize_latex: (input: string) => string;
  canonicalize_math_body: (body: string) => string;
}

let modPromise: Promise<WasmModule | null> | null = null;

async function load(): Promise<WasmModule | null> {
  if (typeof window === "undefined") return null; // 仅浏览器
  if (!modPromise) {
    modPromise = (async () => {
      try {
        // 变量化 specifier：让 tsc/打包器都不静态解析这个 public 运行时路径。
        const url = "/wasm/latex_normalizer.js";
        const mod = (await import(
          /* webpackIgnore: true */ /* turbopackIgnore: true */ url
        )) as unknown as WasmModule;
        await mod.default(); // 初始化：就近 fetch .wasm
        return mod;
      } catch {
        return null;
      }
    })();
  }
  return modPromise;
}

/** 是否可用（已构建并加载成功）。 */
export async function isBrowserNormalizerReady(): Promise<boolean> {
  return (await load()) !== null;
}

/** 整段文本规范化；不可用返回 null。 */
export async function normalizeLatexBrowser(input: string): Promise<string | null> {
  const m = await load();
  return m ? m.normalize_latex(input) : null;
}

/** 单条公式体规范化；不可用返回 null。 */
export async function canonicalizeMathBodyBrowser(body: string): Promise<string | null> {
  const m = await load();
  return m ? m.canonicalize_math_body(body) : null;
}
