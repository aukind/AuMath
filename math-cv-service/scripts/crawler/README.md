# AuMath 爬虫 / 导入教程（自助操作）

把题目/资料爬取入库的全部脚本都在本目录。读完即可自己跑。

---

## 0. 一次性准备

```bash
cd math-cv-service
source .venv/bin/activate                 # 进虚拟环境
pip install patchright datasets           # patchright=过 Cloudflare；datasets=NuminaMath（按需）
# 确认本机装了 Google Chrome（patchright 用真实 Chrome 过 Cloudflare）
```

**环境变量**（脚本不自动读 .env，跑前先 source 仓库根的 `.env.local`）：

```bash
set -a; source ../.env.local; set +a
# 关键变量：GEMINI_API_KEY（LLM 提取）、NEXT_PUBLIC_SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY（入库）
```

**数据库迁移**（只需各跑一次，在 Supabase SQL Editor）：`024_competition_track.sql`（竞赛分流）、`025_journal_articles.sql`（期刊表）。已跑过则忽略。

**代理 / Cloudflare 要点**：
- `CRAWLER_PROXY` 默认 `http://127.0.0.1:7897`（Clash）。不需要代理设 `CRAWLER_PROXY=none`。
- AoPS 在 Cloudflare 后面：**必须 `CRAWLER_HEADLESS=0`（可见 Chrome 窗口）**才过得去，headless 会被硬拦。弹出验证码就手动点一下。
- `CRAWLER_PROFILE_DIR=/tmp/aops-cf2`：复用同一浏览器配置目录，过一次后 cookie 留存、后续更快。

---

## 1. 单份 AoPS 试卷 — `automated_pipeline.py`

爬任意一个 AoPS wiki 页（一份卷）。

```bash
# 默认就是 2023 AMC 12A（含答案页合并）
CRAWLER_HEADLESS=0 CRAWLER_PROFILE_DIR=/tmp/aops-cf2 \
  python scripts/crawler/automated_pipeline.py --dry-run        # 先看不入库
CRAWLER_HEADLESS=0 CRAWLER_PROFILE_DIR=/tmp/aops-cf2 \
  python scripts/crawler/automated_pipeline.py                  # 真入库
```

参数：
- `--page`：AoPS 页名（下划线连接），如 `2024_CMO_Problems`、`2023_AIME_I_Problems`
- `--answer-page`：答案页（可选；AMC 默认自动配 `_Answer_Key`）
- `--contest`：赛事名，入库到 `papers.contest`，如 `"中国数学奥林匹克(CMO)"`
- `--region`：`domestic`(国内) / `international`(国外，默认)
- `--year`：年份（不填自动从标题/页名解析）
- `--dry-run`：只抓取+解析+落盘 `/tmp/aops_questions.txt`，不入库

例：爬 2024 CMO（国内竞赛）
```bash
CRAWLER_HEADLESS=0 CRAWLER_PROFILE_DIR=/tmp/aops-cf2 python scripts/crawler/automated_pipeline.py \
  --page "2024_CMO_Problems" --contest "中国数学奥林匹克(CMO)" --region domestic --dry-run
```

> 注意：AoPS 上 `YYYY_CMO(CHINA)` 是**索引页**（只有链接），真正含题的是 **`YYYY_CMO_Problems`**。同理找 `_Problems` 结尾的「全集页」。

---

## 2. 国内竞赛批量 — `cn_contests.py`

一键批量爬 CMO / China TST / 高联（逐年试多个候选页名，命中即入库，`region=domestic`）。

```bash
# 先 dry-run 看哪些页名命中（不入库）
CRAWLER_HEADLESS=0 CRAWLER_PROFILE_DIR=/tmp/aops-cf2 \
  python scripts/crawler/cn_contests.py --dry-run --only CMO --limit 3
# 确认 OK 后真入库
CRAWLER_HEADLESS=0 CRAWLER_PROFILE_DIR=/tmp/aops-cf2 \
  python scripts/crawler/cn_contests.py --only CMO --limit 5
```

参数：`--only {CMO,TST,GAOLIAN}`、`--limit N`（本次最多成功几卷，默认 3，方便先试）、`--all`（全量）、`--dry-run`。
结尾打印汇总：哪些年份/页名命中（✓）、哪些候选都没中（✗，按需去 AoPS 查正确页名补进 `cn_contests.py` 的 `pages` 列表）。

---

## 3. NuminaMath 开放数据集导入 — `numina_import.py`

不用过 Cloudflare，从 Hugging Face 批量导竞赛题（~86 万题里的竞赛子集），按 source 分组成「合集」卷。

```bash
pip install datasets   # 若没装
python scripts/crawler/numina_import.py --dry-run --limit 20    # 预览
python scripts/crawler/numina_import.py --limit 200             # 每组导 200 题入库
```

参数：`--limit`（每组上限）、`--sources`（默认 `amc_aime,olympiads,aops_forum`）、`--dry-run`。
HF 下载走代理：已 source 的 `HTTPS_PROXY` 即可；慢可设 `export HF_HUB_DOWNLOAD_TIMEOUT=60`。

---

## 4. 期刊元数据 — `journals_crawl.py`

期刊只存**元数据 + 外链**（规避知网/维普付费墙与版权），按主题打标签供前端二级筛选。

```bash
python scripts/crawler/journals_crawl.py --demo               # 灌 5 条示例(覆盖5主题)，先看通期刊 UI
python scripts/crawler/journals_crawl.py --demo --dry-run     # 只打印不写库
```

> ⚠️ **维普 cqvip 实测 412 反爬**、CSDN/知乎也挡，学术期刊目录**目前无法稳定自动爬**。
> `fetch_cqvip()` 已留接口但返回空。要接真实来源时，在 `journals_crawl.py` 里：
> 1. 写一个 `fetch_xxx()` 适配器，返回行 dict（字段见文件顶部注释，含唯一 `source_key`）；
> 2. 用 `classify_topic(title)` 给 `tags` 打主题；
> 3. 加进 `ADAPTERS`，`--source xxx` 运行；`upsert(on_conflict=source_key)` 自动去重增量。
>
> 想清掉示例占位：在 SQL Editor 跑 `delete from journal_articles where source_key like 'demo:%';`

---

## 5. 入库后注意

- **去重**：竞赛同名卷会先删旧再插（幂等）；期刊按 `source_key` upsert。重复跑不产生重复。
- **缓存**：题库/竞赛列表用 `unstable_cache`（tag `papers`，revalidate 1 小时）。爬完竞赛后，**生产环境最多 1 小时**才刷新出来（或触发任意一次试卷增改会 bust）。本地 dev 可 `rm -rf .next` 重启立即生效。期刊 `getJournalArticles` 未缓存，立即可见。
- **LaTeX**：Gemini JSON 输出会损坏反斜杠转义（`\frac`→控制符），`repair_latex_escapes()` 已自动还原；入库前 `--dry-run` 落盘 `/tmp/aops_questions.txt` 可肉眼核对。

## 6. 常见问题

| 现象 | 原因 / 处理 |
|---|---|
| `被 Cloudflare 拦在挑战页` | 用 `CRAWLER_HEADLESS=0` 跑、手动过验证码；或换代理节点 |
| `未解析出题目` | 多半页名不对（是索引页非 `_Problems` 全集页）；看 `/tmp/aops_dump.txt` |
| 维普 412 | 反爬，暂无法自动爬，见 §4 |
| 入库报 track/region 列不存在 | 迁移 024 没跑 |
| 期刊页空白报错 | 迁移 025 没跑 |
