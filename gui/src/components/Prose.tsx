import { inlineMd } from "@/lib/fx.ts";
import type { AssistantSegment } from "@/protocol";
import { CodeBlock } from "./CodeBlock.tsx";

/** 助手正文：段落 / 列表 / 代码块；行内 markdown 走白名单渲染 */
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
          return (
            <p key={index}>
              <span dangerouslySetInnerHTML={{ __html: inlineMd(segment.text) }} />
              {cursor && index === last ? <span class="caret" /> : null}
            </p>
          );
        }
        if (segment.type === "ul") {
          return (
            <ul key={index}>
              {segment.items.map((item, itemIndex) => (
                <li key={itemIndex} dangerouslySetInnerHTML={{ __html: inlineMd(item) }} />
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
