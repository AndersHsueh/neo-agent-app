import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { Icon } from "@/components/Icon.tsx";
import { Modal } from "@/components/Modal.tsx";
import { CommandResultCard } from "@/features/transcript/Blocks.tsx";
import { lang, t } from "@/i18n";
import {
  argsDetail,
  COMMAND_GROUP_ICONS,
  COMMAND_GROUP_KEYS,
  COMMANDS,
  commandDescription,
  findCommand,
  missingRequiredArgs,
  parseSlashQuery,
  usageLine,
} from "@/lib/commands.ts";
import type { CommandCatalogEntry } from "@/protocol";
import {
  type CommandOutcomeView,
  changeLang,
  createSession,
  logout,
  runCommand,
  selectSession,
} from "@/state/app.ts";
import { store } from "@/state/store.ts";

interface Item {
  group: string;
  label: string;
  sub?: string;
  icon: string;
  /** 悬停时的完整说明（参数枚举值等） */
  detail?: string;
  /** 目录里的命令项：执行时保留面板并展示结果 */
  command?: CommandCatalogEntry;
  /** 未知命令项：同样保留面板，让回执可见 */
  keepOpen?: boolean;
  run: () => void;
}

interface CommandRunResult {
  name: string;
  args: string[];
  outcome: CommandOutcomeView;
}

export function Palette() {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const [pending, setPending] = useState<{ name: string; args: string[] } | null>(null);
  const [result, setResult] = useState<CommandRunResult | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const close = () => (store.overlay.value = null);

  // 语言/会话列表是信号：在渲染期读取，切换语言时面板即时重排
  const language = lang.value;
  const sessions = store.sessions.value;
  const groupCommands = t("palette.group.commands");

  /** 执行目录命令：不关闭面板，把结构化结果渲染在面板底部 */
  const runCatalog = async (entry: CommandCatalogEntry, args: string[]) => {
    const missing = missingRequiredArgs(entry);
    if (missing.length > 0 && args.length < missing.length) {
      setResult({
        name: entry.name,
        args,
        outcome: {
          ok: false,
          blocks: [
            {
              kind: "notice",
              level: "warn",
              text: t("cmd.result.missingArgs", {
                args: missing.map((name) => `<${name}>`).join(" "),
              }),
            },
          ],
          error: { code: "protocol", message: "" },
        },
      });
      return;
    }
    setPending({ name: entry.name, args });
    setResult(null);
    const outcome = await runCommand(entry.name, args);
    setPending(null);
    setResult({
      name: entry.name,
      args,
      outcome: outcome ?? {
        ok: false,
        blocks: [{ kind: "notice", level: "error", text: t("cmd.result.noHub") }],
        error: { code: "internal", message: "" },
      },
    });
  };

  /** 输入了未知的 /command：照样提交给 hub，让它回显 unsupported */
  const runUnknown = async (name: string, args: string[]) => {
    setPending({ name, args });
    setResult(null);
    const outcome = await runCommand(name, args);
    setPending(null);
    setResult({
      name,
      args,
      outcome: outcome ?? {
        ok: false,
        blocks: [{ kind: "notice", level: "error", text: t("cmd.result.noHub") }],
        error: { code: "internal", message: "" },
      },
    });
  };

  const items = useMemo<Item[]>(() => {
    const list: Item[] = [];
    for (const session of sessions) {
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
        run: () => logout(),
      },
    );
    // 斜杠命令：唯一真源是 protocol/commands.json，这里只做分组与本地化文案
    for (const entry of COMMANDS) {
      const parsed = parseSlashQuery(query);
      const args =
        parsed && (parsed.name === entry.name || entry.aliases.includes(parsed.name))
          ? parsed.args
          : [];
      list.push({
        group: t(COMMAND_GROUP_KEYS[entry.group]),
        label: usageLine(entry),
        sub: commandDescription(entry, language),
        detail: argsDetail(entry) || undefined,
        icon: COMMAND_GROUP_ICONS[entry.group],
        command: entry,
        run: () => void runCatalog(entry, args),
      });
    }
    return list;
    // runCatalog/runUnknown 只依赖 setState 与 store 动作，是稳定闭包，不需要进依赖
  }, [query, language, sessions, groupCommands]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    const parsed = parseSlashQuery(query);
    const exact = parsed ? findCommand(parsed.name) : undefined;
    if (exact) {
      // `/tier fast`：只留 /tier，Enter 时把 fast 作为参数发出去
      const target = items.find((item) => item.command?.name === exact.name);
      if (target) return [target];
    }
    const matched = items.filter((item) =>
      `${item.group} ${item.label} ${item.sub ?? ""}`.toLowerCase().includes(q),
    );
    if (matched.length === 0 && parsed) {
      return [
        {
          group: groupCommands,
          label: `/${parsed.name}`,
          sub: t("palette.unknownCmd"),
          icon: "alert",
          keepOpen: true,
          run: () => void runUnknown(parsed.name, parsed.args),
        } satisfies Item,
      ];
    }
    return matched;
  }, [items, query, groupCommands]);

  useEffect(() => setCursor(0), [query]);
  useEffect(() => {
    const node = input.current;
    if (!node) return;
    node.focus();
  }, []);

  const run = (index: number) => {
    const item = filtered[index];
    if (!item) return;
    if (!item.command && !item.keepOpen) close();
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
      <div
        class={`palette${pending || result ? " has-result" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={t("rail.palette")}
      >
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
                    title={item.detail}
                    onMouseMove={() => setCursor(index)}
                    onClick={() => run(index)}
                  >
                    <Icon name={item.icon} />
                    <span class="palette__label">{item.label}</span>
                    {item.sub ? (
                      <span class={`palette__sub${item.command ? " palette__cmddesc" : ""}`}>
                        {item.sub}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
        {pending || result ? (
          <div class="palette__result">
            {pending ? (
              <div class="cmdresult is-pending">
                <div class="cmdresult__head">
                  <Icon name="command-key" class="icon icon--xs" />
                  <span class="cmdresult__name">
                    /{pending.name}
                    {pending.args.length ? ` ${pending.args.join(" ")}` : ""}
                  </span>
                  <span class="cmdresult__state">{t("cmd.result.running")}</span>
                </div>
              </div>
            ) : result ? (
              <CommandResultCard name={result.name} args={result.args} outcome={result.outcome} />
            ) : null}
          </div>
        ) : null}
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
