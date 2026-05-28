# 核心技术栈
- 前端框架：Next.js 14+ (App Router) + React 18 + TypeScript
- 样式方案：Tailwind CSS + shadcn/ui
- 数据库与后端：Supabase (PostgreSQL) + Server Actions
- 数学公式渲染：react-markdown + remark-math + rehype-katex

# 业务领域：高阶数学题库
这是一个面向高难度拔高训练（如高考真题、模拟题、圆锥曲线、导数等）的数学学习网站。核心数据包含大量的 LaTeX 公式文本、题目解析和变式。

# 架构与编码规范
1. 默认使用 TypeScript，严格定义数据接口（Interfaces/Types）。
2. 数据交互优先使用 Next.js Server Actions，不使用传统的 API Routes。
3. 数据库设计要充分利用 PostgreSQL 的 JSONB 字段特性，以应对多变的题目属性。
4. 组件拆分：凡是涉及状态交互（如在线讨论、点赞）的标记为 `"use client"`；静态题目渲染和目录树优先保留为 Server Components 以保证极致的首屏加载速度和 SEO。
5. 在处理数学公式渲染时，务必处理好 LaTeX 转义字符和 KaTeX 样式加载。】