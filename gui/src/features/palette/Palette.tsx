import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { Icon } from "@/components/Icon.tsx";
import { Modal } from "@/components/Modal.tsx";
import { lang, t } from "@/i18n";
import { COMMANDS } from "@/lib/commands.ts";
import { modeName, TIER_ICONS, tierName } from "@/lib/tiers.ts";
import { MODES, TIERS } from "@/protocol";
import {
  changeLang,
  createSession,
  logout,
  runCommand,
  selectSession,
  setMode,
  setTier,
} from "@/state/app.ts";
import { store } from "@/state/store.ts";

interface Item {
  group: string;
  label: string;
  sub?: string;
  icon: string;
  run: () => void;
}

export function Palette() {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const close = () => (store.overlay.value = null);

  const items = useMemo<Item[]>(() => {
    const list: Item[] = [];
    for (const session of store.sessions.value) {
      list.push({
        group: t("palette.group.recent"),
        label: session.title,
        sub: session.id,
        icon: "sessions",
        run: () => void selectSession(session.id),
      });
    }
    list.push(
      {
        group: t("palette.group.actions"),
        label: t("palette.action.new"),
        sub: "⌘N",
        icon: "plus-cell",
        run: () => void createSession(),
      },
      {
        group: t("palette.group.actions"),
        label: t("palette.action.settings"),
        sub: "⌘,",
        icon: "settings",
        run: () => (store.overlay.value = "settings"),
      },
      {
        group: t("palette.group.actions"),
        label: t("palette.action.shortcuts"),
        sub: "⌘/",
        icon: "keyboard",
        run: () => (store.overlay.value = "shortcuts"),
      },
      {
        group: t("palette.group.actions"),
        label: t("palette.action.aside"),
        sub: "⌘B",
        icon: "panel",
        run: () => (store.asideOpen.value = !store.asideOpen.value),
      },
      {
        group: t("palette.group.actions"),
        label: t("palette.action.lang"),
        icon: "globe",
        run: () => changeLang(lang.value === "zh" ? "en" : "zh"),
      },
      {
        group: t("palette.group.actions"),
        label: t("login.logout"),
        icon: "x",
        run: () => void logout(),
      },
    );
    for (const tier of TIERS) {
      list.push({
        group: t("palette.group.tier"),
        label: `/${tier === "deep_reasoning" ? "deep" : tier}`,
        sub: tierName(tier),
        icon: TIER_ICONS[tier],
        run: () => void setTier(tier),
      });
    }
    for (const mode of MODES) {
      list.push({
        group: t("palette.group.mode"),
        label: modeName(mode),
        sub: t(`mode.${mode}.desc`),
        icon: "shield",
        run: () => setMode(mode),
      });
    }
    for (const command of COMMANDS) {
      list.push({
        group: lang.value === "zh" ? "斜杠命令" : "SLASH COMMANDS",
        label: `/${command.name}`,
        sub: command.description[lang.value],
        icon: "command-key",
        run: () => {
          if (["deep", "balanced", "fast", "default"].includes(command.name)) {
            void runCommand(command.name);
          } else if (command.name === "tier") {
            void runCommand("tier", ["balanced"]);
          } else {
            void runCommand(command.name);
          }
        },
      });
    }
    return list;
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) =>
      `${item.group} ${item.label} ${item.sub ?? ""}`.toLowerCase().includes(q),
    );
  }, [items, query]);

  useEffect(() => setCursor(0), [query]);
  useEffect(() => {
    const node = input.current;
    if (!node) return;
    node.focus();
  }, []);

  const run = (index: number) => {
    const item = filtered[index];
    if (!item) return;
    close();
    item.run();
  };

  const groups: { group: string; items: { item: Item; index: number }[] }[] = [];
  filtered.forEach((item, index) => {
    const last = groups[groups.length - 1];
    if (last && last.group === item.group) last.items.push({ item, index });
    else groups.push({ group: item.group, items: [{ item, index }] });
  });

  return (
    <Modal onClose={close} class="layer--top" initialFocus="#palette-input">
      <div class="palette" role="dialog" aria-modal="true" aria-label={t("rail.palette")}>
        <div class="palette__top">
          <Icon name="search" />
          <input
            id="palette-input"
            ref={input}
            class="palette__input"
            value={query}
            placeholder={t("palette.placeholder")}
            onInput={(event) => setQuery((event.target as HTMLInputElement).value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setCursor((c) => Math.min(filtered.length - 1, c + 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setCursor((c) => Math.max(0, c - 1));
              } else if (event.key === "Enter") {
                event.preventDefault();
                run(cursor);
              }
            }}
          />
          <kbd class="kbd">esc</kbd>
        </div>
        <div class="palette__list">
          {filtered.length === 0 ? (
            <div class="palette__empty">{t("palette.empty")}</div>
          ) : (
            groups.map((group) => (
              <div key={group.group}>
                <div class="palette__group">{group.group}</div>
                {group.items.map(({ item, index }) => (
                  <button
                    key={`${group.group}-${item.label}`}
                    type="button"
                    class={`palette__item${index === cursor ? " is-active" : ""}`}
                    onMouseMove={() => setCursor(index)}
                    onClick={() => run(index)}
                  >
                    <Icon name={item.icon} />
                    <span class="palette__label">{item.label}</span>
                    {item.sub ? <span class="palette__sub">{item.sub}</span> : null}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
        <div class="palette__foot">
          <span>
            <kbd class="kbd">↑↓</kbd>
            {t("palette.hint.nav")}
          </span>
          <span>
            <kbd class="kbd">↩</kbd>
            {t("palette.hint.enter")}
          </span>
          <span>
            <kbd class="kbd">esc</kbd>
            {lang.value === "zh" ? "关闭" : "close"}
          </span>
          <span style="margin-left:auto">NEO · OPERATOR CONSOLE</span>
        </div>
      </div>
    </Modal>
  );
}
