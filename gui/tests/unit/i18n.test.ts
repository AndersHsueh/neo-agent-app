import { describe, expect, test } from "vitest";
import { lang, setLang, t } from "@/i18n";
import { en, zh } from "@/i18n/dictionaries";

describe("i18n dictionaries", () => {
  test("中英 key 集合完全一致（类型之外再兜一层）", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort());
  });

  test("没有空文案，也没有把 key 当文案", () => {
    for (const [key, value] of Object.entries(zh)) {
      expect(value.trim().length, key).toBeGreaterThan(0);
      expect(value, key).not.toBe(key);
    }
    for (const [key, value] of Object.entries(en)) {
      expect(value.trim().length, key).toBeGreaterThan(0);
      expect(value, key).not.toBe(key);
    }
  });

  test("关键 UI 文案两种语言都存在且不含中文残留在英文里", () => {
    const cjk = /[\u4e00-\u9fff]/;
    const allow = new Set([
      "login.hint",
      "palette.action.lang",
      "settings.classifier.toolinfo",
      "settings.classifier.show",
    ]);
    for (const [key, value] of Object.entries(en)) {
      if (allow.has(key)) continue;
      expect(cjk.test(value), `${key}: ${value}`).toBe(false);
    }
  });

  test("插值可用", () => {
    setLang("zh");
    expect(t("time.min", { n: 3 })).toContain("3");
    setLang("en");
    expect(t("time.min", { n: 3 })).toContain("3");
    setLang("zh");
  });

  test("切换语言会写 document.lang", () => {
    setLang("en");
    expect(document.documentElement.lang).toBe("en");
    setLang("zh");
    expect(document.documentElement.lang).toBe("zh-Hans");
    expect(lang.value).toBe("zh");
  });
});
