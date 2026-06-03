//! Rust → WASM LaTeX 规范化器。
//!
//! 与 TS 版 `lib/normalizeLatex.ts` **全量对齐**：解析成最小 AST → 变换 → 序列化。
//!
//! | pass                     | 状态 |
//! |--------------------------|:----:|
//! | 同义词归一 \le→\leq 等   |  ✅  |
//! | 间距宏剥离 \, \quad …    |  ✅  |
//! | 空白折叠                 |  ✅  |
//! | 冗余括号扁平 {{x}}→{x}   |  ✅  |
//! | 上下标重排 x^{a}_{b}     |  ✅  |
//! | \over → \frac            |  ✅  |
//! | 未括上下标/frac参数补括  |  ✅  |（`x^2`→`x^{2}`，`\frac 1 2`→`\frac{1}{2}`）
//!
//! 关键 parse 行为对齐 unified-latex：闭合 `}` 之后的空白在数学模式被丢弃
//! （`}{a} + b` → `}{a}+ b`），由解析器在消费 `}` 后顺手吃掉尾随空白实现。

use wasm_bindgen::prelude::*;

// ─── 常量表（与 TS 版同源）────────────────────────────────────────────────

const SPACING_SYMBOLS: &[char] = &[',', '!', ';', ':', ' '];

fn is_spacing_macro(name: &str) -> bool {
    matches!(
        name,
        "quad" | "qquad" | "thinspace" | "negthinspace" | "thickspace"
            | "enspace" | "medskip" | "bigskip" | "smallskip"
    )
}

fn synonym(name: &str) -> Option<&'static str> {
    Some(match name {
        "le" => "leq",
        "ge" => "geq",
        "ne" => "neq",
        "to" => "rightarrow",
        "gets" => "leftarrow",
        "iff" => "Leftrightarrow",
        "implies" => "Rightarrow",
        "land" => "wedge",
        "lor" => "vee",
        "lnot" => "neg",
        "owns" => "ni",
        _ => return None,
    })
}

/// 已知二元宏：参数需补花括号（`\frac 1 2` → `\frac{1}{2}`）。
fn macro_arity(name: &str) -> usize {
    match name {
        "frac" | "dfrac" | "tfrac" | "binom" => 2,
        _ => 0,
    }
}

// ─── AST ──────────────────────────────────────────────────────────────────

#[derive(Clone, PartialEq, Debug)]
enum Node {
    /// 普通字符运行段（非空白、非 `{}` `\` `^` `_`）。
    Str(String),
    /// 一段空白（解析时已合并连续空白）。
    Space,
    /// `{ ... }`
    Group(Vec<Node>),
    /// `\name` 或 `\name{..}{..}`（仅已知 arity 的宏带参）。
    Macro { name: String, args: Vec<Vec<Node>> },
    /// `\` + 非字母控制符（`\,` `\;` `\\` `\{` …）。
    Ctrl(char),
    /// `^{..}` / `_{..}`；operand 恒为 `Group`，保证序列化必带花括号。
    Script { sup: bool, operand: Box<Node> },
}

// ─── 解析器 ───────────────────────────────────────────────────────────────

struct Parser {
    chars: Vec<char>,
    pos: usize,
}

impl Parser {
    fn new(s: &str) -> Self {
        Parser { chars: s.chars().collect(), pos: 0 }
    }

    fn peek(&self) -> Option<char> {
        self.chars.get(self.pos).copied()
    }

    /// 丢弃紧随其后的空白（实现「闭合 } 后空白在数学模式被忽略」）。
    fn drop_ws(&mut self) {
        while matches!(self.peek(), Some(c) if c == ' ' || c == '\t' || c == '\n' || c == '\r') {
            self.pos += 1;
        }
    }

