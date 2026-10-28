import { Icon } from "@/components/Icon.tsx";
import { lang, t } from "@/i18n";
import { changeLang } from "@/state/app.ts";
import { type SidebarView, store } from "@/state/store.ts";

const NAV: { view: SidebarView; icon: string; label: string }[] = [
  { view: "sessions", icon: "sessions", label: "rail.sessions" },
  { view: "peers", icon: "peers", label: "rail.peers" },
  { view: "memory", icon: "memory", label: "rail.memory" },
  { view: "wiki", icon: "wiki", label: "rail.wiki" },
  { view: "skills", icon: "skills", label: "rail.skills" },
];

export function Rail() {
  return (
    <nav class="rail" aria-label="global">
      <button
        class="railbtn railbtn--brand"
        type="button"
        title={t("rail.about")}
        onClick={() => (store.overlay.value = "about")}
      >
        <Icon name="logo" />
      </button>

      <div class="rail__group">
        {NAV.map((item) => (
          <button
            key={item.view}
            class={`railbtn${store.sidebar.value === item.view ? " is-active" : ""}`}
            type="button"
            title={t(item.label as never)}
            aria-label={t(item.label as never)}
            onClick={() => {
              store.sidebar.value = item.view;
            }}
          >
            <Icon name={item.icon} />
            {item.view === "peers" ? (
              <span class="railbtn__badge">{store.peers.value.length}</span>
            ) : null}
          </button>
        ))}
      </div>

      <div class="rail__spacer" />

      <div class="rail__group rail__group--bottom">
        <button
          class="railbtn railbtn--lang"
          type="button"
          title={t("rail.lang")}
          onClick={() => changeLang(lang.value === "zh" ? "en" : "zh")}
        >
          <span class="railbtn__lang">{lang.value === "zh" ? "EN" : "文"}</span>
        </button>
        <button
          class="railbtn"
          type="button"
          title={t("rail.palette")}
          onClick={() => (store.overlay.value = "palette")}
        >
          <Icon name="palette" />
        </button>
        <button
          class="railbtn"
          type="button"
          title={t("rail.settings")}
          onClick={() => (store.overlay.value = "settings")}
        >
          <Icon name="settings" />
        </button>
        <button
          class="railbtn"
          type="button"
          title={t("rail.shortcuts")}
          onClick={() => (store.overlay.value = "shortcuts")}
        >
          <Icon name="keyboard" />
        </button>
      </div>

      <div class="rail__led" title={t("rail.link")}>
        <i class={`led ${store.connection.value === "live" ? "led--live" : "led--warn"}`} />
      </div>
    </nav>
  );
}
