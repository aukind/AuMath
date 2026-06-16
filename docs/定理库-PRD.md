# 定理库 ⟷ 知识星图（Theorem Library）PRD

> 吸收数之谜「定理资料」+ MathNet「带溯源的结构化定理」+ Obsidian 双链。
> 核心思路：定理是区别于「知识点」「题目」的**第三类星图节点**，加一条
> **「定理→题」引用桥边**，把题库和定理库物理打通；其余全复用现有星图。

## 1. 目标

| 能力 | 实现 |
|---|---|
| 定理作为星图第三类节点（金色菱形） | ✅ `NodeType += 'theorem'` |
| 定理 → 知识点（归属）、定理 → 题（引用）两类新边 | ✅ `LinkKind += theorem_topic / theorem_cite` |
| 点定理出 TheoremInspector：陈述/证明/所属知识点/「用到此定理的题目」 | ✅ |
| 点知识点的 Inspector 多一段「定理」 | ✅ |
| `[[韦达定理]]` 维基链接直达定理节点 | ✅ 复用 linkifyWikiRefs（按名解析扩到定理） |
| AI 自动识别题目用到的定理（复用打标管线） | ✅ Admin 回填 |

**非目标（二期）**：定理证明的人工精修 UI、定理间依赖边（定理→定理）、解题工作台的「`[[定理]]` 拖拽卡」（数据已就绪，UI 二期）。

## 2. 数据模型（迁移 032，需手动 Run）

```
theorems(id, name UNIQUE, slug UNIQUE, statement, proof, figure_url, description)
theorem_topic_relations(theorem_id, topic_id)        -- 归属边
theorem_question_relations(theorem_id, question_id)  -- 引用边 ★ 题库×定理库的桥
```
RLS：公共可读（星图匿名底图要读）；写入仅管理员（回填走 service-role 绕过）。
`types/supabase.ts` 已手工补三表（regen 会自动重现）。

## 3. AI 管线（完全镜像知识点打标）

- `lib/theorems/taxonomy.ts`：受控词表（24 条高频定理，每条带 LaTeX 陈述）。
- `lib/theorems/classify.ts`：`classifyTheorems` — Gemini 判断每题「实际用到」哪些定理（宁缺毋滥）。
- `lib/theorems/linker.ts`：`ensureTheorems`（按名查/建定理行）+ `linkQuestionsToTheorems`
  （写引用边，并**由题目所挂知识点派生归属边**——比手填更准，定理节点自然落在它服务的知识点旁）。
- `app/actions/theorems.ts`：`seedTheorems`（建空库）+ `backfillTheoremCitations`（反连接取「尚无引用」的题，批量识别）。
- Admin 入口：试卷管理页 `TheoremBackfillButton`（初始化定理库 / 回填引用）。

## 4. 星图集成（app/actions/graph.ts）

- `getBaseGraphCached`：多查 3 表（迁移 032 未跑则静默降级为空，星图其余不受影响），
  产出定理节点 + theorem_topic / theorem_cite 边；缓存键升 `v3`。
- `getPersonalizedGraphData`：只保留与「保留的知识点/题目」相连的定理（不留孤儿浮点）。
- `getTopicInspector`：返回多一项 `theorems`。
- `getTheoremInspector(id)`：现查 theorems 表取陈述/证明（不进缓存底图）+ 所属知识点 + 引用题目（带个人掌握度）。

## 5. 验收

- [ ] 迁移 032 Run → Admin 点「初始化定理库」→ 库有 24 条定理。
- [ ] 点「回填定理引用」若干批 → /explore 出现金色菱形定理节点 + 金色虚线归属边 + 引用边。
- [ ] 点定理节点 → TheoremInspector：陈述 KaTeX 正常、证明可折叠、所属知识点/题目可跳转。
- [ ] 点知识点 → Inspector 出现「定理」段，点定理芯片切到 TheoremInspector。
- [ ] 题面/解析里 `[[韦达定理]]` → /explore?focus=韦达定理 直达该定理。
- [ ] 迁移未跑时 /explore 正常（无定理层），不报错。
- [ ] `tsc` + `eslint` 通过。

## 6. 里程碑

- **M1（本 PR）**：迁移 + AI 管线 + 星图集成 + 两个 Inspector + 维基链接 + Admin 回填。
- **M2**：解题工作台右栏「本题涉及定理」卡（读 theorem_question_relations）→ 接通 [[解题工作台]] 的定理卡。
- **M3**：定理证明精修 UI、定理→定理 依赖边、定理详情独立页（SEO）。
