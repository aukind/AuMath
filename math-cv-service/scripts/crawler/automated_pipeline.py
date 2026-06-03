import argparse
import asyncio
import base64
import os
import re
import sys
from typing import Dict, List, Optional
from urllib.parse import quote

from bs4 import BeautifulSoup
from pydantic import BaseModel, Field
# 用 patchright（playwright 的隐身补丁版）才能过 AoPS 的 Cloudflare Turnstile：
# 普通 playwright 会被 Turnstile 通过 CDP 指纹识别，验证框永远转圈不放行。
# patchright 提供完全一致的 API，是 drop-in 替换。
from patchright.async_api import async_playwright
from supabase import create_client, Client
import httpx

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import ChatPromptTemplate

# ==========================================
# 0. 全局配置
# ==========================================
WIKI_BASE = "https://artofproblemsolving.com/wiki"
# Cloudflare/反爬挑战页特征词，命中即视为「没真正拿到内容」。
_CHALLENGE_MARKERS = (
    "attention required",
    "just a moment",
    "cf-browser-verification",
    "checking your browser",
    "enable javascript and cookies",
)


def looks_like_challenge(text: Optional[str]) -> bool:
    if not text:
        return False
    low = text.lower()
    return any(m in low for m in _CHALLENGE_MARKERS)


def parse_year(*candidates: str) -> Optional[int]:
    """从 '2023 AMC 12A' / '2023_AMC_12A_Problems' 里抠出年份。"""
    for c in candidates:
        m = re.search(r"(?:19|20)\d{2}", c or "")
        if m:
            return int(m.group(0))
    return None


# LLM 经 JSON 结构化输出时，LaTeX 命令的首字母转义会被「吃成控制字符」：
#   \frac   → <FF>rac     (\f)      \textbf → <TAB>extbf (\t)
#   \binom  → <BS>inom    (\b)      \right  → <CR>ight   (\r)   \vec → <VT>ec (\v)
#   而宽间距命令 \qquad/\quad 则被吃成「孤立的控制字符」(常见为单个 <TAB>)。
# 这些控制字符在数学文本里绝不应合法出现。还原规则：
#   控制字符后紧跟字母 → 是被吃掉首字母的命令 → 补回反斜杠+该首字母；
#   控制字符后非字母    → 是被吃掉的间距命令     → 用普通空格代替（KaTeX 里裸 \t 非法）。
_CTRL_LETTER = {
    "\x08": "b",   # \binom \beta \boxed
    "\x0c": "f",   # \frac \forall
    "\x09": "t",   # \textbf \theta \times \tan \to \triangle
    "\x0b": "v",   # \vec \vdots
    "\x07": "a",   # \alpha（罕见）
    "\r": "r",     # \right \rho \rangle \rightarrow
}
# \n 命令（\neq \nabla \notin \ngeq …）会被吃成真实换行。只在「换行紧跟这些命令残字、且其后非字母」时补回，
# 避免误伤正常段落换行；单字母残字（如 \nu→u、\ne→e）误伤风险高，故不处理。
_N_CMD_SUFFIXES = ("abla", "otin", "subseteq", "supseteq", "geq", "leq", "eq", "mid", "parallel")


def repair_latex_escapes(s: str) -> str:
    """修复 LLM JSON 输出对 LaTeX 转义的破坏（控制字符 → 反斜杠命令 / 空格）。"""
    if not s:
        return s
    if any(ch in s for ch in _CTRL_LETTER):
        out = []
        n = len(s)
        for i, c in enumerate(s):
            if c in _CTRL_LETTER:
                nxt = s[i + 1] if i + 1 < n else ""
                out.append("\\" + _CTRL_LETTER[c] if nxt.isalpha() else " ")
            else:
                out.append(c)
        s = "".join(out)
    # 还原被吃成换行的 \n 命令：仅当换行后紧跟已知命令残字（再接非字母边界）时
    s = re.sub(
        r"\n(?=(?:" + "|".join(sorted(_N_CMD_SUFFIXES, key=len, reverse=True)) + r")(?![a-zA-Z]))",
        r"\\n",
        s,
    )
    return s


