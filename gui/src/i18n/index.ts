/**
 * i18n/index.ts — 语言状态与 t()。
 *
 * 语言是全局偏好（localStorage + ?lang= + navigator），切换不重载页面。
 * 字典是类型化的：少一个 key 编译期就红；运行时再跑一次奇偶校验（测试里）。
 */

import { signal } from "@preact/signals";
import { en, zh } from "./dictionaries.ts";

export type Lang = "zh" | "en";
export type I18nKey = keyof typeof zh;

const STORAGE_KEY = "neo.lang";

function detect(): Lang {
  const fromUrl = new URLSearchParams(location.search).get("lang");
  if (fromUrl === "zh" || fromUrl === "en") return fromUrl;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "zh" || stored === "en") return stored;
  return (navigator.language || "zh").startsWith("zh") ? "zh" : "en";
}

export const lang = signal<Lang>(detect());

export function setLang(next: Lang): void {
  lang.value = next;
  localStorage.setItem(STORAGE_KEY, next);
  document.documentElement.lang = next === "zh" ? "zh-Hans" : "en";
  document.documentElement.dataset.lang = next;
}

setLang(lang.value);

export function t(key: I18nKey, vars?: Record<string, string | number>): string {
  const dict = lang.value === "zh" ? zh : en;
  let out: string = dict[key] ?? zh[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v));
  }
  return out;
}

export function toggleLang(): void {
  setLang(lang.value === "zh" ? "en" : "zh");
}

export { en, zh };
