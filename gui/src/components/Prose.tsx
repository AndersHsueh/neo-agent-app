import { renderInline, renderMarkdown, withCaret } from "@/lib/markdown.ts";
import type { AssistantSegment } from "@/protocol";
import { CodeBlock } from "./CodeBlock.tsx";

/**
 * 助手正文：段落走完整 markdown（标题/列表/表格/代码块/引用/链接），
 * 结构化段（ul / code）按协议原样渲染。
 */
export function Prose({
  segments,
  cursor = false,
}: {
  segments: AssistantSegment[];
  cursor?: boolean;
}) {
  const last = segments.length - 1;
  return (
    <div class="prose">
      {segments.map((segment, index) => {
        if (segment.type === "p") {
          const html = renderMarkdown(segment.text);
          return (
            <div
              // biome-ignore lint/security/noDangerouslySetInnerHtml: renderMarkdown 输出已全量转义
              class="md"
              key={index}
              dangerouslySetInnerHTML={{
                __html: cursor && index === last ? withCaret(html) : html,
              }}
            />
          );
        }
        if (segment.type === "ul") {
          return (
            <ul key={index}>
              {segment.items.map((item) => (
                <li
                  // biome-ignore lint/security/noDangerouslySetInnerHtml: renderInline 输出已全量转义
                  key={item}
                  dangerouslySetInnerHTML={{ __html: renderInline(item) }}
                />
              ))}
            </ul>
          );
        }
        return (
          <CodeBlock key={index} code={segment.code} lang={segment.lang} file={segment.file} />
        );
      })}
    </div>
  );
}