    /// 解析一个节点序列。`top=false` 时遇到 `}` 停止（由调用方消费）。
    fn parse_seq(&mut self, top: bool) -> Vec<Node> {
        let mut nodes = Vec::new();
        while let Some(c) = self.peek() {
            match c {
                '}' => {
                    if top {
                        self.pos += 1; // 多余的右括号：跳过
                        continue;
                    }
                    break; // 交给调用方消费
                }
                '{' => {
                    self.pos += 1;
                    let inner = self.parse_seq(false);
                    if self.peek() == Some('}') {
                        self.pos += 1;
                    }
                    self.drop_ws(); // 闭合 } 后丢弃空白
                    nodes.push(Node::Group(inner));
                }
                '^' | '_' => {
                    let sup = c == '^';
                    self.pos += 1;
                    self.drop_ws();
                    let operand = self.parse_operand();
                    nodes.push(Node::Script { sup, operand: Box::new(operand) });
                }
                '\\' => nodes.push(self.parse_backslash()),
                ' ' | '\t' | '\n' | '\r' => {
                    self.pos += 1;
                    while matches!(self.peek(), Some(w) if w == ' ' || w == '\t' || w == '\n' || w == '\r')
                    {
                        self.pos += 1;
                    }
                    nodes.push(Node::Space);
                }
                _ => {
                    let mut s = String::new();
                    while let Some(ch) = self.peek() {
                        if matches!(ch, '{' | '}' | '\\' | '^' | '_' | ' ' | '\t' | '\n' | '\r') {
                            break;
                        }
                        s.push(ch);
                        self.pos += 1;
                    }
                    nodes.push(Node::Str(s));
                }
            }
        }
        nodes
    }

    /// 上下标 / 单参的操作数：恒返回一个 `Group`，未括的单 token 自动补括。
    fn parse_operand(&mut self) -> Node {
        match self.peek() {
            Some('{') => {
                self.pos += 1;
                let inner = self.parse_seq(false);
                if self.peek() == Some('}') {
                    self.pos += 1;
                }
                self.drop_ws();
                Node::Group(inner)
            }
            Some('\\') => Node::Group(vec![self.parse_backslash()]),
            Some(_) => {
                let ch = self.chars[self.pos];
                self.pos += 1;
                Node::Group(vec![Node::Str(ch.to_string())])
            }
            None => Node::Group(vec![]),
        }
    }

    /// 解析 `\...`：具名宏（可能带参）或单字符控制符。
    fn parse_backslash(&mut self) -> Node {
        self.pos += 1; // 吃掉 '\'
        match self.peek() {
            Some(c) if c.is_ascii_alphabetic() => {
                let start = self.pos;
                while matches!(self.peek(), Some(ch) if ch.is_ascii_alphabetic()) {
                    self.pos += 1;
                }
                let name: String = self.chars[start..self.pos].iter().collect();
                let arity = macro_arity(&name);
                let mut args = Vec::with_capacity(arity);
                for _ in 0..arity {
                    self.drop_ws();
                    args.push(self.parse_arg());
                }
                Node::Macro { name, args }
            }
            Some(c) => {
                self.pos += 1;
                Node::Ctrl(c)
            }
            None => Node::Ctrl('\\'),
        }
    }

    /// 宏参数：`{..}` 取组内容；否则取单 token（补括）。
    fn parse_arg(&mut self) -> Vec<Node> {
        match self.peek() {
            Some('{') => {
                self.pos += 1;
                let inner = self.parse_seq(false);
                if self.peek() == Some('}') {
                    self.pos += 1;
                }
                self.drop_ws();
                inner
            }
            Some('\\') => vec![self.parse_backslash()],
            Some(_) => {
                let ch = self.chars[self.pos];
                self.pos += 1;
                vec![Node::Str(ch.to_string())]
            }
            None => vec![],
        }
    }
}

// ─── 变换 pass ────────────────────────────────────────────────────────────

fn is_spacing(node: &Node) -> bool {
    match node {
        Node::Ctrl(c) => SPACING_SYMBOLS.contains(c),
        Node::Macro { name, args } if args.is_empty() => is_spacing_macro(name),
        _ => false,
    }
}

