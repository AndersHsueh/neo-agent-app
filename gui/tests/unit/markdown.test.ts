/**
 * lib/markdown.ts 单测：助手正文的 markdown → 安全 HTML。
 *
 * 重点守三件事：
 *  1. 常见 GFM 结构（标题/列表/表格/代码块/引用/链接）能渲染；
 *  2. 任何模型输出里的 HTML 都被转义（不允许 XSS）；
 *  3. 流式中间态（未闭合 fence、半截表格）不崩、不吞后续文本。
 */
import { describe, expect, test } from "vitest";
import { renderInline, renderMarkdown, withCaret } from "@/lib/markdown.ts";

describe("renderMarkdown：块级结构", () => {
  test("标题 1–4 级", () => {
    const html = renderMarkdown("# 一\n## 二\n### 三\n#### 四");
    expect(html).toContain("<h1>一</h1>");
    expect(html).toContain("<h2>二</h2>");
    expect(html).toContain("<h3>三</h3>");
    expect(html).toContain("<h4>四</h4>");
  });

  test("GFM 表格：表头/表体/对齐", () => {
    const html = renderMarkdown(
      [
        "| 日期 | 天气 | 气温 |",
        "| :--- | :---: | ---: |",
        "| 10/29 | 小雨 | 21/16℃ |",
        "| 10/30 | 阵雨 | 23/17℃ |",
      ].join("\n"),
    );
    expect(html).toContain("<table>");
    expect(html).toContain("<thead>");
    expect(html).toContain('<th data-align="left">日期</th>');
    expect(html).toContain('<th data-align="center">天气</th>');
    expect(html).toContain('<th data-align="right">气温</th>');
    expect(html).toContain('<td data-align="left">10/29</td>');
    expect(html.match(/<tr>/g)?.length).toBe(3);
  });

  test("没有分隔行的竖线文本不会被误判成表格", () => {
    const html = renderMarkdown("a | b | c\n只是普通的一行");
    expect(html).not.toContain("<table>");
    expect(html).toContain("<p>");
  });

  test("无序/有序列表，含两级缩进", () => {
    const html = renderMarkdown("- 一\n- 二\n  - 二点一\n1. 甲\n2. 乙");
    expect(html).toContain("<ul>");
    expect(html).toContain("<ol>");
    expect(html).toContain("<li>二<ul><li>二点一</li></ul></li>");
  });

  test("围栏代码块按原文转义，行内不再二次解析", () => {
    const html = renderMarkdown("```ts\nconst a = `x${1}`; // **不粗**\n```");
    expect(html).toContain('<pre class="md__pre"><code class="lang-ts">');
    expect(html).toContain("**不粗**");
    expect(html).not.toContain("<strong>");
  });

  test("引用与分隔线", () => {
    const html = renderMarkdown("> 引用一行\n> 引用两行\n\n---");
    expect(html).toContain("<blockquote>");
    expect(html).toContain("引用一行");
    expect(html).toContain("<hr />");
  });

  test("段落内换行保留为 <br />", () => {
    const html = renderMarkdown("第一行\n第二行\n\n第二段");
    expect(html).toContain("<p>第一行<br />第二行</p>");
    expect(html).toContain("<p>第二段</p>");
  });

  test("流式中间态：未闭合 fence 不吞后续、不崩", () => {
    expect(() => renderMarkdown("```ts\nconst a = 1")).not.toThrow();
    expect(renderMarkdown("```ts\nconst a = 1")).toContain("const a = 1");
    expect(() => renderMarkdown("| a | b |\n| --- |")).not.toThrow();
  });
});

describe("renderInline / 安全", () => {
  test("粗体、斜体、删除线、行内代码", () => {
    const html = renderInline("**粗** *斜* ~~删~~ `代码`");
    expect(html).toContain("<strong>粗</strong>");
    expect(html).toContain("<em>斜</em>");
    expect(html).toContain("<del>删</del>");
    expect(html).toContain("<code>代码</code>");
  });

  test("行内代码里的 * 不会被当斜体", () => {
    expect(renderInline("`a*b*c`")).toBe("<code>a*b*c</code>");
  });

  test("链接：http/https/mailto 保留，javascript: 降级为文本", () => {
    expect(renderInline("[文档](https://example.com/a?b=1&c=2)")).toContain(
      '<a href="https://example.com/a?b=1&amp;c=2" target="_blank" rel="noreferrer noopener">文档</a>',
    );
    const bad = renderInline("[点我](javascript:alert(1))");
    expect(bad).not.toContain("<a ");
    expect(bad).not.toContain("javascript:");
    expect(bad).toContain("点我");
  });

  test("HTML 注入全部转义", () => {
    const html = renderMarkdown('<img src=x onerror="alert(1)">\n\n<script>alert(2)</script>');
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;img");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("withCaret：流式光标", () => {
  test("光标插在最后一个段落内部", () => {
    const out = withCaret("<p>半句话</p>");
    expect(out).toBe('<p>半句话<span class="caret"></span></p>');
  });

  test("空内容也能显示光标", () => {
    expect(withCaret("")).toContain('class="caret"');
  });
});