def clean_html_preserve_math(raw_html: str, base_url: str = "https://artofproblemsolving.com") -> str:
    """AoPS 把公式渲染成 <img class="latex" alt="$...$">；普通 get_text() 会把它们全丢掉。
    这里在抽纯文本前：公式图 → 还原成 alt 里的真实 LaTeX；几何配图 → 保留绝对 URL（markdown 图）。
    """
    soup = BeautifulSoup(raw_html, "html.parser")
    for element in soup(["script", "style", "nav", "footer", "iframe"]):
        element.decompose()

    for img in soup.find_all("img"):
        cls = " ".join(img.get("class") or [])
        alt = (img.get("alt") or "").strip()
        src = img.get("src") or ""
        if src.startswith("//"):
            src = "https:" + src
        elif src.startswith("/"):
            src = base_url.rstrip("/") + src

        is_latex = ("latex" in cls) or (alt.startswith("$") and alt.endswith("$"))
        if is_latex:
            # 公式：保留 alt（真实 LaTeX 源），丢掉无意义的 png 链接
            img.replace_with(soup.new_string(f" {alt} " if alt else " "))
        else:
            # 几何配图：保留绝对 URL，让 LLM 收进 image_urls
            img.replace_with(soup.new_string(f" ![figure]({src}) " if src else " "))

    return soup.get_text(separator="\n", strip=True)


# ==========================================
# 1. 定义数据结构 (Pydantic Models)
# ==========================================

class MathQuestion(BaseModel):
    question_number: int = Field(description="题目在原卷中的序号（整数），例如 'Problem 15' → 15")
    title: str = Field(description="题目的简短标题，例如 '2023 AMC 12A Problem 15'")
    content_latex: str = Field(description="题目正文，包含标准的 LaTeX 公式，使用 $ 和 $$ 包裹")
    solution_latex: str = Field(default="", description="题目的详细解析（若原文没有解析则留空），标准 LaTeX 格式")
    answer: str = Field(default="", description="正确答案（如 AMC 的 A-E 单个字母）；不确定就留空，稍后由答案页合并")
    difficulty: int = Field(description="难度评级，1到5之间", ge=1, le=5)
    topics: List[str] = Field(default=[], description="知识点标签列表，例如 ['Number Theory', 'Combinatorics']")
    has_image: bool = Field(default=False, description="题目中是否包含必须提取的图片/几何图形")
    image_urls: List[str] = Field(default=[], description="题目相关图片的绝对 URL 列表（来自正文里的 ![figure](url)）")


class MathPaper(BaseModel):
    paper_title: str = Field(description="试卷名称，例如 '2023 AMC 12A'")
    questions: List[MathQuestion] = Field(description="试卷包含的题目列表")


class AnswerEntry(BaseModel):
    number: int = Field(description="题号（整数）")
    answer: str = Field(description="该题正确答案，AMC 为单个大写字母 A-E")


class AnswerKey(BaseModel):
    answers: List[AnswerEntry] = Field(description="全部题目的答案列表")


# ==========================================
# 2. 爬虫核心引擎 (patchright)
#    用「持久化上下文 + 本机真实 Chrome」过 Cloudflare Turnstile：
#    - launch_persistent_context 复用同一用户目录，cf_clearance cookie 可跨次留存；
#    - 一次放行后，后续 MediaWiki API / 图片下载全部复用同一上下文的 cookie；
#    - 注意：patchright 不要再手动 add_init_script / 改 UA，那些反而会被识别（保持默认最隐身）。
# ==========================================