/// `a \over b` → `\frac{a}{b}`（首个 \over，numer/denom 去空白边）。
fn rewrite_over(nodes: Vec<Node>) -> Vec<Node> {
    let idx = nodes.iter().position(|n| matches!(n, Node::Macro { name, args } if name == "over" && args.is_empty()));
    let Some(idx) = idx else { return nodes };
    let numer: Vec<Node> = nodes[..idx].iter().filter(|n| !matches!(n, Node::Space)).cloned().collect();
    let denom: Vec<Node> = nodes[idx + 1..].iter().filter(|n| !matches!(n, Node::Space)).cloned().collect();
    vec![Node::Macro { name: "frac".into(), args: vec![numer, denom] }]
}

fn strip_spacing(nodes: Vec<Node>) -> Vec<Node> {
    nodes.into_iter().filter(|n| !is_spacing(n)).collect()
}

fn normalize_synonyms(nodes: Vec<Node>) -> Vec<Node> {
    nodes
        .into_iter()
        .map(|n| match n {
            Node::Macro { ref name, ref args } if args.is_empty() => {
                if let Some(canon) = synonym(name) {
                    Node::Macro { name: canon.into(), args: vec![] }
                } else {
                    n
                }
            }
            other => other,
        })
        .collect()
}

fn collapse_ws(nodes: Vec<Node>) -> Vec<Node> {
    let mut out = Vec::with_capacity(nodes.len());
    let mut prev_ws = false;
    for n in nodes {
        let is_ws = matches!(n, Node::Space);
        if is_ws {
            if !prev_ws {
                out.push(n);
            }
        } else {
            out.push(n);
        }
        prev_ws = is_ws;
    }
    out
}

/// 相邻 (^, _) 交换为 (_, ^)，使下标恒在上标前。
fn normalize_script_order(mut nodes: Vec<Node>) -> Vec<Node> {
    let mut i = 0;
    while i + 1 < nodes.len() {
        let swap = matches!(&nodes[i], Node::Script { sup: true, .. })
            && matches!(&nodes[i + 1], Node::Script { sup: false, .. });
        if swap {
            nodes.swap(i, i + 1);
            i += 2;
        } else {
            i += 1;
        }
    }
    nodes
}

/// 删除紧跟上下标节点的空白（对齐 TS stripWhitespaceAfterScriptMacros）。
/// 覆盖间距宏夹在上下标与空格之间的情形：`x^{2}_{i}\, + 1` → `x_{i}^{2}+ 1`。
fn strip_ws_after_script(nodes: Vec<Node>) -> Vec<Node> {
    let mut out: Vec<Node> = Vec::with_capacity(nodes.len());
    for n in nodes {
        if matches!(n, Node::Space) {
            if let Some(Node::Script { .. }) = out.last() {
                continue; // 丢弃紧跟上下标的空白
            }
        }
        out.push(n);
    }
    out
}

/// {{x}} → {x}：内容恰为单个 Group 时，外层退化为内层。
fn flatten_groups(nodes: Vec<Node>) -> Vec<Node> {
    nodes
        .into_iter()
        .map(|n| match n {
            Node::Group(inner) if inner.len() == 1 && matches!(inner[0], Node::Group(_)) => {
                inner.into_iter().next().unwrap()
            }
            other => other,
        })
        .collect()
}

/// 递归（自底向上）+ 同层 pass（顺序对齐 TS）。
fn transform(nodes: Vec<Node>) -> Vec<Node> {
    let deep: Vec<Node> = nodes
        .into_iter()
        .map(|n| match n {
            Node::Group(inner) => Node::Group(transform(inner)),
            Node::Macro { name, args } => {
                Node::Macro { name, args: args.into_iter().map(transform).collect() }
            }
            Node::Script { sup, operand } => {
                Node::Script { sup, operand: Box::new(transform_one(*operand)) }
            }
            other => other,
        })
        .collect();

    let n = rewrite_over(deep);
    let n = strip_spacing(n);
    let n = normalize_synonyms(n);
    let n = collapse_ws(n);
    let n = normalize_script_order(n);
    let n = strip_ws_after_script(n);
    flatten_groups(n)
}

