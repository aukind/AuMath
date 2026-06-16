# 解题工作台 · Solving Canvas（MVP PRD）

> 北极星功能首版。把已经写好但各自为战的模块——题面渲染（MathRenderer）、
> 全屏手写演算（CanvasScratchpad）、知识星图、FSRS 错题本——焊成一个
> 「读题 → 演算 → 卡住求助 → 沉淀」的解题闭环。本期只交付**演算 + 渐进提示
> + 会话沉淀**三件，OCR 判分 / 定理双链卡 / 卡点热力为二期。

## 1. 背景与定位

竞品（数之谜小程序）是「名师 + 真题 + 社群」，它结构上做不了重交互。
我们的差异化不是「更大的题库」，而是「更懂你的解题伙伴」：在学生真正动笔的
那一刻提供陪伴式 AI（对标 Brilliant Koji / Notion Agent 的「看得到你在做什么」），
并把每一次解题自动沉淀为个人数据（对标 GoodNotes Smart Learn）。

## 2. 目标（本期）

| 指标 | 目标 |
|---|---|
| 能在专属页面 `/solve/[id]` 读题 + 全屏手写演算 | ✅ 复用 CanvasScratchpad，零重写 |
| 卡住时可获得**不泄底**的渐进式提示（3 级递进） | ✅ Gemini，服务端持有完整解答仅产出提示 |
| 每次解题落库为一条 `solving_sessions` 流水 | ✅ 时长 / 提示用量 / 自评结果 |
| 题面服务端渲染、首屏无公式闪烁 | ✅ MathRenderer 在 RSC 渲染后以 slot 注入 |

**非目标（二期）**：手写 OCR 判分、`[[定理]]` 拖拽卡、卡点知识点热力图、
演算 PNG 快照存储、outcome=solved 回写 `user_question_attempts` / FSRS。

## 3. 用户故事

1. 我在题库点开一道导数压轴题，进入解题工作台，左侧是题面，右下角召出
   GoodNotes 级手写草稿本直接在屏上演算。
2. 卡住了——我点「提示」，AI 先只给「方向性一问」（不给方法）；还卡，再点
   一次给「关键方法」（不给计算）；最差再点一次给「关键一步」（但停在最终答案前）。
3. 我可以在「我卡在哪」里描述当前思路，提示会据此更贴合。
4. 做完点「我做出来了 / 靠提示做出 / 卡住 / 看答案」，系统记录本次会话；
   想对答案时再手动展开「答案与解析」。

## 4. 范围与信息架构

- 新路由 `app/solve/[id]/page.tsx`（RSC，登录门控，复用 `getQuestionForGraph` 取题）。
- 题面与「答案/解析」均在 **RSC 内用 MathRenderer 渲染**，作为 `problemSlot` /
  `answerSlot` 传入客户端工作台（沿用首页流式渲染「服务端内容当 prop 注入」的范式）。
- 客户端 `SolvingWorkbench`：两栏布局（桌面：题面 60% + 解题助手轨 40%；移动：上下堆叠）。
  - 计时（进入即起算），提示用量回调累计，自评结果按钮。
  - 挂载 `<CanvasScratchpad />`（其自带右下角 FAB，**完全不改它的 API**）。
- 客户端 `HintPanel`：渐进提示卡片（逐级揭示）+「我卡在哪」可选输入。
- 入口：题卡 / 题目详情页加「进入工作台」按钮（本期先建页面与直链，入口按钮可后续接）。

## 5. 渐进提示设计（核心）

服务端 `getProgressiveHint(questionId, level, studentContext?)`：

- **鉴权**：AI 端点必须登录（沿用约定）。
- **取数**：服务端读取题面 + 解析 + 答案 + 标准解（仅服务端持有）。
- **分级语义**（系统指令强约束「绝不泄露最终答案/数值结果」）：
  - L1 · 定向：点明考查方向 + 一个该自问的问题，**不给方法**。
  - L2 · 方法：指出关键方法 / 变形 / 模型，**不代入计算**。
  - L3 · 关键步：把卡点那一步讲透，但**停在得出最终答案之前**。
- **降级**：无 key / 超时 / 输出损坏 → 返回判别联合的 `{ ok:false }`，前端提示「提示生成失败」，绝不抛错（沿用 classify/embeddings 范式）。
- **返回**：判别联合 `{ ok:true, hint } | { ok:false, error }`，绝不 throw（生产脱敏约定）。

`studentContext`（「我卡在哪」自由文本）现在就接，不依赖 OCR，即可实现
「看得到你在想什么」的贴合感；二期把 OCR 文本接到同一参数即可平滑升级。

## 6. 数据模型

迁移 `031_solving_sessions.sql`（**需手动在 SQL Editor Run**，沿用本项目无 CLI 工作流）：

`solving_sessions`（append 流水，类比 FSRS 的 `user_review_logs`，与每题汇总
`user_question_attempts` 互补）：

| 列 | 类型 | 说明 |
|---|---|---|
| id | uuid pk | `gen_random_uuid()` |
| user_id | uuid fk auth.users | RLS 主体 |
| question_id | uuid fk questions | |
| max_hint_level | smallint | 本次最高揭示级（0=没看） |
| hints_used | smallint | 提示请求次数 |
| duration_sec | int | 解题时长 |
| outcome | text check | solved / hinted / stuck / gave_up |
| note | text | 自评备注（可空） |
| scratch_url | text | 二期：演算快照 PNG |
| created_at | timestamptz | |

RLS：`own solving sessions` `FOR ALL USING (auth.uid()=user_id) WITH CHECK (...)`。

## 7. 验收

- [ ] 未登录访问 `/solve/[id]` → 跳登录回跳。
- [ ] 题面服务端渲染、KaTeX 无闪烁；答案默认折叠。
- [ ] 草稿本可全屏手写、撤销/重做/橡皮、手指滑动翻题（CanvasScratchpad 原能力）。
- [ ] 提示三级递进且任一级都不出现最终答案；无 key 时优雅降级。
- [ ] 点自评结果后 `solving_sessions` 落一行（迁移 031 已 Run 时）；未 Run 则功能 inert 不崩。
- [ ] `tsc --noEmit` 与 `eslint` 通过。

## 8. 里程碑

- **M1（本 PR）**：迁移 + 提示 Server Action + 工作台首版 + 路由。
- **M2**：题卡/详情页入口按钮；「我的解题历史」列表（读 solving_sessions）。
- **M3（二期）**：手写 OCR → 判分 + 自动进错题本；`[[定理]]` 拖拽卡；卡点知识点热力。
