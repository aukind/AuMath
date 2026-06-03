"""NuminaMath → 资源大厅·竞赛 批量导入。

开放数据集 AI-MO/NuminaMath-CoT（~86 万题，含大量竞赛题）映射到 papers/questions
(track='competition')，复用题库引擎逐题渲染。按 source 分组成若干「合集」试卷。

用法（先 dry-run 看样例，再真入库）：
  cd math-cv-service && source .venv/bin/activate
  set -a; source ../.env.local; set +a            # 取 SUPABASE_SERVICE_ROLE_KEY 等
  pip install datasets                              # 一次性依赖
  python scripts/crawler/numina_import.py --dry-run --limit 20
  python scripts/crawler/numina_import.py --limit 200

依赖迁移 024（papers.track/region/contest）。幂等：同名合集卷会先删后插（去重）。
环境变量 HF_PROXY/HTTPS_PROXY 控制 Hugging Face 下载走代理（CN 需要）。
"""

import argparse
import os
import re
import sys
from typing import Dict, List, Optional

from supabase import create_client, Client

# numina `source` 取值 → (合集试卷名, region)。只导竞赛相关的 source。
SOURCE_GROUPS: Dict[str, tuple] = {
    "amc_aime":   ("NuminaMath · 美国竞赛 (AMC/AIME)", "international"),
    "olympiads":  ("NuminaMath · 国际奥林匹克",         "international"),
    "aops_forum": ("NuminaMath · AoPS 论坛精选",        "international"),
}


def extract_boxed(text: str) -> str:
    """从解答里抽最后一个 \\boxed{...}（平衡括号）作为答案；没有则空串。"""
    if not text:
        return ""
    key = r"\boxed"
    idx = text.rfind(key)
    if idx < 0:
        return ""
    i = idx + len(key)
    while i < len(text) and text[i] != "{":
        i += 1
    if i >= len(text):
        return ""
    depth = 0
    out = []
    for ch in text[i:]:
        if ch == "{":
            depth += 1
            if depth == 1:
                continue
        elif ch == "}":
            depth -= 1
            if depth == 0:
                break
        out.append(ch)
    return "".join(out).strip()


class CompetitionUploader:
    def __init__(self):
        url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        if not url or not key:
            raise ValueError("未找到 Supabase 环境变量（NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY）")
        self.client: Client = create_client(url, key)

    def _dedup(self, title: str) -> None:
        existing = (self.client.table("papers").select("id")
                    .eq("title", title).eq("track", "competition").execute().data) or []
        for old in existing:
            pq = (self.client.table("paper_questions").select("question_id")
                  .eq("paper_id", old["id"]).execute().data) or []
            qids = [r["question_id"] for r in pq]
            if qids:
                self.client.table("questions").delete().in_("id", qids).execute()
            self.client.table("papers").delete().eq("id", old["id"]).execute()
        if existing:
            print(f"  [去重] 清理 {len(existing)} 份同名旧合集卷")

    def upload_group(self, title: str, region: str, problems: List[dict]) -> None:
        print(f"[*] 入库合集: {title}（{len(problems)} 题, region={region}）")
        self._dedup(title)
        paper = (self.client.table("papers").insert({
            "title": title, "year": None, "type": "real", "grade": None,
            "track": "competition", "region": region, "contest": title,
        }).execute().data[0])
        paper_id = paper["id"]
        try:
            rows = []
            for i, p in enumerate(problems):
                rows.append({
                    "content": p["problem"],
                    "answer": extract_boxed(p.get("solution", "")),
                    "analysis": p.get("solution", "") or "",
                    "question_type": "calculation",
                    "difficulty": 3,
                    "year": None,
                    "source": title,
                    "status": "published",
                    "metadata": {"origin": "NuminaMath", "numina_source": p.get("source"), "seq": i + 1},
                })
            # 分批插入（避免单次过大）
            inserted = []
            for b in range(0, len(rows), 200):
                chunk = rows[b:b + 200]
                inserted += self.client.table("questions").insert(chunk).execute().data or []
            if len(inserted) != len(rows):
                raise RuntimeError(f"题目数不符：期望 {len(rows)} 实得 {len(inserted)}")
            pq = [{"paper_id": paper_id, "question_id": inserted[i]["id"], "question_number": i + 1}
                  for i in range(len(inserted))]
            for b in range(0, len(pq), 500):
                self.client.table("paper_questions").insert(pq[b:b + 500]).execute()
            print(f"  [+] 成功录入 {len(inserted)} 题，paper_id={paper_id}")
        except Exception as e:
            try:
                self.client.table("papers").delete().eq("id", paper_id).execute()
            except Exception:
                pass
            print(f"  [!] 入库失败（已回滚该合集）: {e}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=100, help="每个 source 合集最多导入题数")
    ap.add_argument("--sources", default=",".join(SOURCE_GROUPS),
                    help="逗号分隔的 numina source（默认全部竞赛类）")
    ap.add_argument("--dry-run", action="store_true", help="只预览不入库")
    args = ap.parse_args()

    wanted = [s.strip() for s in args.sources.split(",") if s.strip() in SOURCE_GROUPS]
    if not wanted:
        print(f"[!] --sources 无有效值，可选：{list(SOURCE_GROUPS)}")
        sys.exit(1)

    try:
        from datasets import load_dataset
    except ImportError:
        print("[!] 需要先安装：pip install datasets")
        sys.exit(1)

    print(f"[*] 流式拉取 NuminaMath-CoT，目标 source={wanted}，每组上限 {args.limit} …")
    ds = load_dataset("AI-MO/NuminaMath-CoT", split="train", streaming=True)

    buckets: Dict[str, List[dict]] = {s: [] for s in wanted}
    remaining = set(wanted)
    for row in ds:
        src = row.get("source")
        if src in remaining and len(buckets[src]) < args.limit:
            if row.get("problem"):
                buckets[src].append(row)
            if len(buckets[src]) >= args.limit:
                remaining.discard(src)
        if not remaining:
            break

    uploader = None if args.dry_run else CompetitionUploader()
    for src in wanted:
        title, region = SOURCE_GROUPS[src]
        probs = buckets[src]
        if not probs:
            print(f"[*] {src}: 0 题，跳过")
            continue
        if args.dry_run:
            sample = probs[0]
            print(f"\n[DRY] {title}: {len(probs)} 题。样例：")
            print("  problem:", (sample.get('problem') or '')[:140].replace("\n", " "))
            print("  answer(\\boxed):", extract_boxed(sample.get('solution', '')) or "∅")
        else:
            uploader.upload_group(title, region, probs)

    print("\n=== 完成 ===")


if __name__ == "__main__":
    main()
