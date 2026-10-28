/**
 * 离线兜底页：Hub 未发现/已断开时显示。
 *
 * v0.0.2 是本地 Hub（`matrix-core hub --dev-auth`），没有用户名密码：
 * 客户端读发现文件拿 token 直连。这里只负责「为什么没连上 + 重试」。
 */
import { Icon } from "@/components/Icon.tsx";
import { t } from "@/i18n";
import { retryDiscovery } from "@/state/app.ts";
import { store } from "@/state/store.ts";

export function LoginView() {
  const booting = store.boot.value === "booting";
  const reason = store.bootError.value;

  return (
    <div class="login" data-role="hub-offline">
      <div class="login__card">
        <div class="login__brand">
          <div class="login__mark">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <use href="#i-logo" />
            </svg>
          </div>
          <div>
            <div class="login__name">{t("login.title")}</div>
            <div class="login__sub">{booting ? t("login.discovering") : t("login.hubOffline")}</div>
          </div>
        </div>

        <div class="login__form">
          <p class="panelhint" style="margin:0 0 14px">
            {reason ? <code data-role="hub-error">{reason}</code> : null}
          </p>
          <p class="panelhint" style="margin:0 0 18px">
            {t("login.hubOfflineHint")}
          </p>
          <button
            class="btn btn--primary login__submit"
            type="button"
            data-action="retry-discovery"
            disabled={booting}
            onClick={() => retryDiscovery()}
          >
            {booting ? t("login.discovering") : t("login.retry")}
          </button>
        </div>

        <div class="login__foot">
          <Icon name="plug" class="icon icon--xs" />
          <span class="mono">
            {t("login.detected")} · /__neo/endpoint · {store.endpoint.value?.url ?? "—"}
          </span>
        </div>
      </div>
    </div>
  );
}
