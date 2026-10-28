import { Icon } from "@/components/Icon.tsx";
import { Modal } from "@/components/Modal.tsx";
import { lang, t } from "@/i18n";
import { store } from "@/state/store.ts";

const ROWS: [string, [string, string][]][] = [
  [
    "sheet.group.nav",
    [
      ["⌘K", "palette.action.new"],
      ["⌘,", "rail.settings"],
      ["⌘/", "sheet.title"],
      ["⌘B", "rail.aside"],
      ["⌘N", "palette.action.new"],
    ],
  ],
  [
    "sheet.group.chat",
    [
      ["⌘↩", "composer.send"],
      ["esc", "toast.turnAborted"],
    ],
  ],
  [
    "sheet.group.tier",
    [
      ["⌘1…⌘4", "topbar.tier"],
      ["1 / 2 / 3", "question.keys"],
    ],
  ],
];

export function ShortcutsSheet() {
  const close = () => (store.overlay.value = null);
  return (
    <Modal onClose={close} class="layer--sheet">
      <div class="sheet" role="dialog" aria-modal="true" aria-label={t("sheet.title")}>
        <div class="sheet__head">
          <Icon name="keyboard" />
          <span class="sheet__title">{t("sheet.title")}</span>
          <kbd class="kbd">esc</kbd>
        </div>
        <div class="sheet__body">
          {ROWS.map(([group, rows]) => (
            <>
              <div class="sheet__group" key={group}>
                {t(group as never)}
              </div>
              {rows.map(([key, label]) => (
                <div class="sheetrow" key={`${group}-${key}`}>
                  <span>{t(label as never)}</span>
                  <kbd class="kbd">{key}</kbd>
                </div>
              ))}
            </>
          ))}
        </div>
        <div class="sheet__foot">
          {lang.value === "zh"
            ? "全部快捷键可在不点鼠标的情况下走完一轮。"
            : "A full turn is reachable without touching the mouse."}
        </div>
      </div>
    </Modal>
  );
}
