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
  const [left, setLeft] = useState(0);
  const deadlineAt = block?.kind === "approval" ? block.deadlineAt : undefined;

  useEffect(() => {
    if (!deadlineAt) {
      setLeft(0);
      return;
    }
    const tick = () => setLeft(Math.max(0, Math.round((deadlineAt - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 500);
    return () => clearInterval(timer);
  }, [deadlineAt]);

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
            <Icon name={block.diff ? "shield-slash" : "shield"} />
          </span>
          <span class="dialog__titles">
            <span class="dialog__title">{t("dialog.approve.title")}</span>
            <span class="dialog__sub">
              {block.tool}
              {block.path ? ` · ${block.path}` : ` · ${t("approve.noPath")}`}
            </span>
          </span>
          <kbd class="kbd" style="align-self:flex-start">
            esc
          </kbd>
        </div>
        <div class="dialog__body">
          <p class="dialog__hint">{t("dialog.approve.desc")}</p>
          {block.detail ? (
            <div class="approve__detailblock">
              <div class="approve__detailhead">
                <Icon name="file" class="icon icon--xs" />
                {t("approve.detail")}
              </div>
              <pre class="approve__detail">{block.detail}</pre>
            </div>
          ) : null}
          {block.diff ? (
            <DiffView diff={block.diff} maxHeight={420} />
          ) : (
            <div class="approve__nopatch">
              <Icon name="alert" class="icon icon--xs" />
              {block.detail ? t("approve.noDiff") : t("approve.noDetail")}
            </div>
          )}
        </div>
        <div class="dialog__foot">
          <span class="dialog__note">
            {t("dialog.approve.note")}
            {deadlineAt ? (
              <>
                {" "}
                <b class="dialog__count">{t("dialog.approve.timeout", { s: left })}</b>
              </>
            ) : null}
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
