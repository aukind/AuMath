import type { Metadata, Viewport } from "next";
import "./globals.css";
// KaTeX 字体与符号样式必须全局引入，MathRenderer 渲染的数学公式才能正确显示
import "katex/dist/katex.min.css";
// Lenis 必需样式：html.lenis{height:auto} 覆盖 <html> 的 h-full(height:100%)，
// 否则文档被锁死在视口高度，所有 min-h-screen 文档流页(/library 等)无法滚动。
import "lenis/dist/lenis.css";
import { LayoutGroup } from "framer-motion";
import { ThemeProvider } from "@/components/ThemeProvider";
import SmoothScrollProvider from "@/components/providers/SmoothScrollProvider";
import BackgroundProvider from "@/components/background/BackgroundProvider";
import { Toaster } from "sonner";
import AgentPanel from "@/components/agent/AgentPanel";

export const metadata: Metadata = {
  metadataBase: new URL("https://aumath.com"),
  title: "AuMath · 高阶数学题库与社区",
  description: "面向高考真题、模拟题与圆锥曲线、导数等高难拔高训练的数学题库与学习社区。",
  openGraph: {
    siteName: "AuMath",
    type: "website",
    locale: "zh_CN",
  },
  // PWA：清单 + iOS「添加到主屏幕」全屏启动（apple-mobile-web-app-capable 等由此注入）
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "AuMath",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#4f46e5",
};

export default function RootLayout({
  children,
  modal,
}: Readonly<{
  children: React.ReactNode;
  modal: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      suppressHydrationWarning
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">
        {/* Lenis 全局平滑滚动须在最外层，先于主题水合接管文档滚动器 */}
        <SmoothScrollProvider>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            {/* 全站垫底「呼吸态流体光晕」：fixed + -z-10 画在 body 底色之上、内容之下，
                pointer-events:none 绝不阻挡交互；挂在 ThemeProvider 内以读取 resolvedTheme */}
            <BackgroundProvider />
            {/* LayoutGroup 同时包住 children 与 @modal slot：跨 slot 共享 layoutId
                的卡片→弹窗 morph 才能在不卸载的同一子树内连续过渡 */}
            <LayoutGroup>
              {/* data-app-shell：弹窗开启时由 globals.css 的 :has() 规则做背景缩放
                  （模糊由弹窗遮罩自身的 backdrop-blur 提供）。无弹窗时零 transform，不影响常态浏览。 */}
              <div data-app-shell className="flex min-h-full w-full flex-1 flex-col">
                {children}
              </div>
              {modal}
            </LayoutGroup>
            <Toaster richColors position="top-right" />
            {/* Claude 站内助手：登录后浮现入口；管理员拿全权工具集（含删除/批量回填）。
                未登录由组件自身探测 /api/agent 后静默不渲染。 */}
            <AgentPanel />
          </ThemeProvider>
        </SmoothScrollProvider>
      </body>
    </html>
  );
}
