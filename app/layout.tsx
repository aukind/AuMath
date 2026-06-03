import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
// KaTeX 字体与符号样式必须全局引入，MathRenderer 渲染的数学公式才能正确显示
import "katex/dist/katex.min.css";
import { LayoutGroup } from "framer-motion";
import { ThemeProvider } from "@/components/ThemeProvider";
import SmoothScrollProvider from "@/components/providers/SmoothScrollProvider";
import BackgroundProvider from "@/components/background/BackgroundProvider";
import { Toaster } from "sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://aumath.com"),
  title: "AuMath · 高阶数学题库与社区",
  description: "面向高考真题、模拟题与圆锥曲线、导数等高难拔高训练的数学题库与学习社区。",
  openGraph: {
    siteName: "AuMath",
    type: "website",
    locale: "zh_CN",
  },
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
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
          </ThemeProvider>
        </SmoothScrollProvider>
      </body>
    </html>
  );
}
