# 竞赛日历 + 备考倒计时（Competition Calendar）PRD

> 吸收数之谜「考试安排」——它最被依赖的功能之一，你完全没有、且与现有模块零耦合。
> 面向竞赛拔高人群的「陪伴感」：进站就知道距下一场大考还有多久。

## 1. 范围

- 新表 `competitions`（迁移 033）+ Server Actions + `/calendar` 页 + 后台 CRUD + 侧栏入口。
- **不动**题库/星图/首页（首页倒计时卡留作 M2，避免动 PageLayout 流式结构）。

## 2. 数据模型（迁移 033，需手动 Run）

```
competitions(id, name, short_name, level, exam_date, registration_deadline,
             location, url, description, is_featured)
```
- `level` ∈ gaokao/province/national/international/mock/other（CHECK）。
- RLS：公共读 + 管理员写（profiles.role='admin'）。`types/supabase.ts` 已手补。

## 3. Server Actions（[app/actions/competitions.ts](app/actions/competitions.ts)）

| 函数 | 用途 |
|---|---|
| `getUpcomingCompetitions(limit)` | 考试日 ≥ 今天，升序（/calendar 用） |
| `getAllCompetitions()` | 全部，升序（后台用） |
| `upsertCompetition(input)` | 新建/编辑（admin，判别联合返回） |
| `deleteCompetition(id)` | 删除（admin） |
| `seedCompetitions()` | 初始化 6 项常见竞赛（高考/高联/CMO/IMO/CGMO/AMC，2026 大致日期，按名去重） |

写操作走 service-role + `isAdminUser` 双保险；迁移未跑时读返回空、写报错但不崩。

## 4. 前端

- [/calendar](app/calendar/page.tsx)（RSC）：首屏 **大倒计时 Hero**（最近的 featured/最近一场）+「接下来」列表卡（层级徽章/日期+周几/报名截止/地区/官网 + 小倒计时药丸）。
- [CompetitionCountdown](components/competitions/CompetitionCountdown.tsx)（client）：实时跳动。**mounted 门控**避免注水失配（挂载前渲染破折号，rAF 落首值）；`lg` 天/时/分/秒每秒跳，`sm` 仅天每分钟刷新。
- 日期格式走 [lib/competitions/meta.ts](lib/competitions/meta.ts) 的确定性 `formatCnDate`（不走 toLocale，避免 SSR/CSR 失配）。
- 后台 [/admin/competitions](app/admin/competitions/page.tsx) + [CompetitionManager](components/admin/CompetitionManager.tsx)：列表 + 表单 + 删除 + 初始化。
- 侧栏 [HomeSidebar](components/HomeSidebar.tsx) 新增「竞赛日历」入口（CalendarClock 图标，紧邻「每日一题」）。

## 5. 验收

- [ ] Run 033 → 侧栏点「竞赛日历」进 /calendar。
- [ ] 无数据时：管理员见空态「初始化常见竞赛」；后台点一下种 6 项。
- [ ] Hero 大倒计时实时跳秒，无注水失配（控制台无 hydration 警告）。
- [ ] 列表卡显示日期/周几/报名截止（已过截止划线灰显）/官网链接；小药丸按剩余天数变色（≤7 天琥珀、当天玫红）。
- [ ] 后台增/改/删即时刷新；非管理员访问 /admin/competitions 跳首页。
- [ ] `tsc` + `eslint` 通过。

## 6. 里程碑

- **M1（本 PR）**：表 + Actions + /calendar + 后台 CRUD + 侧栏入口。
- **M2**：首页倒计时卡（嵌 PageLayout）；按竞赛筛选题库（competitions×papers.track）；个人「关注的竞赛」+ 报名截止提醒（接通知系统）。