fn transform_one(node: Node) -> Node {
    match node {
        Node::Group(inner) => {
            // 复用同层 pass，再做一次 flatten（{{x}} 操作数）。
            let v = transform(inner);
            match flatten_groups(vec![Node::Group(v)]).into_iter().next() {
                Some(x) => x,
                None => Node::Group(vec![]),
            }
        }
        other => other,
    }
}

// ─── 序列化（对齐 printRaw）────────────────────────────────────────────────

fn serialize(nodes: &[Node]) -> String {
    let mut out = String::new();
    for n in nodes {
        match n {
            Node::Str(s) => out.push_str(s),
            Node::Space => out.push(' '),
            Node::Group(inner) => {
                out.push('{');
                out.push_str(&serialize(inner));
                out.push('}');
            }
            Node::Macro { name, args } => {
                out.push('\\');
                out.push_str(name);
                for a in args {
                    out.push('{');
                    out.push_str(&serialize(a));
                    out.push('}');
                }
            }
            Node::Ctrl(c) => {
                out.push('\\');
                out.push(*c);
            }
            Node::Script { sup, operand } => {
                out.push(if *sup { '^' } else { '_' });
                out.push_str(&serialize(std::slice::from_ref(operand)));
            }
        }
    }
    out
}

// ─── 数学区切分（移植 TS extractRegions）──────────────────────────────────

enum Region {
    Text(String),
    Inline(String),
    Display(String),
}

fn extract_regions(input: &str) -> Vec<Region> {
    let chars: Vec<char> = input.chars().collect();
    let n = chars.len();
    let mut regions = Vec::new();
    let mut i = 0;
    let mut text_start = 0;

    macro_rules! push_text {
        ($end:expr) => {
            if $end > text_start {
                regions.push(Region::Text(chars[text_start..$end].iter().collect()));
            }
        };
    }

    while i < n {
        if chars[i] == '\\' && i + 1 < n && chars[i + 1] == '$' {
            i += 2;
            continue;
        }
        if chars[i] == '$' && i + 1 < n && chars[i + 1] == '$' {
            push_text!(i);
            i += 2;
            let start = i;
            while i < n && !(chars[i] == '$' && i + 1 < n && chars[i + 1] == '$') {
                if chars[i] == '\\' && i + 1 < n {
                    i += 1;
                }
                i += 1;
            }
            regions.push(Region::Display(chars[start..i.min(n)].iter().collect()));
            i += 2;
            text_start = i;
            continue;
        }
        if chars[i] == '$' {
            push_text!(i);
            i += 1;
            let start = i;
            while i < n && chars[i] != '$' {
                if chars[i] == '\\' && i + 1 < n {
                    i += 1;
                }
                i += 1;
            }
            regions.push(Region::Inline(chars[start..i.min(n)].iter().collect()));
            i += 1;
            text_start = i;
            continue;
        }
        i += 1;
    }
    push_text!(n);
    regions
}

// ─── 公开核心 ─────────────────────────────────────────────────────────────

fn canonicalize(body: &str) -> String {
    let nodes = Parser::new(body).parse_seq(true);
    serialize(&transform(nodes))
}

#[wasm_bindgen]
pub fn canonicalize_math_body(body: &str) -> String {
    canonicalize(body)
}

#[wasm_bindgen]
pub fn normalize_latex(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for region in extract_regions(input) {
        match region {
            Region::Text(raw) => out.push_str(&raw),
            Region::Inline(body) => {
                out.push('$');
                out.push_str(&canonicalize(&body));
                out.push('$');
            }
            Region::Display(body) => {
                out.push_str("$$");
                out.push_str(&canonicalize(&body));
                out.push_str("$$");
            }
        }
    }
    out
}

// ─── 单元测试（与 lib/__tests__/normalizeLatex.test.ts 同源）──────────────

