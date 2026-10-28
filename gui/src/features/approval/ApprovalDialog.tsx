import { useEffect, useState } from "preact/hooks";
import { DiffView } from "@/components/DiffView.tsx";
import { Icon } from "@/components/Icon.tsx";
import { Modal } from "@/components/Modal.tsx";
import { t } from "@/i18n";
import { resolveApproval } from "@/state/app.ts";
import { activeSession, store } from "@/state/store.ts";

export function ApprovalDialog() {
  const blockId = store.approvalView.value;
  const state = activeSession.value;
  const block = state?.blocks.find((b) => b.id === blockId);
  const [left, setLeft] = useState(120);

  useEffect(() => {
    if (block?.kind !== "approval" || !block.deadlineAt) return;
    const timer = setInterval(() => {
      setLeft(Math.max(0, Math.round((block.deadlineAt! - Date.now()) / 1000)));
    }, 500);
    return () => clearInterval(timer);
  }, [block]);

  if (block?.kind !== "approval") return null;

  const close = () => (store.approvalView.value = null);
  const decide = (decision: "allow" | "deny" | "allow-session") => {
    void resolveApproval(block.id, decision);
    close();
  };

  return (
    <Modal onClose={close} initialFocus="[data-allow]">
      <div class="dialog" role="dialog" aria-modal="true" aria-label={t("dialog.approve.title")}>
        <div class="dialog__head">
          <span class="dialog__icon">
            <Icon name="shield-slash" />
          </span>
          <span class="dialog__titles">
            <span class="dialog__title">{t("dialog.approve.title")}</span>
            <span class="dialog__sub">
              {block.tool} · {block.path}
            </span>
          </span>
          <kbd class="kbd" style="align-self:flex-start">
            esc
          </kbd>
        </div>
        <div class="dialog__body">
          <p style="font-size:13px;color:var(--ink-2);margin-bottom:11px">
            {t("dialog.approve.desc")}
          </p>
          <DiffView diff={block.diff} maxHeight={420} />
        </div>
        <div class="dialog__foot">
          <span class="dialog__note">
            {t("dialog.approve.note")}{" "}
            <b class="dialog__count">{t("dialog.approve.timeout", { s: left })}</b>
          </span>
          <button class="btn btn--quiet" type="button" onClick={() => decide("deny")}>
            {t("dialog.approve.reject")} <kbd class="kbd">esc</kbd>
          </button>
          <button class="btn btn--ghost" type="button" onClick={() => decide("allow-session")}>
            {t("dialog.approve.acceptAll")}
          </button>
          <button class="btn btn--primary" type="button" data-allow onClick={() => decide("allow")}>
            <Icon name="check" class="icon icon--xs" />
            {t("dialog.approve.accept")}
            <kbd
              class="kbd"
              style="margin-left:2px;background:transparent;color:inherit;border-color:rgba(0,0,0,.25)"
            >
              ↩
            </kbd>
          </button>
        </div>
      </div>
    </Modal>
  );
}
