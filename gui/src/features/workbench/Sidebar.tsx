import { Icon } from "@/components/Icon.tsx";
import { IconButton } from "@/components/primitives.tsx";
import { lang, t } from "@/i18n";
import { hubLabel } from "@/lib/endpoints.ts";
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
          <IconButton icon="plus-cell" title={t("nav.new")} onClick={() => void createSession()} />
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
        <div class="peers">
          {store.peers.value.map((peer) => (
            <div class="peer" key={peer.name}>
              <i class={`led ${STATUS_LED[peer.status] ?? "led--dim"}`} />
              <span class="peer__name">{peer.name}</span>
              <span class="peer__act">{peer.activity[lang.value]}</span>
            </div>
          ))}
        </div>
        <div class="hubmeta">
          <i class="led led--live" />
          <span class="mono">HUB · {hubLabel()}</span>
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
  if (view === "peers") {
    return (
      <>
        <p class="panelhint">{t(hintKey[view])}</p>
        {store.peers.value.map((peer) => (
          <div class="panelrow" key={peer.name}>
            <i class={`led ${STATUS_LED[peer.status] ?? "led--dim"}`} />
            <span class="panelrow__main">
              {peer.name}
              <span class="panelrow__sub">{peer.activity[lang.value]}</span>
            </span>
            <span class="panelrow__meta">{peer.age}</span>
          </div>
        ))}
      </>
    );
  }
  const rows =
    view === "memory"
      ? [
          {
            title: lang.value === "zh" ? "别名归一化放在分发入口" : "Normalize aliases at dispatch",
            meta: "2026-10-27",
          },
          { title: "login shell resets PATH", meta: "2026-10-25" },
          {
            title:
              lang.value === "zh"
                ? "测试不得依赖开发机 locale"
                : "tests must not depend on dev locale",
            meta: "2026-10-24",
          },
        ]
      : view === "wiki"
        ? [
            { title: "neo-开发驿站", meta: "42" },
            { title: "shell 解释器写死", meta: "18" },
            { title: "空正文自动重试", meta: "12" },
          ]
        : [
            { title: "coding", meta: "core" },
            { title: "minimax-docx", meta: "on demand" },
            { title: "web-perf", meta: "on demand" },
          ];
  return (
    <>
      <p class="panelhint">{t(hintKey[view])}</p>
      {rows.map((row) => (
        <div class="panelrow" key={row.title}>
          <Icon name={view === "memory" ? "memory" : view === "wiki" ? "wiki" : "skills"} />
          <span class="panelrow__main">{row.title}</span>
          <span class="panelrow__meta">{row.meta}</span>
        </div>
      ))}
    </>
  );
}
