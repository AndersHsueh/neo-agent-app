import { useEffect, useRef, useState } from "preact/hooks";
import { t } from "@/i18n";
import { activeSession } from "@/state/store.ts";
import { type RenderBlockOptions, renderBlock } from "./Blocks.tsx";

/**
 * `onAnswerKeys` 是多选/自由输入的提交出口：
 * Workbench 接线后传入（app 侧 answerQuestion 已支持 {key,keys,custom}），
 * 未传时 Blocks 内置单选兜底。
 */
export function Transcript({
  onAnswerKeys,
}: {
  onAnswerKeys?: RenderBlockOptions["onAnswerKeys"];
}) {
  const state = activeSession.value;
  const scroller = useRef<HTMLDivElement>(null);
  const [follow, setFollow] = useState(true);
  const blockCount = state?.blocks.length ?? 0;
  const streamingId = state?.streaming.assistantBlockId;

  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    const onScroll = () => {
      const distance = node.scrollHeight - node.scrollTop - node.clientHeight;
      setFollow(distance < 220);
    };
    node.addEventListener("scroll", onScroll, { passive: true });
    return () => node.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const node = scroller.current;
    if (!node || !follow) return;
    node.scrollTo({ top: node.scrollHeight });
    // 流式期间内容高度变化不触发 scroll 事件：用 rAF 再跟一次
    const raf = requestAnimationFrame(() => node.scrollTo({ top: node.scrollHeight }));
    return () => cancelAnimationFrame(raf);
  }, [blockCount, streamingId, follow]);

  if (!state) {
    return (
      <div class="stream" ref={scroller}>
        <div class="stream__inner">
          <div class="skel-msg">
            <div class="skel" style="height:12px;width:34%" />
            <div class="skel" style="height:44px;width:82%" />
          </div>
          <div class="skel-msg">
            <div class="skel" style="height:12px;width:22%" />
            <div class="skel" style="height:76px" />
          </div>
        </div>
      </div>
    );
  }

  const empty = state.blocks.length === 0;

  return (
    <div class="stream" ref={scroller}>
      <div class={`stream__inner${empty ? " is-empty" : ""}`}>
        {empty ? (
          <EmptyState />
        ) : (
          state.blocks.map((block) => (
            <div key={block.id} class="block">
              {renderBlock(block, { streamingAssistantId: streamingId, onAnswerKeys })}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div class="empty">
      <div class="empty__mark">
        <svg viewBox="0 0 24 24" role="img" aria-label={t("empty.word")}>
          <title>{t("empty.word")}</title>
          <use href="#i-logo" />
        </svg>
      </div>
      <div class="empty__word">{t("empty.word")}</div>
      <p class="empty__sub">{t("empty.sub")}</p>
      <div class="empty__hint">{t("empty.hint")}</div>
    </div>
  );
}
