import { useEffect, useRef, useState } from "preact/hooks";
import { Icon } from "@/components/Icon.tsx";
import { lang, t } from "@/i18n";
import { sendMessage } from "@/state/app.ts";
import { activeSession } from "@/state/store.ts";
import { renderBlock } from "./Blocks.tsx";

export function Transcript() {
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
              {renderBlock(block, { streamingAssistantId: streamingId })}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  const promptRed =
    lang.value === "zh"
      ? "先把相关代码读一遍，给我一个最小改动方案。"
      : "Read the relevant code first, then give me the smallest viable patch.";
  const promptBlue =
    lang.value === "zh" ? "直接给结论与补丁。" : "Straight to the answer and the patch.";
  return (
    <div class="empty">
      <div class="empty__mark">
        <svg viewBox="0 0 24 24" role="img" aria-label="NEO">
          <title>NEO</title>
          <use href="#i-logo" />
        </svg>
      </div>
      <div class="empty__word">{t("empty.word")}</div>
      <p class="empty__sub">{t("empty.sub")}</p>
      <div class="empty__cards">
        <button
          class="startcard startcard--red"
          type="button"
          onClick={() => sendMessage(promptRed)}
        >
          <span class="startcard__icon">
            <Icon name="eye" />
          </span>
          <span>
            <span class="startcard__t">{t("empty.red.t")}</span>
            <span class="startcard__d">{t("empty.red.d")}</span>
          </span>
        </button>
        <button
          class="startcard startcard--blue"
          type="button"
          onClick={() => sendMessage(promptBlue)}
        >
          <span class="startcard__icon">
            <Icon name="zap" />
          </span>
          <span>
            <span class="startcard__t">{t("empty.blue.t")}</span>
            <span class="startcard__d">{t("empty.blue.d")}</span>
          </span>
        </button>
      </div>
      <p class="empty__aphorism">
        {t("empty.cite")}
        <cite>MORPHEUS</cite>
      </p>
      <div class="empty__hint">{t("empty.hint")}</div>
    </div>
  );
}
