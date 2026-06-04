# 自托管 TeX Live 编译服务镜像：texlive-full(scheme-full) + 中文字体 + 预热字体缓存 + Node HTTP 服务。
# scheme-full 含 exam-zh / yhmath / pdfpages / tabularx 等用户预言里的全部 CTAN 宏包。
FROM texlive/texlive:latest

# Node（跑 server.mjs）+ 中文字体（Noto CJK；Fandol 随 TeX Live 自带，是 ctex 默认字体集）。
RUN apt-get update \
    && apt-get install -y --no-install-recommends nodejs npm fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*

# 构建期烤好 fontconfig 缓存 → 运行时无需可写缓存目录，根除 "Fontconfig error: No writable cache directories"。
RUN fc-cache -f

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev

COPY server.mjs ./
COPY latexmkrc /etc/latexmkrc

# 运行时把 HOME / 字体缓存 / TeX 可变目录都落到可写的 /tmp；fontconfig 仍优先读已烤好的系统缓存。
ENV HOME=/tmp \
    XDG_CACHE_HOME=/tmp/.cache \
    TEXMFVAR=/tmp/texmf-var \
    NODE_ENV=production \
    PORT=8080

# 非 root 运行（跑用户任意 LaTeX，最小权限）。
RUN useradd -m -u 10001 texrunner
USER texrunner

EXPOSE 8080
CMD ["node", "server.mjs"]
