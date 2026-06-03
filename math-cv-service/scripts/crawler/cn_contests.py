"""国内数学竞赛批量爬取入库（复用 automated_pipeline 的 AoPS 管线，region='domestic'）。

覆盖：中国数学奥林匹克 CMO、China TST、全国高中数学联赛（高联）—— 取 AoPS Wiki 上有的年份。
AoPS 各年页名不完全统一，故每个目标给**多个候选页名**，逐一尝试，第一个能解析出题的即采用。
入库走 automated_pipeline.SupabaseUploader.upload(region='domestic', contest=…)，同名去重，反复跑不重复。

用法：
  cd math-cv-service && source .venv/bin/activate
  set -a; source ../.env.local; set +a
  CRAWLER_HEADLESS=0 python scripts/crawler/cn_contests.py --dry-run --limit 2   # 先试 2 个，看哪些页名命中
  CRAWLER_HEADLESS=0 python scripts/crawler/cn_contests.py --only CMO --limit 5  # 真入库 CMO 前 5 年
  CRAWLER_HEADLESS=0 python scripts/crawler/cn_contests.py --all                 # 全量

提示：过 Cloudflare 同 AoPS 要求 patchright + 真实 Chrome + CRAWLER_HEADLESS=0（见 [[project_aops_crawler]]）。
"""

import argparse
import asyncio
from typing import List, Dict

from automated_pipeline import run_pipeline, AIExtractor, CVServiceClient, SupabaseUploader


def _cmo_targets() -> List[Dict]:
    out = []
    for y in range(2024, 2009, -1):
        out.append({
            "contest": "中国数学奥林匹克 (CMO)",
            "year": y,
            # 注意：AoPS 上 "YYYY_CMO(CHINA)" 是索引页，真正含题的是 "YYYY_CMO_Problems"（AMC 同款 _Problems 全集页）
            "pages": [
                f"{y}_CMO_Problems",
                f"{y}_China_National_Olympiad_Problems",
                f"{y}_China_National_Olympiad",
            ],
        })
    return out


def _tst_targets() -> List[Dict]:
    out = []
    for y in range(2024, 2014, -1):
        out.append({
            "contest": "China TST",
            "year": y,
            "pages": [f"{y}_China_TST_Problems", f"{y}_China_Team_Selection_Test", f"{y}_China_TST"],
        })
    return out


def _gaolian_targets() -> List[Dict]:
    # 全国高中数学联赛（高联）：AoPS 覆盖较散，候选若都不中则该年跳过（已确认缺年不强求）。
    out = []
    for y in range(2024, 2014, -1):
        out.append({
            "contest": "全国高中数学联赛",
            "year": y,
            "pages": [
                f"{y}_China_National_High_School_Mathematics_Competition",
                f"{y}_China_MO_Preliminary",
            ],
        })
    return out


GROUPS = {"CMO": _cmo_targets, "TST": _tst_targets, "GAOLIAN": _gaolian_targets}


async def main():
    ap = argparse.ArgumentParser(description="国内竞赛批量爬取（CMO/China TST/高联）")
    ap.add_argument("--dry-run", action="store_true", help="只解析预览不入库")
    ap.add_argument("--limit", type=int, default=3, help="本次最多成功入库的卷数（默认 3，便于先试）")
    ap.add_argument("--only", choices=list(GROUPS), help="只跑某一组（CMO/TST/GAOLIAN）")
    ap.add_argument("--all", action="store_true", help="不限 limit，跑全部目标")
    args = ap.parse_args()

    groups = [args.only] if args.only else list(GROUPS)
    targets: List[Dict] = []
    for g in groups:
        targets += GROUPS[g]()

    # 共享初始化，避免每卷重建 Gemini/Supabase 客户端
    ai = AIExtractor()
    cv = CVServiceClient()
    uploader = None if args.dry_run else SupabaseUploader()

    done = 0
    summary = []
    for t in targets:
        if not args.all and done >= args.limit:
            break
        got = False
        for page in t["pages"]:
            print(f"\n──── 尝试 {t['contest']} {t['year']} ← {page} ────")
            try:
                res = await run_pipeline(
                    page, contest=f"{t['contest']}", region="domestic",
                    year=t["year"], dry_run=args.dry_run,
                    ai=ai, cv=cv, uploader=uploader,
                )
            except Exception as e:
                print(f"  [!] 异常：{e}")
                continue
            if res.get("success"):
                summary.append(f"✓ {t['contest']} {t['year']} ({page}) {res['questions']}题")
                done += 1
                got = True
                break  # 该年命中，不再试其余候选页名
        if not got:
            summary.append(f"✗ {t['contest']} {t['year']} (候选页名均未命中)")

    print("\n=== 汇总 ===")
    for line in summary:
        print(" ", line)
    print(f"成功 {done} 卷" + ("（DRY-RUN）" if args.dry_run else ""))


if __name__ == "__main__":
    asyncio.run(main())