class DynamicScraper:
    def __init__(
        self,
        headless: bool = True,
        proxy: Optional[str] = None,
        user_data_dir: str = "/tmp/aops-cf-profile",
    ):
        self.headless = headless
        self.proxy = proxy
        self.user_data_dir = user_data_dir
        self._pw = None
        self.context = None

    async def __aenter__(self):
        self._pw = await async_playwright().start()
        kw = dict(
            user_data_dir=self.user_data_dir,
            channel="chrome",      # 本机真实 Chrome，指纹最干净
            headless=self.headless,
            no_viewport=True,
        )
        if self.proxy:
            kw["proxy"] = {"server": self.proxy}
        try:
            self.context = await self._pw.chromium.launch_persistent_context(**kw)
        except Exception:
            # 没装 Chrome → 退回 bundled chromium（隐身性略差，但流程不中断）
            kw.pop("channel", None)
            self.context = await self._pw.chromium.launch_persistent_context(**kw)
        return self

    async def __aexit__(self, *exc):
        try:
            if self.context:
                await self.context.close()
        finally:
            if self._pw:
                await self._pw.stop()

    async def warmup(self, url: str) -> None:
        """先用真实浏览器导航一次，拿到 Cloudflare 放行 cookie（cf_clearance）。
        命中挑战页 → 显式抛错，绝不把垃圾喂给 LLM（这正是之前静默失败的根因）。
        """
        print(f"[*] 预热浏览器并穿透 Cloudflare: {url}")
        # 复用持久化上下文已有的首个页面（别再开新标签——新标签 + 旧锁易触发 TargetClosed）。
        page = self.context.pages[0] if self.context.pages else await self.context.new_page()
        await page.goto(url, wait_until="domcontentloaded", timeout=60000)
        # CF 软挑战(Just a moment)会自行放行；可见浏览器下也可人工点验证。轮询最多 ~60s 等正文。
        for _ in range(24):
            try:
                if await page.query_selector(".mw-parser-output"):
                    print("[*] Cloudflare 已放行，拿到正文。")
                    return
            except Exception:
                pass
            await page.wait_for_timeout(2500)
        # 轮询没等到 .mw-parser-output：只要标题不是挑战页（说明已放行、只是选择器抖动/异名容器），
        # 就放行交给 fetch_content（它主要走 MediaWiki API，不依赖这个页面 DOM）。仅标题命中挑战词才硬失败。
        title = await page.title()
        if not looks_like_challenge(title):
            print(f"[*] 未命中 .mw-parser-output 但标题正常（{title!r}），按已放行继续。")
            return
        try:
            await page.screenshot(path="/tmp/aops_challenge.png", full_page=True)
        except Exception:
            pass
        raise RuntimeError(
            f"被 Cloudflare 拦在挑战页（标题: {title!r}，截图: /tmp/aops_challenge.png）。"
            "可尝试：CRAWLER_HEADLESS=0 用可见浏览器手动过一次验证码 / 更换出口 IP（换节点）/ "
            "确认本机已安装 Chrome。"
        )

    async def fetch_content(self, page_title: str, fallback_url: str) -> str:
        """多级取数（全部复用已放行的浏览器上下文）：
        1) MediaWiki API parse&prop=text → 渲染 HTML（alt 含真实 LaTeX + 配图 URL，信息最全）
        2) action=raw → 原始 wikitext（干净 LaTeX，但无渲染图 URL）
        3) 浏览器渲染页 + clean_html_preserve_math（最终兜底）
        """
        # 页名 URL 编码（含括号等特殊字符的页如 "2024_CMO(CHINA)" 否则会破坏 API 调用 → 误走兜底）
        pt = quote(page_title, safe="")
        # 1) API：渲染后的 HTML
        api = f"{WIKI_BASE}/api.php?action=parse&page={pt}&prop=text&format=json"
        try:
            resp = await self.context.request.get(api, timeout=60000)
            if resp.ok:
                data = await resp.json()
                html = (((data or {}).get("parse") or {}).get("text") or {}).get("*")
                if html and not looks_like_challenge(html):
                    text = clean_html_preserve_math(html)
                    if text.strip():
                        return text
        except Exception as e:
            print(f"[*] API parse 失败，转兜底: {e}")

        # 2) action=raw wikitext
        try:
            raw_url = f"{WIKI_BASE}/index.php?title={pt}&action=raw"
            resp = await self.context.request.get(raw_url, timeout=60000)
            if resp.ok:
                txt = await resp.text()
                if txt and not looks_like_challenge(txt):
                    return txt
        except Exception as e:
            print(f"[*] action=raw 失败，转兜底: {e}")

        # 3) 渲染页
        return await self._fetch_rendered_text(fallback_url)

    async def _fetch_rendered_text(self, url: str) -> str:
        page = await self.context.new_page()
        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=60000)
            try:
                await page.wait_for_selector(".mw-parser-output", timeout=20000)
            except Exception:
                await page.wait_for_timeout(2000)
            # 只取正文 .mw-parser-output 的 HTML，剔除 AoPS 站点导航/页脚 chrome（否则污染 LLM 输入）
            body_html = await page.eval_on_selector(
                ".mw-parser-output", "el => el ? el.outerHTML : ''"
            ) if await page.query_selector(".mw-parser-output") else ""
            html = body_html or await page.content()
            if looks_like_challenge(html):
                return ""
            return clean_html_preserve_math(html)
        finally:
            await page.close()

    async def fetch_image(self, url: str) -> Optional[bytes]:
        """图片也走浏览器上下文下载，复用 Cloudflare cookie。"""
        try:
            resp = await self.context.request.get(url, timeout=45000)
            if resp.ok:
                return await resp.body()
        except Exception as e:
            print(f"  [图] 下载失败 {url}: {e}")
        return None


