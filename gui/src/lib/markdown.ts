/**
 * lib/markdown.ts — 助手正文的 markdown 渲染（零依赖、无原始 HTML 透传）。
 *
 * 输出**已转义**的 HTML 字符串，供 `dangerouslySetInnerHTML` 使用；所有文本先 escapeHtml，
 * 只由本模块插入标签，因此模型输出里的 `<img onerror=…>` 之类不会被当成标签执行。
 *
 * 支持：ATX 标题 / 段落（保留换行）/ 无序·有序列表（两级缩进）/ 围栏代码块 /
 *       GFM 表格（含对齐）/ 引用 / 分隔线 / 行内 code·bold·italic·删除线·链接。
 * 不支持：原始 HTML、图片、脚注、三级以上嵌套（都按纯文本处理）。
 */

import { escapeHtml } from "@/lib/fx.ts";

const CODE_MARK = "\u0000C";

function sanitizeHref(href: string): string | null {
  const trimmed = href.trim();
  if (/^https?:\/\//i.test(trimmed) || /^mailto:/i.test(trimmed)) return trimmed;
  if (/^#/.test(trimmed)) return trimmed;
  return null;
}

/** 行内 markdown：code → 链接 → 粗体 → 删除线 → 斜体（先抽出 code 避免内部被二次解析） */
export function renderInline(raw: string): string {
  const codes: string[] = [];
  let text = escapeHtml(raw).replace(/`([^`\n]+)`/g, (_m, code: string) => {
    codes.push(code);
    return `${CODE_MARK}${codes.length - 1}\u0000`;
  });
  text = text
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, href: string) => {
      const safe = sanitizeHref(href);
      return safe
        ? `<a href="${safe}" target="_blank" rel="noreferrer noopener">${label}</a>`
        : label;
    })
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_\n]+)__/g, "<strong>$1</strong>")
    .replace(/~~([^~\n]+)~~/g, "<del>$1</del>")
    .replace(/(^|[\s(（"'])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(/(^|[\s(（"'])_([^_\n]+)_/g, "$1<em>$2</em>");
  return text.replace(
    new RegExp(`${CODE_MARK}(\\d+)\\u0000`, "g"),
    (_m, index: string) => `<code>${codes[Number(index)] ?? ""}</code>`,
  );
}

const FENCE = /^\s*```\s*([\w#+.-]*)\s*$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const HR = /^\s*([-*_])\s*(?:\1\s*){2,}$/;
const BULLET = /^(\s*)[-*+]\s+(.*)$/;
const ORDERED = /^(\s*)\d+[.)]\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;
const SEPARATOR_CELL = /^:?-{2,}:?$/;

function splitRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let current = "";
  let inCode = false;
  for (let i = 0; i < trimmed.length; i += 1) {
    const ch = trimmed[i] ?? "";
    if (ch === "\\" && trimmed[i + 1] === "|") {
      current += "|";
      i += 1;
      continue;
    }
    if (ch === "`") inCode = !inCode;
    if (ch === "|" && !inCode) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

function isSeparatorRow(line: string): boolean {
  if (!line.includes("|") && !/^\s*:?-{2,}:?\s*$/.test(line)) return false;
  const cells = splitRow(line);
  return cells.length > 0 && cells.every((cell) => SEPARATOR_CELL.test(cell));
}

function alignmentOf(cell: string): "left" | "center" | "right" | null {
  const left = cell.startsWith(":");
  const right = cell.endsWith(":");
  if (left && right) return "center";
  if (right) return "right";
  if (left) return "left";
  return null;
}

function cellHtml(
  tag: "th" | "td",
  text: string,
  align: "left" | "center" | "right" | null,
): string {
  const attr = align ? ` data-align="${align}"` : "";
  return `<${tag}${attr}>${renderInline(text)}</${tag}>`;
}

function renderTable(header: string[], separators: string[], rows: string[][]): string {
  const aligns = separators.map(alignmentOf);
  const head = header.map((cell, index) => cellHtml("th", cell, aligns[index] ?? null)).join("");
  const body = rows
    .map((row) => {
      const cells = header.map((_, index) =>
        cellHtml("td", row[index] ?? "", aligns[index] ?? null),
      );
      return `<tr>${cells.join("")}</tr>`;
    })
    .join("");
  return `<div class="md__tablewrap"><table><thead><tr>${head}</tr></thead>${
    body ? `<tbody>${body}</tbody>` : ""
  }</table></div>`;
}

interface ListItem {
  indent: number;
  ordered: boolean;
  text: string;
}

function buildList(
  items: ListItem[],
  start: number,
  indent: number,
  ordered: boolean,
): { html: string; next: number } {
  let html = ordered ? "<ol>" : "<ul>";
  let i = start;
  while (i < items.length) {
    const item = items[i];
    if (!item || item.indent < indent) break;
    if (item.indent > indent) {
      const nested = buildList(items, i, item.indent, item.ordered);
      html += nested.html;
      i = nested.next;
      continue;
    }
    if (item.ordered !== ordered) break;
    html += `<li>${renderInline(item.text)}`;
    const childStart = i + 1;
    const child = items[childStart];
    if (child && child.indent > indent) {
      const nested = buildList(items, childStart, child.indent, child.ordered);
      html += nested.html;
      i = nested.next;
    } else {
      i = childStart;
    }
    html += "</li>";
  }
  html += ordered ? "</ol>" : "</ul>";
  return { html, next: i };
}

function renderListBlock(items: ListItem[]): string {
  let html = "";
  let index = 0;
  while (index < items.length) {
    const head = items[index];
    if (!head) break;
    const built = buildList(items, index, head.indent, head.ordered);
    html += built.html;
    index = built.next > index ? built.next : items.length;
  }
  return html;
}

function collectList(lines: string[], start: number): { items: ListItem[]; next: number } {
  const items: ListItem[] = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    const bullet = BULLET.exec(line);
    const ordered = bullet ? null : ORDERED.exec(line);
    if (bullet || ordered) {
      items.push({
        indent: (bullet ?? ordered)?.[1]?.replace(/\t/g, "  ").length ?? 0,
        ordered: ordered !== null,
        text: (bullet ?? ordered)?.[2] ?? "",
      });
      i += 1;
      continue;
    }
    // 续行：缩进且不是新的块起点，并入上一项
    if (items.length && /^\s{2,}\S/.test(line) && !FENCE.test(line) && !HEADING.test(line)) {
      const last = items[items.length - 1];
      if (last) last.text = `${last.text} ${line.trim()}`;
      i += 1;
      continue;
    }
    break;
  }
  return { items, next: i };
}

function isBlockStart(line: string): boolean {
  return (
    FENCE.test(line) ||
    HEADING.test(line) ||
    HR.test(line) ||
    QUOTE.test(line) ||
    BULLET.test(line) ||
    ORDERED.test(line)
  );
}

/** markdown → 安全 HTML（块级） */
export function renderMarkdown(input: string): string {
  const lines = input.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (!line.trim()) {
      i += 1;
      continue;
    }
    const fence = FENCE.exec(line);
    if (fence) {
      const lang = fence[1] ?? "";
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !FENCE.test(lines[i] ?? "")) {
        code.push(lines[i] ?? "");
        i += 1;
      }
      i += 1; // 吃掉收尾 fence（流式未闭合时越界也无妨）
      const langClass = lang ? ` class="lang-${escapeHtml(lang)}"` : "";
      out.push(
        `<pre class="md__pre"><code${langClass}>${escapeHtml(code.join("\n"))}</code></pre>`,
      );
      continue;
    }
    if (HR.test(line)) {
      out.push("<hr />");
      i += 1;
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      const level = Math.min(6, Math.max(1, (heading[1] ?? "#").length));
      out.push(`<h${level}>${renderInline(heading[2] ?? "")}</h${level}>`);
      i += 1;
      continue;
    }
    if (line.includes("|") && isSeparatorRow(lines[i + 1] ?? "")) {
      const header = splitRow(line);
      const separators = splitRow(lines[i + 1] ?? "");
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && (lines[i] ?? "").includes("|") && (lines[i] ?? "").trim()) {
        rows.push(splitRow(lines[i] ?? ""));
        i += 1;
      }
      out.push(renderTable(header, separators, rows));
      continue;
    }
    if (QUOTE.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i] ?? "")) {
        quoted.push((QUOTE.exec(lines[i] ?? "")?.[1] ?? "").trim());
        i += 1;
      }
      out.push(`<blockquote>${renderMarkdown(quoted.join("\n"))}</blockquote>`);
      continue;
    }
    const listMatch = BULLET.exec(line) ?? ORDERED.exec(line);
    if (listMatch) {
      const collected = collectList(lines, i);
      out.push(renderListBlock(collected.items));
      i = collected.next;
      continue;
    }
    // 段落：吃到空行或下一个块起点；段内换行保留为 <br>
    const paragraph: string[] = [];
    while (i < lines.length) {
      const current = lines[i] ?? "";
      if (!current.trim()) break;
      if (paragraph.length > 0 && isBlockStart(current)) break;
      if (paragraph.length > 0 && current.includes("|") && isSeparatorRow(lines[i + 1] ?? ""))
        break;
      paragraph.push(current);
      i += 1;
    }
    out.push(`<p>${paragraph.map((text) => renderInline(text)).join("<br />")}</p>`);
  }
  return out.join("");
}

/** 把流式光标插到最后一个块内部（段落/列表尾），避免光标掉到下一行 */
export function withCaret(html: string): string {
  if (!html) return '<p><span class="caret"></span></p>';
  if (html.endsWith("</p>")) return `${html.slice(0, -4)}<span class="caret"></span></p>`;
  return `${html}<span class="caret"></span>`;
}
