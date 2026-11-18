import { Icon } from "@/components/Icon.tsx";
import { IconButton } from "@/components/primitives.tsx";
import { lang, t } from "@/i18n";
import { endpointLabel } from "@/lib/endpoints.ts";
import { formatTime } from "@/lib/fx.ts";
import { TIER_ICONS, TIER_KEYS, tierName } from "@/lib/tiers.ts";
import { createSession, selectSession } from "@/state/app.ts";
import { type SidebarView, store } from "@/state/store.ts";

const STATUS_LED: Record<string, string> = {
  working: "led--live",
  waiting: "led--warn",
  stalled: "led--dim",
  idle: "led--dim",
  dead: "led--danger",
};

export function Sidebar() {
  const view: SidebarView = store.sidebar.value;
  const sessions = store.sessions.value;
  const activeId = store.activeId.value;

  return (
    <aside class="sidebar" id="sidebar">
      <header class="sidebar__head">
        <div class="sidebar__headline">
          <span class="eyebrow">
            {view === "sessions" ? t("nav.constructs") : t(`rail.${view}`)}
          </span>
          <span class="count">{view === "sessions" ? sessions.length : ""}</span>
        </div>
        {view === "sessions" ? (
          <IconButton
            icon="plus-cell"
            title={t("nav.new")}
            dataAction="new-session"
            onClick={() => void createSession()}
          />
        ) : (
          <IconButton
            icon="sessions"
            title={t("nav.constructs")}
            onClick={() => (store.sidebar.value = "sessions")}
          />
        )}
      </header>

      <button class="searchfield" type="button" onClick={() => (store.overlay.value = "palette")}>
        <Icon name="search" class="icon" />
        <span class="searchfield__label">{t("nav.search")}</span>
        <kbd class="kbd">⌘K</kbd>
      </button>

      <div class="sidebar__list">
        {view === "sessions" ? (
          <SessionList sessions={sessions} activeId={activeId} />
        ) : (
          <AuxPanel view={view} />
        )}
      </div>

      <footer class="sidebar__foot">
        {store.peers.value.length > 0 ? (
          <div class="peers">
            {store.peers.value.map((peer) => (
              <div class="peer" key={peer.name}>
                <i class={`led ${STATUS_LED[peer.status] ?? "led--dim"}`} />
                <span class="peer__name">{peer.name}</span>
                <span class="peer__act">{peer.activity[lang.value]}</span>
              </div>
            ))}
          </div>
        ) : null}
        <div class="hubmeta">
          <i class="led led--live" />
          <span class="mono">HUB · {endpointLabel(store.endpoint.value)}</span>
          <span class="mono dim">{t(`conn.${store.connection.value}`)}</span>
        </div>
      </footer>
    </aside>
  );
}

function SessionList({
  sessions,
  activeId,
}: {
  sessions: typeof store.sessions.value;
  activeId: string | null;
}) {
  if (!sessions.length) {
    return <p class="panelhint">{t("usage.empty")}</p>;
  }
  return (
    <>
      {sessions.map((session) => {
        const active = session.id === activeId;
        return (
          <button
            key={session.id}
            type="button"
            class={`session${active ? " is-active" : ""}`}
            aria-current={active}
            aria-label={session.title}
            onClick={() => void selectSession(session.id)}
          >
            {session.unread ? <i class="session__unread" /> : null}
            <span class="session__row">
              <span class="session__title">{session.title}</span>
              <span class="session__time">{formatTime(session.updatedAt)}</span>
            </span>
            <span class="session__row session__row--meta">
              <span class="session__state">
                <i class={`led ${STATUS_LED[session.status] ?? "led--dim"}`} />
                {t(`state.${session.status}`)}
              </span>
              <span
                class="session__tier"
                style={{ color: `var(--tier-${TIER_KEYS[session.tier]})`, opacity: 0.62 }}
                title={tierName(session.tier)}
              >
                <Icon name={TIER_ICONS[session.tier]} />
              </span>
            </span>
          </button>
        );
      })}
    </>
  );
}

function AuxPanel({ view }: { view: Exclude<SidebarView, "sessions"> }) {
  const hintKey = {
    peers: "nav.peersHint",
    memory: "nav.memoryHint",
    wiki: "nav.wikiHint",
    skills: "nav.skillsHint",
  } as const;
  const emptyKey = {
    peers: "nav.peersEmpty",
    memory: "nav.memoryEmpty",
    wiki: "nav.wikiEmpty",
    skills: "nav.skillsEmpty",
  } as const;
  if (view === "peers") {
    const peers = store.peers.value;
    return (
      <>
        <p class="panelhint">{t(hintKey.peers)}</p>
        {peers.length === 0 ? (
          <p class="panelhint">{t(emptyKey.peers)}</p>
        ) : (
          peers.map((peer) => (
            <div class="panelrow" key={peer.name}>
              <i class={`led ${STATUS_LED[peer.status] ?? "led--dim"}`} />
              <span class="panelrow__main">
                {peer.name}
                <span class="panelrow__sub">{peer.activity[lang.value]}</span>
              </span>
              <span class="panelrow__meta">{peer.age}</span>
            </div>
          ))
        )}
      </>
    );
  }
  return (
    <>
      <p class="panelhint">{t(hintKey[view])}</p>
      <p class="panelhint">{t(emptyKey[view])}</p>
    </>
  );
}