# ==========================================
# 3. AI 清洗与提取引擎 (LangChain)
# ==========================================

class AIExtractor:
    def __init__(self):
        # 让发给 Gemini 的请求走代理（CN 网络需要）。LLM_PROXY=none 可关闭。
        raw_proxy = os.environ.get("LLM_PROXY", "http://127.0.0.1:7897")
        if raw_proxy and raw_proxy.lower() != "none":
            os.environ["HTTP_PROXY"] = raw_proxy
            os.environ["HTTPS_PROXY"] = raw_proxy
            # 入库(Supabase) 和本地 CV 服务不走代理
            os.environ["NO_PROXY"] = "localhost,127.0.0.1,.supabase.co"

        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("未找到 GEMINI_API_KEY 环境变量！")

        self.llm = ChatGoogleGenerativeAI(
            model="gemini-2.5-flash",
            temperature=0.1,
            google_api_key=api_key,
            timeout=120,
            max_retries=3,
        )
        self.paper_llm = self.llm.with_structured_output(MathPaper)
        self.answer_llm = self.llm.with_structured_output(AnswerKey)

        self.paper_prompt = ChatPromptTemplate.from_messages([
            ("system", """你是一个世界顶级的数学竞赛解析专家。
我会给你一段从数学竞赛 wiki 提取的内容。它可能是清洗后的纯文本（公式已是 $...$ 形式），
也可能是 MediaWiki 原始 wikitext（公式在 <math>...</math> 与 <cmath>...</cmath> 里，几何图在 <asy>...</asy> 里）。
你的任务：
1. 识别出里面每一道数学题目及其解答（若无解答则 solution_latex 留空）。
2. 把所有数学标签规范化为标准 LaTeX：行内用 $...$，行间用 $$...$$；<math> → $...$，<cmath> → $$...$$。
3. question_number 取题号整数（如 'Problem 15' → 15）。
4. 分析难度 (1-5) 并打英文知识点标签。
5. 若正文里出现 ![figure](URL) 形式的图片或 <asy> 几何图，把 has_image 设为 true；
   并把所有 ![figure](URL) 里的绝对 URL 收进 image_urls。
6. 严格按 JSON Schema 输出。"""),
            ("human", "这是抓取到的内容：\n\n{content}")
        ])

        self.answer_prompt = ChatPromptTemplate.from_messages([
            ("system", "下面是一份数学竞赛的答案页。提取每道题的题号(number, 整数)与正确答案(answer, AMC 为单个大写字母 A-E)。"),
            ("human", "{content}")
        ])

    async def extract_math_paper(self, content: str) -> Optional[MathPaper]:
        print("[*] 正在调用 LLM 进行深度结构化清洗...")
        try:
            chain = self.paper_prompt | self.paper_llm
            paper: MathPaper = await chain.ainvoke({"content": content[:50000]})
            # 关键：修复 LLM JSON 输出对 LaTeX 反斜杠转义的破坏（\frac→<FF>rac 等）
            for q in paper.questions:
                q.content_latex = repair_latex_escapes(q.content_latex)
                q.solution_latex = repair_latex_escapes(q.solution_latex)
            return paper
        except Exception as e:
            print(f"[!] AI 解析失败: {e}")
            return None

    async def extract_answer_key(self, content: str) -> Dict[int, str]:
        if not content.strip():
            return {}
        print("[*] 正在解析答案页...")
        try:
            chain = self.answer_prompt | self.answer_llm
            res: AnswerKey = await chain.ainvoke({"content": content[:10000]})
            return {e.number: e.answer.strip() for e in res.answers if e.answer}
        except Exception as e:
            print(f"[!] 答案页解析失败（忽略，answer 留空）: {e}")
            return {}


