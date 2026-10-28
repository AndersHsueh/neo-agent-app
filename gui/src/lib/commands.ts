/**
 * lib/commands.ts — 斜杠命令目录的适配层（唯一真源是 `protocol/commands.json`）。
 *
 * 目录由 core 的 `commands:gen` 生成、GUI vendor 后只读消费；这里**不维护第二份命令表**，
 * 只做三件事：
 *   1. 给 `/<name> <arg>` 算输入提示（required → `<arg>`，optional → `[arg]`）；
 *   2. 给中文 description 配一份英文映射（core 目录只带中文口径）；
 *   3. 把目录的 group 映射到 i18n key / 图标，供命令面板分组。
 */

import type { I18nKey, Lang } from "@/i18n";
import {
  COMMANDS_SCHEMA_VERSION,
  type CommandArgSpec,
  type CommandCatalog,
  type CommandCatalogEntry,
  type CommandGroup,
} from "@/protocol";
import catalogData from "@/protocol/commands.json";

/** vendor 进来的命令目录（`protocol/commands.json`） */
export const COMMAND_CATALOG = catalogData as CommandCatalog;

/** 目录 schema 与客户端期望不一致时为 true；升级时必须重新 vendor 命令目录 */
export const COMMAND_CATALOG_OUTDATED = COMMAND_CATALOG.schemaVersion !== COMMANDS_SCHEMA_VERSION;

/** core 目录里的全部命令（含别名），按目录顺序 */
export const COMMANDS: readonly CommandCatalogEntry[] = COMMAND_CATALOG.commands;

/**
 * 英文描述映射（core 目录的 `description` 只有中文口径）。
 * 新增命令时先补这里；查不到时回落到目录原文，避免面板出现空白。
 */
const EN_DESCRIPTIONS: Record<string, string> = {
  help: "List available commands",
  clear: "Clear context (keeps system prompt and session identity)",
  compact: "Compress history into a structured summary",
  context: "Context window, estimated usage and last compaction",
  cost: "Model, usage and cost (not priced in v0.0.x)",
  history: "Last 10 user messages",
  why: "Last tier routing decision (classifier)",
  auto: "Inspect or switch the auto-tier classifier",
  rename: "Rename this session",
  tier: "Inspect or switch the model tier",
  fast: "Switch to the fast tier",
  balanced: "Switch to the balanced tier",
  deep: "Switch to the deep reasoner tier",
  default: "Switch to the default tier",
  mode: "Inspect or switch the permission mode",
  provider: "Inspect or switch the provider",
  model: "Inspect or switch the model name",
  tools: "List tools available at runtime",
};

/** 命令描述（中英） */
export function commandDescription(entry: CommandCatalogEntry, lang: Lang): string {
  return lang === "en" ? (EN_DESCRIPTIONS[entry.name] ?? entry.description) : entry.description;
}

/** 面板分组标题的 i18n key（新 group 必须在 dictionaries 里补 key） */
export const COMMAND_GROUP_KEYS: Record<CommandGroup, I18nKey> = {
  session: "cmd.group.session",
  model: "cmd.group.model",
  tools: "cmd.group.tools",
  memory: "cmd.group.memory",
  wiki: "cmd.group.wiki",
  mailbox: "cmd.group.mailbox",
  maintenance: "cmd.group.maintenance",
};

/** 面板分组的图标（沿用 sprite 里已有的名字） */
export const COMMAND_GROUP_ICONS: Record<CommandGroup, string> = {
  session: "sessions",
  model: "chip",
  tools: "terminal",
  memory: "memory",
  wiki: "wiki",
  mailbox: "peers",
  maintenance: "settings",
};

const argHint = (arg: CommandArgSpec): string => (arg.required ? `<${arg.name}>` : `[${arg.name}]`);

/** `["tier"]` → `"[tier]"`；required → `"<title>"` */
export function argsHint(entry: CommandCatalogEntry): string {
  return entry.args.map(argHint).join(" ");
}

/** 命令的完整输入形状：`/tier [tier]`、`/rename <title>`、`/help` */
export function usageLine(entry: CommandCatalogEntry): string {
  const hint = argsHint(entry);
  return hint ? `/${entry.name} ${hint}` : `/${entry.name}`;
}

/** 参数的枚举值（用于 title 提示；没有枚举返回空串） */
export function argsDetail(entry: CommandCatalogEntry): string {
  return entry.args
    .filter((arg) => arg.enum?.length)
    .map((arg) => `${arg.name}: ${(arg.enum ?? []).join(" | ")}`)
    .join("；");
}

/** 命令缺参时给出人类可读的提示（required 参数名列表） */
export function missingRequiredArgs(entry: CommandCatalogEntry): string[] {
  return entry.args.filter((arg) => arg.required).map((arg) => arg.name);
}

/** 按 name 或 alias 查目录项（大小写不敏感，允许带前导 `/`） */
export function findCommand(raw: string): CommandCatalogEntry | undefined {
  const name = raw.replace(/^\/+/, "").trim().toLowerCase();
  if (!name) return undefined;
  return COMMANDS.find((entry) => entry.name === name || entry.aliases.includes(name));
}

export interface SlashQuery {
  /** 前导 `/` 之后的命令名（小写） */
  name: string;
  args: string[];
}

/** `/tier fast` → `{name:"tier", args:["fast"]}`；不是斜杠输入 → null */
export function parseSlashQuery(query: string): SlashQuery | null {
  const match = /^\/([a-zA-Z0-9_-]+)(?:\s+(.*))?$/.exec(query.trim());
  if (!match) return null;
  return {
    name: (match[1] ?? "").toLowerCase(),
    args: (match[2] ?? "")
      .split(/\s+/)
      .map((part) => part.trim())
      .filter(Boolean),
  };
}