#[cfg(test)]
mod tests {
    use super::*;
    fn m(s: &str) -> String {
        canonicalize(s)
    }

    #[test]
    fn spacing_macros() {
        assert_eq!(m("x \\, + \\, y"), "x + y");
        assert_eq!(m("x \\! y"), "x y");
        assert_eq!(m("a \\quad b \\qquad c"), "a b c");
        assert_eq!(m("a \\; b \\: c"), "a b c");
        assert_eq!(m("\\frac{\\,d^2y\\,}{\\,dx^2\\,}"), "\\frac{d^{2}y}{dx^{2}}");
    }

    #[test]
    fn synonyms() {
        assert_eq!(m("x \\le y"), "x \\leq y");
        assert_eq!(m("x \\ge y"), "x \\geq y");
        assert_eq!(m("x \\ne y"), "x \\neq y");
        assert_eq!(m("x \\to y"), "x \\rightarrow y");
        assert_eq!(m("A \\land B \\lor C"), "A \\wedge B \\vee C");
        assert_eq!(m("a \\leftarrow b"), "a \\leftarrow b");
    }

    #[test]
    fn script_order() {
        assert_eq!(m("x^{2}_{i}"), "x_{i}^{2}");
        assert_eq!(m("abc^{n}_{k}"), "abc_{k}^{n}");
        assert_eq!(m("x_{i}^{2}"), "x_{i}^{2}");
        assert_eq!(m("x^{2}"), "x^{2}");
        assert_eq!(m("x_{i}"), "x_{i}");
        assert_eq!(m("\\frac{x^{2}_{1}}{a^{2}}"), "\\frac{x_{1}^{2}}{a^{2}}");
    }

    #[test]
    fn over_rewrite() {
        assert_eq!(m("1 \\over 2"), "\\frac{1}{2}");
        assert_eq!(m("a+b \\over c+d"), "\\frac{a+b}{c+d}");
        assert_eq!(m("\\frac{1}{2}"), "\\frac{1}{2}");
    }

    #[test]
    fn frac_args() {
        assert_eq!(m("\\frac 1 2"), "\\frac{1}{2}");
        assert_eq!(m("\\frac{a}{b}"), "\\frac{a}{b}");
    }

    #[test]
    fn flatten() {
        assert_eq!(m("{{x}}"), "{x}");
        assert_eq!(m("{{{x}}}"), "{x}");
        assert_eq!(m("{x}"), "{x}");
    }

    #[test]
    fn scenario_derivative() {
        let i = "\\frac{d}{dx}\\frac{\\,x^{2}_{i}\\, + 1}{x - 1}";
        assert_eq!(m(i), "\\frac{d}{dx}\\frac{x_{i}^{2}+ 1}{x - 1}");
        assert_eq!(m(&m(i)), m(i)); // 幂等
    }

    #[test]
    fn scenario_conic() {
        let i = "\\frac{x^{2}_{1}}{a^{2}} + \\frac{y^{2}_{1}}{b^{2}} = 1";
        assert_eq!(m(i), "\\frac{x_{1}^{2}}{a^{2}}+ \\frac{y_{1}^{2}}{b^{2}}= 1");
    }

    #[test]
    fn mixed_prose() {
        let i = "已知 $x \\le y$ 且 $y \\ge x$，则 $x \\ne y$。";
        assert_eq!(normalize_latex(i), "已知 $x \\leq y$ 且 $y \\geq x$，则 $x \\neq y$。");
    }

    #[test]
    fn escaped_dollar() {
        let i = "价格为 \\$50 和 \\$100";
        assert_eq!(normalize_latex(i), i);
    }

    #[test]
    fn idempotent() {
        for c in ["x \\le y", "\\frac{1}{2}", "1 \\over 2", "x^{2}_{i}", "{{x+y}}", "x \\, + \\quad y"] {
            assert_eq!(m(&m(c)), m(c), "not idempotent: {c}");
        }
    }
}
