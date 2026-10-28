/** 登录页：本地账号（dummy）+ 为将来 OIDC 留的接口形状。 */
import { useState } from "preact/hooks";
import { Icon } from "@/components/Icon.tsx";
import { t } from "@/i18n";
import { login } from "@/state/app.ts";

const DEMO = [
  { email: "neo@local", label: "Neo · owner" },
  { email: "tom@local", label: "Tom · member" },
  { email: "jacky@local", label: "Jacky · member" },
];

export function LoginView() {
  const [email, setEmail] = useState("neo@local");
  const [password, setPassword] = useState("neo");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: Event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const ok = await login(email.trim(), password);
    setBusy(false);
    if (!ok) setError(t("login.error"));
  };

  return (
    <div class="login">
      <div class="login__card">
        <div class="login__brand">
          <div class="login__mark">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <use href="#i-logo" />
            </svg>
          </div>
          <div>
            <div class="login__name">{t("login.title")}</div>
            <div class="login__sub">{t("login.subtitle")}</div>
          </div>
        </div>

        <form class="login__form" onSubmit={submit}>
          <label class="field">
            <span class="field__label">
              <span class="field__main">{t("login.email")}</span>
              <code>email</code>
            </span>
            <input
              class="input"
              type="text"
              autocomplete="username"
              value={email}
              onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
            />
          </label>
          <label class="field">
            <span class="field__label">
              <span class="field__main">{t("login.password")}</span>
              <code>password</code>
            </span>
            <input
              class="input"
              type="password"
              autocomplete="current-password"
              value={password}
              onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
            />
          </label>

          {error ? (
            <div class="login__error" role="alert">
              <Icon name="alert" class="icon icon--xs" />
              {error}
            </div>
          ) : null}

          <button class="btn btn--primary login__submit" type="submit" disabled={busy}>
            {busy ? t("login.submitting") : t("login.submit")}
          </button>
        </form>

        <div class="login__demo">
          <span class="eyebrow">{t("login.demo")}</span>
          {DEMO.map((account) => (
            <button
              key={account.email}
              class="chip"
              type="button"
              onClick={() => {
                setEmail(account.email);
                setPassword(account.email.split("@")[0] ?? "");
              }}
            >
              {account.label}
            </button>
          ))}
        </div>

        <div class="login__foot">
          <Icon name="shield" class="icon icon--xs" />
          <span>{t("login.hint")}</span>
        </div>
      </div>
    </div>
  );
}
