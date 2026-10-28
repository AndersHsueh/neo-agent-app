import { highlight } from "@/lib/fx.ts";
import type { FileDiff } from "@/protocol";
import { Icon } from "./Icon.tsx";

export function DiffView({ diff, maxHeight }: { diff: FileDiff; maxHeight?: number }) {
  return (
    <div class="diff" style={maxHeight ? { maxHeight: `${maxHeight}px` } : undefined}>
      <div class="diff__head">
        <Icon name="diff" class="icon icon--xs" />
        <span>{diff.file}</span>
        <span class="diff__stat">
          <span class="diff__add">+{diff.add}</span>
          <span class="diff__del">−{diff.del}</span>
        </span>
      </div>
      {diff.hunks.map((hunk, hunkIndex) => (
        <div key={hunkIndex}>
          <div class="diff__hunk">{hunk.header}</div>
          {hunk.lines.map((line, lineIndex) => (
            <div
              key={lineIndex}
              class={`diff__line diff__line--${line.t === "add" ? "add" : line.t === "del" ? "del" : "ctx"}`}
            >
              <span class="diff__ln">{line.ln}</span>
              <span class="diff__sign">
                {line.t === "add" ? "+" : line.t === "del" ? "−" : " "}
              </span>
              <code class="diff__code" dangerouslySetInnerHTML={{ __html: highlight(line.code) }} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
