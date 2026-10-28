import { Icon } from "@/components/Icon.tsx";
import { Modal } from "@/components/Modal.tsx";
import { t } from "@/i18n";
import { store } from "@/state/store.ts";

export function AboutDialog() {
  const close = () => (store.overlay.value = null);
  return (
    <Modal onClose={close} initialFocus="[data-about-close]">
      <div class="about" role="dialog" aria-modal="true" aria-label={t("about.name")}>
        <div class="about__body">
          <div class="about__mark">
            <svg viewBox="0 0 24 24" role="img" aria-label="NEO">
              <title>NEO</title>
              <use href="#i-logo" />
            </svg>
          </div>
          <div class="about__name">{t("about.name")}</div>
          <div class="about__meta">
            {t("about.meta1")}
            <br />
            {t("about.meta2")}
          </div>
          <div class="about__quote">{t("about.quote")}</div>
        </div>
        <div class="about__foot">
          <button class="btn btn--ghost" type="button" onClick={() => location.reload()}>
            <Icon name="retry" class="icon icon--xs" />
            {t("about.replay")}
          </button>
          <button
            class="btn btn--quiet"
            type="button"
            data-about-close
            style="margin-left:auto"
            onClick={close}
          >
            {t("about.close")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
