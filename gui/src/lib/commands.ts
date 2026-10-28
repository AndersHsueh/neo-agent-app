/** 斜杠命令目录（与 neo CLI 的 src/input/commands.ts 同名同义；GUI 只做入口） */
export interface CommandEntry {
  name: string;
  description: { zh: string; en: string };
}

export const COMMANDS: CommandEntry[] = [
  { name: "help", description: { zh: "帮助", en: "Help" } },
  { name: "clear", description: { zh: "清空上下文", en: "Clear context" } },
  { name: "compact", description: { zh: "压缩上下文", en: "Compact context" } },
  { name: "cost", description: { zh: "token 与成本统计", en: "Token & cost stats" } },
  { name: "context", description: { zh: "上下文用量", en: "Context usage" } },
  { name: "export", description: { zh: "导出会话 Markdown", en: "Export as Markdown" } },
  { name: "provider", description: { zh: "切换 provider", en: "Switch provider" } },
  { name: "tier", description: { zh: "切换模型档位", en: "Switch tier" } },
  {
    name: "deep",
    description: { zh: "快捷：/tier deep_reasoning", en: "Shortcut: /tier deep_reasoning" },
  },
  { name: "balanced", description: { zh: "快捷：/tier balanced", en: "Shortcut: /tier balanced" } },
  { name: "fast", description: { zh: "快捷：/tier fast", en: "Shortcut: /tier fast" } },
  { name: "default", description: { zh: "快捷：/tier default", en: "Shortcut: /tier default" } },
  { name: "auto", description: { zh: "分类器模式", en: "Classifier mode" } },
  { name: "why", description: { zh: "上次分类判定", en: "Last routing decision" } },
  { name: "model", description: { zh: "查看 / 切换模型", en: "Inspect / switch model" } },
  { name: "tools", description: { zh: "工具列表", en: "Tool inventory" } },
  { name: "env", description: { zh: "环境快照", en: "Environment snapshot" } },
  { name: "peers", description: { zh: "跨会话状态", en: "Cross-session status" } },
  { name: "inbox", description: { zh: "查看 held 消息", en: "Inspect held messages" } },
  { name: "rename", description: { zh: "设置会话名字", en: "Name this session" } },
  { name: "goal", description: { zh: "目标锚", en: "Goal anchor" } },
  { name: "skills", description: { zh: "技能列表", en: "Skills" } },
  { name: "wiki-lint", description: { zh: "wiki 体检", en: "Wiki health check" } },
  { name: "ingest", description: { zh: "编译 wiki", en: "Compile wiki" } },
  { name: "mode", description: { zh: "权限模式", en: "Permission mode" } },
  { name: "memory", description: { zh: "记忆状态", en: "Memory status" } },
  { name: "remember", description: { zh: "写入一条记忆", en: "Capture a memory" } },
  { name: "sessions", description: { zh: "列出会话", en: "List sessions" } },
  { name: "exit", description: { zh: "退出", en: "Quit" } },
];

export const commandDescription = (entry: CommandEntry, lang: "zh" | "en"): string =>
  entry.description[lang];
