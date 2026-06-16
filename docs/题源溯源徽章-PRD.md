# 题源溯源徽章（Provenance Badge）PRD

> 对标 MathNet 的「带溯源的结构化题库」——让「AoPS 论坛搬来」和「官方真题」一眼可分，
> 给高端竞赛题库加**信任层**。零迁移、零回填、即时生效。

## 1. 设计要点：display-time 派生 + 管理员覆盖

溯源信息存 `question.metadata` JSONB（无迁移，沿用 choice_type 同款思路）：
- `metadata.origin`: `'official' | 'community' | 'derived'`
- `metadata.verified`: `boolean`

**派生顺序**（[lib/questions/provenance.ts](lib/questions/provenance.ts)）：
1. `metadata.origin` 显式值优先（管理员设的，或官方导入盖的 `official`）。
2. 否则按现有信号推断：
   - `metadata.exam_number` 形如 `"Problem N"`（AoPS 爬虫的英文题号）→ **community**
   - 否则有 `paper_id`（真题卷导入）→ **official**
   - 否则 → 无（手录题不冒充官方）
3. `verified` 仅取显式 `metadata.verified===true`。

→ **无需任何迁移/回填，徽章即时出现**：爬来的题自动「社区搬运」、真题卷自动「官方原题」，
管理员可一键覆盖或标「已核验」。

## 2. 交付

| 文件 | 作用 |
|---|---|
| [lib/questions/provenance.ts](lib/questions/provenance.ts) | `getProvenance(q)` 纯函数 + ORIGIN_META 徽章样式 |
| [components/ProvenanceBadge.tsx](components/ProvenanceBadge.tsx) | 徽章展示（官方原题🛡/社区搬运👥/改编变式🪄 + 已核验✓）+ 管理员内联标注弹层 |
| [app/actions/provenance.ts](app/actions/provenance.ts) | `setQuestionProvenance`（admin，合并 metadata，origin=null 退回自动；判别联合） |
| [QuestionCard.tsx](components/QuestionCard.tsx) | 头部来源右侧挂徽章（随题卡出现在题库/详情/星图抽屉/工作台） |
| [types/database.ts](types/database.ts) | QuestionMetadata 加 `origin`/`verified` |
| [process-paper.ts](app/actions/process-paper.ts) | 官方真题卷导入时盖 `metadata.origin='official'`（前向显式标注） |

## 3. 交互

- **所有人**：题卡头部见溯源徽章 + 「已核验」绿标；hover 提示「自动推断 / 管理员标注」。
- **管理员**：徽章旁笔形按钮 → 弹层选 origin（自动推断 / 官方 / 社区 / 改编）+ 切换「已核验」，乐观更新即时生效。

## 4. 验收

- [ ] AoPS 爬来的题（exam_number=`Problem N`）显示「社区搬运」。
- [ ] 真题卷导入的题（有 paper_id / `第N题`）显示「官方原题」。
- [ ] 手录题（无信号）不显示 origin 徽章（不妄标）。
- [ ] 管理员改 origin / 标已核验 → 立即变化、刷新后保持。
- [ ] 非管理员看不到笔形编辑按钮；`setQuestionProvenance` 非管理员拒绝。
- [ ] `tsc` + `eslint` 通过。

## 5. 二期

- 题库筛选/搜索按 origin（只看官方原题 / 只看已核验）。
- 详情页/工作台展开溯源详情（竞赛册、年份、原题号、原始链接）。
- 爬虫 Python 端显式盖 `metadata.origin='community'`（目前靠推断，已够用）。
