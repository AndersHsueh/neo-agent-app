/**
 * lib/fx.ts — 纯前端效果原语：代码雨、字符变幻、代码高亮、行内 markdown。
 * 动效纪律：四档 100/180/280/420ms，无过冲；reduced-motion 下全部退化。
 */

export const reducedMotion = (): boolean =>
  document.documentElement.dataset.motion === "reduced" ||
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const CJK_GLYPHS =
  "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワン0123456789";
const LATIN_GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&*+=<>/\\|";

const randomGlyph = (isCJK: boolean): string =>
  (isCJK ? CJK_GLYPHS : LATIN_GLYPHS)[
    Math.floor(Math.random() * (isCJK ? CJK_GLYPHS.length : LATIN_GLYPHS.length))
  ] as string;

const isCJK = (ch: string) => /[\u3040-\u30ff\u4e00-\u9fff]/.test(ch);

/** 代码雨：极淡、稀疏，只为材质，不抢内容 */
export function startRain(canvas: HTMLCanvasElement, alpha = 0.5): { destroy: () => void } {
  const ctx = canvas.getContext("2d");
  if (!ctx) return { destroy: () => undefined };
  let raf = 0;
  let alive = true;
  let last = 0;
  const font = 13;
  const gap = 18;
  let columns: { y: number; vel: number; live: boolean; glyphs: string[] }[] = [];

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    columns = new Array(Math.floor(w / gap)).fill(0).map(() => ({
      y: Math.random() * -h,
      vel: 0.55 + Math.random() * 0.9,
      live: Math.random() < 0.42,
      glyphs: Array.from({ length: 28 }, () => randomGlyph(Math.random() < 0.72)),
    }));
    ctx.clearRect(0, 0, w, h);
  };

  const draw = (t: number) => {
    if (!alive) return;
    raf = requestAnimationFrame(draw);
    if (t - last < 90) return;
    last = t;
    ctx.fillStyle = "rgba(3, 5, 4, 0.22)";
    ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    ctx.font = `${font}px "SF Mono", Menlo, monospace`;
    ctx.textBaseline = "top";
    columns.forEach((col, i) => {
      if (!col.live) {
        if (Math.random() < 0.02) col.y += font * 2;
        if (col.y > canvas.clientHeight + 40) col.y = -Math.random() * canvas.clientHeight * 0.4;
        return;
      }
      const x = i * gap + 2;
      const row = Math.floor(col.y / font);
      ctx.fillStyle = `rgba(150, 255, 190, ${0.5 * alpha})`;
      ctx.fillText(col.glyphs[row % col.glyphs.length] as string, x, row * font);
      ctx.fillStyle = `rgba(70, 180, 120, ${0.16 * alpha})`;
      ctx.fillText(col.glyphs[(row + 1) % col.glyphs.length] as string, x, (row + 1) * font);
      col.y += font * col.vel;
      if (col.y > canvas.clientHeight + 30) col.y = -Math.random() * canvas.clientHeight * 0.5;
    });
  };

  resize();
  raf = requestAnimationFrame(draw);
  const onResize = () => resize();
  window.addEventListener("resize", onResize);
  return {
    destroy: () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    },
  };
}

/** 名字变幻：字符在乱码里落定（CLI 里 Agent: NEO ↔ Mr. Andersson 的同款） */
export function morphText(el: HTMLElement, next: string, duration = 420): Promise<void> {
  const prev = el.textContent ?? "";
  if (prev === next) return Promise.resolve();
  if (reducedMotion()) {
    el.textContent = next;
    return Promise.resolve();
  }
  const chars = [...next];
  el.textContent = "";
  const spans = chars.map((ch) => {
    const span = document.createElement("span");
    span.className = "morph__ch is-live";
    span.textContent = ch === " " ? " " : randomGlyph(isCJK(ch));
    el.appendChild(span);
    return span;
  });
  const start = performance.now();
  return new Promise((resolve) => {
    const tick = (now: number) => {
      const t = now - start;
      spans.forEach((span, i) => {
        const settle = (i / Math.max(1, chars.length)) * duration * 0.72 + duration * 0.24;
        if (t >= settle) {
          if (span.classList.contains("is-live")) {
            span.classList.remove("is-live");
            span.textContent = chars[i] as string;
          }
        } else {
          span.textContent = randomGlyph(isCJK(chars[i] as string));
        }
      });
      if (t < duration) requestAnimationFrame(tick);
      else {
        el.textContent = next;
        resolve();
      }
    };
    requestAnimationFrame(tick);
  });
}

/* ---------------------------- 代码高亮 ---------------------------- */

const KEYWORDS = new Set([
  "const",
  "let",
  "var",
  "function",
  "return",
  "if",
  "else",
  "for",
  "while",
  "import",
  "export",
  "from",
  "default",
  "class",
  "extends",
  "new",
  "await",
  "async",
  "try",
  "catch",
  "throw",
  "type",
  "interface",
  "enum",
  "implements",
  "public",
  "private",
  "readonly",
  "as",
  "of",
  "in",
  "true",
  "false",
  "null",
  "undefined",
  "void",
  "this",
  "super",
  "static",
  "switch",
  "case",
  "break",
  "continue",
  "yield",
  "typeof",
  "instanceof",
  "declare",
  "satisfies",
  "echo",
  "then",
  "fi",
  "do",
  "done",
]);

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function highlight(code: string): string {
  const out: string[] = [];
  const re =
    /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)/g;
  let last = 0;
  for (;;) {
    const match = re.exec(code);
    if (!match) break;
    if (match.index > last) out.push(escapeHtml(code.slice(last, match.index)));
    const [token, comment, str, num, word] = match;
    if (comment) out.push(`<span class="tok-c">${escapeHtml(token)}</span>`);
    else if (str) out.push(`<span class="tok-s">${escapeHtml(token)}</span>`);
    else if (num) out.push(`<span class="tok-n">${token}</span>`);
    else if (word) {
      const isCall = /^\s*\(/.test(code.slice(match.index + token.length));
      if (KEYWORDS.has(word)) out.push(`<span class="tok-k">${escapeHtml(word)}</span>`);
      else if (/^[A-Z]/.test(word)) out.push(`<span class="tok-t">${escapeHtml(word)}</span>`);
      else if (isCall) out.push(`<span class="tok-f">${escapeHtml(word)}</span>`);
      else out.push(escapeHtml(word));
    }
    last = match.index + token.length;
  }
  if (last < code.length) out.push(escapeHtml(code.slice(last)));
  return out.join("");
}

/** 行内 markdown：`code` / **bold** / *em* */
export function inlineMd(text: string): string {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<em>$2</em>");
}

export function formatCost(micros: number): string {
  return `$${(micros / 1_000_000).toFixed(3)}`;
}

export function formatTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

export function formatTime(at: number): string {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
