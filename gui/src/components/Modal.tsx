/**
 * components/Modal.tsx — 模态外壳：backdrop、焦点陷阱、背景 inert、Esc 关闭。
 *
 * 任何浮层都必须走这里：这是“键盘全流程可达”的机制保证，不靠每个调用方自觉。
 * 焦点陷阱挂在 document 捕获阶段：即使焦点还没落进弹窗，Tab / Esc 也不会逃出去。
 */
import type { ComponentChildren } from "preact";
import { useEffect, useRef } from "preact/hooks";

const FOCUSABLE =
  "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

export function Modal({
  children,
  onClose,
  class: className = "layer--center",
  initialFocus,
}: {
  children: ComponentChildren;
  onClose: () => void;
  class?: string;
  initialFocus?: string;
}) {
  const layer = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const focusRef = useRef(initialFocus);

  useEffect(() => {
    const app = document.getElementById("app");
    const previous = document.activeElement as HTMLElement | null;
    if (app) app.inert = true;

    const resolveNode = () =>
      layer.current ?? document.querySelector<HTMLElement>("[data-modal-layer]");

    const focusables = (): HTMLElement[] => {
      const node = resolveNode();
      if (!node) return [];
      // 只认真正的 HTML 可聚焦元素：SVG 里的 <use href> 会被 [href] 命中，但 focus() 无效
      return [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) =>
          el instanceof HTMLElement &&
          el.offsetParent !== null &&
          el.getAttribute("aria-hidden") !== "true",
      );
    };

    const applyInitialFocus = (): boolean => {
      const node = resolveNode();
      if (!node) return false;
      const target =
        (focusRef.current ? node.querySelector<HTMLElement>(focusRef.current) : null) ??
        focusables()[0];
      target?.focus({ preventScroll: true });
      return Boolean(target);
    };
    if (!applyInitialFocus()) requestAnimationFrame(applyInitialFocus);

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const node = resolveNode();
      if (!node) return;
      const list = focusables();
      if (!list.length) return;
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement;

      if (!node.contains(active)) {
        event.preventDefault();
        first?.focus();
        return;
      }
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first?.focus();
      }
    };

    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      if (app) app.inert = false;
      if (previous && document.contains(previous)) previous.focus({ preventScroll: true });
    };
    // 只在挂载/卸载时安装：依赖变化会导致 cleanup 反复摘掉 inert
  }, []);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: 背景点击只是 Esc 的便捷替代
    // biome-ignore lint/a11y/useKeyWithClickEvents: 键盘关闭由 document 捕获阶段的 Esc 负责
    <div
      class={`layer ${className}`}
      data-modal-layer=""
      ref={layer}
      onClick={(event) => {
        if (event.target === layer.current) onClose();
      }}
    >
      {children}
    </div>
  );
}