# ==========================================
# 4. CV 服务客户端 (图片 → 矢量图)
#    修正点：正确路径是 /pipeline-a/process；请求体是 JSON {image_base64, mime_type}；
#    可选 X-CV-Token；只有 svg/inline_svg 才能被 MathRenderer 直接渲染（裸 tikz 不行）。
# ==========================================

class CVServiceClient:
    def __init__(self, base_url: str = "http://localhost:8000"):
        self.base_url = base_url.rstrip("/")
        self.token = os.environ.get("CV_SERVICE_TOKEN")

    async def image_to_svg(self, image_bytes: bytes, mime: str = "image/png") -> Optional[str]:
        """返回可内联渲染的 SVG（优先 svg / inline_svg）。
        当前 Pipeline A 为 Mock，只回 tikz（不可直接渲染）→ 返回 None，由调用方兜底用原图。
        """
        b64 = base64.b64encode(image_bytes).decode()
        headers = {"Content-Type": "application/json"}
        if self.token:
            headers["X-CV-Token"] = self.token
        payload = {"image_base64": b64, "mime_type": mime}
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(f"{self.base_url}/pipeline-a/process", json=payload, headers=headers)
                if resp.status_code != 200:
                    print(f"  [CV] 服务返回 {resp.status_code}: {resp.text[:200]}")
                    return None
                data = resp.json()
                return data.get("svg") or data.get("inline_svg") or None
        except Exception as e:
            print(f"  [CV] 调用异常（CV 服务未启动？）: {e}")
            return None


async def build_content_with_figures(
    scraper: DynamicScraper, cv: CVServiceClient, q: MathQuestion
) -> str:
    """把题目配图内联进正文：优先 CV 矢量化的 SVG；拿不到 SVG 则兜底内联原图 markdown。"""
    content = q.content_latex
    if not (q.has_image and q.image_urls):
        return content

    figures: List[str] = []
    for url in q.image_urls:
        img_bytes = await scraper.fetch_image(url)
        svg = await cv.image_to_svg(img_bytes) if img_bytes else None
        if svg:
            figures.append(svg)               # 内联 SVG，MathRenderer 白名单可渲染
        elif url:
            figures.append(f"![figure]({url})")  # 兜底：内联原图
    if figures:
        content = content + "\n\n" + "\n\n".join(figures)
    return content


# ==========================================
# 5. Supabase 入库引擎
#    严格对齐生产 app/actions/process-paper.ts：
#    papers(title,year,type,grade) + questions(content,answer,analysis,...) + paper_questions 关联表。
# ==========================================

