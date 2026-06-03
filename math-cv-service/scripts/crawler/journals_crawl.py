"""期刊（高考数学研究报告）元数据爬取 → journal_articles（迁移 025）。

设计：只存元数据 + 外链（标题/作者/期号/摘要/原站 URL），不托管全文 —— 规避知网/维普
付费墙与版权。source_key（原文 URL）唯一，upsert 去重，可反复跑做增量。

用法：
  cd math-cv-service && source .venv/bin/activate
  set -a; source ../.env.local; set +a
  python scripts/crawler/journals_crawl.py --demo          # 先灌几条「示例」占位，看通 UI
  python scripts/crawler/journals_crawl.py --source sxtb   # 真爬某个已实现的适配器

⚠️ 真适配器需按目标站点结构填 parse 选择器；多数核心期刊正文付费，只能取公开目录页的
   标题/摘要/期号。候选公开入口：数学通报 BNU 页、维普 cqvip 期刊目录页等。
"""

import argparse
import os
import sys
from typing import List, Dict

from supabase import create_client, Client


def get_client() -> Client:
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise ValueError("缺少 Supabase 环境变量（NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY）")
    return create_client(url, key)


def upsert_articles(rows: List[Dict]) -> int:
    """按 source_key upsert 去重；返回写入条数。需迁移 025 已建表。"""
    if not rows:
        return 0
    client = get_client()
    try:
        client.table("journal_articles").upsert(rows, on_conflict="source_key").execute()
        return len(rows)
    except Exception as e:
        print(f"[!] 写入失败（是否已跑迁移 025？）：{e}")
        return 0


# ── 主题分类（用户要的二级筛选维度）──────────────────────────────────────────
TOPICS = ["解题研究", "专题突破", "一题多解", "方法精进", "模拟背景"]


def classify_topic(title: str, section: str = "") -> str:
    """按标题/栏目关键词归入一个主题标签（写进 journal_articles.tags 供前端二级筛选）。"""
    t = f"{title or ''} {section or ''}"
    if "多解" in t or "多种解" in t or "一题多" in t:
        return "一题多解"
    if "专题" in t or "突破" in t or "压轴" in t:
        return "专题突破"
    if "方法" in t or "技巧" in t or "策略" in t or "通法" in t:
        return "方法精进"
    if "模拟" in t or "背景" in t or "命题" in t or "情境" in t:
        return "模拟背景"
    return "解题研究"  # 默认


# ── 适配器：每个目标站点一个 fetch_*，返回 journal_articles 行 dict 列表 ──────────
# 行字段：title, authors(list), journal_name, issue, abstract, source_url, published_on, tags(list), source_key(唯一)

def fetch_cqvip(journal_id: str = "67481") -> List[Dict]:
    """维普期刊目录适配器（数学通报 67481 / 中学数学教学参考 82443B / 数学教学通讯 880587）。
    ⚠️ 实测维普对自动化访问返回 412（反爬），patchright 渲染也被挡 → 当前无法稳定抓取。
    保留接口；若后续拿到可用入口（如官方 RSS / 开放 API / 授权），在此填充解析逻辑。
    """
    print(f"[!] fetch_cqvip({journal_id})：维普反爬(412)，暂无法自动抓取 —— 见文件顶部说明。")
    return []


ADAPTERS = {
    "cqvip": fetch_cqvip,  # 维普期刊目录（当前被反爬挡）
}


def demo_rows() -> List[Dict]:
    """示例占位条目（标注「示例」，链向真实期刊主页）：覆盖全部 5 个主题，供先看通 期刊 视图 + 二级筛选。
    真爬接好后删除/覆盖即可。tags 首位为 classify_topic 主题，前端按它做二级筛选。"""
    seeds = [
        ("（示例）一道高考导数压轴题的多种解法探究", "数学通报", "demo-1"),
        ("（示例）圆锥曲线专题突破：焦点弦性质综述", "中学数学教学参考", "demo-2"),
        ("（示例）数列求和的通性通法与技巧精讲", "数学教学通讯", "demo-3"),
        ("（示例）新高考情境化命题背景与模拟趋势分析", "数学通报", "demo-4"),
        ("（示例）立体几何中的解题研究与思路剖析", "中学数学研究", "demo-5"),
    ]
    rows = []
    for title, journal, key in seeds:
        topic = classify_topic(title, journal)
        rows.append({
            "title": title,
            "authors": ["示例作者"],
            "journal_name": journal,
            "issue": "示例 · 占位",
            "abstract": "用于演示「期刊」视图与主题筛选的占位条目；接入真实来源后会被覆盖。点击可前往期刊官方页面。",
            "source_url": "https://math.bnu.edu.cn/xgjg/sxtbjs/index.htm",
            "published_on": None,
            "tags": [topic, "示例"],
            "source_key": f"demo:{key}",
        })
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--demo", action="store_true", help="灌入示例占位条目（看通 UI）")
    ap.add_argument("--source", choices=list(ADAPTERS), help="运行某个已实现的真适配器")
    ap.add_argument("--dry-run", action="store_true", help="只打印不写库")
    args = ap.parse_args()

    rows: List[Dict] = []
    if args.demo:
        rows += demo_rows()
    if args.source:
        rows += ADAPTERS[args.source]()

    if not rows:
        print("[*] 无数据（用 --demo 看占位，或为 --source 适配器补选择器）")
        return

    if args.dry_run:
        for r in rows:
            print(f"  - {r['journal_name']} | {r['title']} -> {r['source_url']}")
        print(f"[DRY] 共 {len(rows)} 条，未写库")
        return

    n = upsert_articles(rows)
    print(f"[+] upsert {n} 条期刊元数据")


if __name__ == "__main__":
    main()
