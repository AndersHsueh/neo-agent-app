import { SPRITE_MARKUP } from "./sprite-markup.ts";

/** 全局图标 sprite：只渲染一次，Icon 用 <use href="#i-..."/> 引用 */
export function Sprite() {
  return (
    <svg
      class="sprite"
      aria-hidden="true"
      focusable="false"
      dangerouslySetInnerHTML={{ __html: SPRITE_MARKUP }}
    />
  );
}