class SupabaseUploader:
    def __init__(self):
        url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        if not url or not key:
            raise ValueError("未找到 Supabase 环境变量，入库失败！")
        self.client: Client = create_client(url, key)

    def upload(self, paper: MathPaper, year: Optional[int], contents: List[str],
               region: str = "international", contest: Optional[str] = None) -> None:
        # 标题清洗：去掉 AoPS 的 " Problems" 后缀；contest 显式优先，否则由标题去年份前缀得到（如 "AMC 12A"）
        title = re.sub(r"\s*Problems\s*$", "", paper.paper_title).strip()
        contest = contest or re.sub(r"^\s*(?:19|20)\d{2}\s*", "", title).strip() or title
        print(f"[*] 准备入库竞赛卷: {title}（contest={contest}, region={region}）")

        # 去重（幂等）：删除同名旧竞赛卷及其题目，再插入 —— 重复爬取不会产生重复卷
        try:
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
                print(f"[*] 去重：已清理 {len(existing)} 份同名旧竞赛卷")
        except Exception as e:
            print(f"[!] 去重检查失败（忽略，继续）: {e}")

        # 1) 试卷：track='competition' 归入资源大厅·竞赛（需迁移 024）；region 国内/国外；contest 赛事名
        paper_res = (
            self.client.table("papers")
            .insert({"title": title, "year": year, "type": "real", "grade": None,
                     "track": "competition", "region": region, "contest": contest})
            .execute()
        )
        paper_id = paper_res.data[0]["id"]

        try:
            # 2) 题目：批量插入。注意列名是 analysis（不是 solution）；answer 为 NOT NULL；无 paper_id/is_public 列
            rows = []
            for i, q in enumerate(paper.questions):
                metadata: Dict[str, object] = {"exam_number": f"Problem {q.question_number}"}
                if q.topics:
                    metadata["tags"] = q.topics
                rows.append({
                    "content": contents[i],
                    "answer": q.answer or "",
                    "analysis": q.solution_latex or "",
                    "question_type": "multiple_choice",  # AMC 为选择题
                    "difficulty": q.difficulty,
                    "year": year,
                    "source": title,
                    "status": "published",
                    "metadata": metadata,
                })
            q_res = self.client.table("questions").insert(rows).execute()
            inserted = q_res.data or []
            if len(inserted) != len(rows):
                raise RuntimeError(f"题目入库返回 id 数量不符：期望 {len(rows)}，实得 {len(inserted)}")

            # 3) 关联：questions 没有 paper_id，靠 paper_questions 关联表
            pq_rows = [
                {
                    "paper_id": paper_id,
                    "question_id": inserted[i]["id"],
                    "question_number": paper.questions[i].question_number or (i + 1),
                }
                for i in range(len(inserted))
            ]
            self.client.table("paper_questions").insert(pq_rows).execute()
            print(f"[+] 成功录入 {len(inserted)} 道题目！paper_id={paper_id}")
        except Exception as e:
            # best-effort 回滚孤儿试卷行
            try:
                self.client.table("papers").delete().eq("id", paper_id).execute()
            except Exception:
                pass
            print(f"[!] 入库失败（已回滚试卷）: {e}")


# ==========================================
# 6. 主流程调度器
# ==========================================

async def run_pipeline(
    page_title: str,
    *,
    answer_title: Optional[str] = None,
    contest: Optional[str] = None,
    region: str = "international",
    year: Optional[int] = None,
    dry_run: bool = False,
    ai: Optional["AIExtractor"] = None,
    cv: Optional["CVServiceClient"] = None,
    uploader: Optional["SupabaseUploader"] = None,
) -> dict:
    """抓取单个 AoPS 页面 → 结构化 → （可选合并答案页）→ 入库竞赛卷。
    可被 cn_contests.py 循环调用（传入共享的 ai/cv/uploader 复用，省去重复初始化）。
    返回 {success, questions}。"""
    target_url = f"{WIKI_BASE}/index.php/{page_title}"
    answer_url = f"{WIKI_BASE}/index.php/{answer_title}" if answer_title else None

    raw_proxy = os.environ.get("CRAWLER_PROXY", "http://127.0.0.1:7897")
    browser_proxy = raw_proxy if raw_proxy and raw_proxy.lower() != "none" else None
    headless = os.environ.get("CRAWLER_HEADLESS", "1").lower() not in ("0", "false", "no")
    profile_dir = os.environ.get("CRAWLER_PROFILE_DIR", "/tmp/aops-cf-profile")

    ai = ai or AIExtractor()
    cv = cv or CVServiceClient(base_url="http://localhost:8000")
    if uploader is None and not dry_run:
        uploader = SupabaseUploader()

    paper: Optional[MathPaper] = None
    contents: List[str] = []

    async with DynamicScraper(headless=headless, proxy=browser_proxy, user_data_dir=profile_dir) as scraper:
        await scraper.warmup(target_url)

        content = await scraper.fetch_content(page_title, target_url)
        if not content.strip():
            print(f"[!] {page_title} 取数失败：空内容或被 Cloudflare 拦截。")
            return {"success": False, "questions": 0}
        with open("/tmp/aops_dump.txt", "w", encoding="utf-8") as f:
            f.write(content)

        paper = await ai.extract_math_paper(content)
        if not paper or not paper.questions:
            print(f"[!] {page_title} 未解析出题目（检查 /tmp/aops_dump.txt）。")
            return {"success": False, "questions": 0}
        paper.questions.sort(key=lambda q: q.question_number or 0)
        print(f"\n[AI 提取] {paper.paper_title} → {len(paper.questions)} 题（样例：{paper.questions[0].title}）")

        if answer_url:
            ak_content = await scraper.fetch_content(answer_title, answer_url)
            answer_map = await ai.extract_answer_key(ak_content)
            for q in paper.questions:
                if not q.answer:
                    q.answer = answer_map.get(q.question_number, "")
            have = sum(1 for q in paper.questions if q.answer)
            print(f"[*] 答案合并：{have}/{len(paper.questions)} 题已有答案")

        for q in paper.questions:
            contents.append(await build_content_with_figures(scraper, cv, q))

    year = year or parse_year(paper.paper_title, page_title)
    if dry_run:
        with open("/tmp/aops_questions.txt", "w", encoding="utf-8") as f:
            for i, q in enumerate(paper.questions):
                f.write(f"\n===== Problem {q.question_number} | answer={q.answer or '∅'} | "
                        f"difficulty={q.difficulty} | topics={q.topics} =====\n")
                f.write(contents[i] + "\n")
                if q.solution_latex:
                    f.write(f"--- analysis ---\n{q.solution_latex}\n")
        print(f"[DRY-RUN] 不入库（{contest or '?'}/{region}, year={year}）。落盘 /tmp/aops_questions.txt。前 3 题：")
        for i, q in enumerate(paper.questions[:3]):
            head = contents[i][:100].replace("\n", " ")
            print(f"  #{q.question_number} answer={q.answer or '∅'} | {head}…")
    else:
        uploader.upload(paper, year, contents, region=region, contest=contest)

    return {"success": True, "questions": len(paper.questions)}


async def main():
    ap = argparse.ArgumentParser(description="AoPS wiki 单卷爬取入库（竞赛）")
    ap.add_argument("--page", default="2023_AMC_12A_Problems", help="AoPS 页名（下划线连接）")
    ap.add_argument("--answer-page", default=None, help="答案页名（可选；AMC 默认配 _Answer_Key）")
    ap.add_argument("--contest", default=None, help="赛事名，如 'CMO' / 'China TST' / '全国高中数学联赛'")
    ap.add_argument("--region", default="international", choices=["domestic", "international"])
    ap.add_argument("--year", type=int, default=None)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    answer_page = args.answer_page
    if answer_page is None and args.page == "2023_AMC_12A_Problems":
        answer_page = "2023_AMC_12A_Answer_Key"

    print("=== AuMath 自动化知识引擎启动 ===" + ("（DRY-RUN：不入库）" if args.dry_run else ""))
    await run_pipeline(
        args.page, answer_title=answer_page, contest=args.contest,
        region=args.region, year=args.year, dry_run=args.dry_run,
    )
    print("\n=== 任务完成 ===")


if __name__ == "__main__":
    asyncio.run(main())
