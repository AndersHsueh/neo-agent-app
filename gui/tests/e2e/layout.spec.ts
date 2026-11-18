/**
 * @gui 视觉夹具。不连真实 Hub。
 * 顶栏中文不能按字折行；窄宽度整组收成图标。空态 / 占位 / 元信息对比度要过线。
 */
import { appendFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { openVisualFixture } from "./helpers";

const WIDTHS = [1024, 1280] as const;
const LANGS = ["zh", "en"] as const;

interface LabelProbe {
  text: string;
  folded: boolean;
  lines: number;
  clipped: boolean;
}

interface ContrastProbe {
  name: string;
  fontSize: number;
  ratio: number;
  fg: string;
  bg: string;
}

interface FixtureProbe {
  topbarOverflow: boolean;
  labels: LabelProbe[];
  icons: number;
  contrast: ContrastProbe[];
  sidebarHeading: string;
  eyebrows: string[];
  agent: string;
}

test.describe("视觉夹具 · 顶栏与对比度", () => {
  for (const width of WIDTHS) {
    for (const lang of LANGS) {
      test(`@gui ${lang} ${width}px 顶栏不按字折行，正文对比度够`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await openVisualFixture(page, lang);

        const probe = await page.evaluate(() => {
          const parse = (color: string): [number, number, number, number] => {
            const match = color.match(/rgba?\(([^)]+)\)/);
            if (!match?.[1]) return [0, 0, 0, 0];
            const parts = match[1].split(",").map((part) => Number.parseFloat(part.trim()));
            return [
              parts[0] ?? 0,
              parts[1] ?? 0,
              parts[2] ?? 0,
              parts.length > 3 ? (parts[3] ?? 1) : 1,
            ];
          };
          const composite = (
            fg: [number, number, number, number],
            bg: [number, number, number],
          ): [number, number, number] => {
            const a = fg[3];
            return [
              fg[0] * a + bg[0] * (1 - a),
              fg[1] * a + bg[1] * (1 - a),
              fg[2] * a + bg[2] * (1 - a),
            ];
          };
          const rel = (channel: number) => {
            const c = channel / 255;
            return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
          };
          const backdrop = (el: Element): [number, number, number] => {
            const stack: Element[] = [];
            let node: Element | null = el;
            while (node) {
              stack.push(node);
              node = node.parentElement;
            }
            let bg: [number, number, number] = [243, 238, 230];
            for (const item of stack.reverse()) {
              const parsed = parse(getComputedStyle(item).backgroundColor);
              if (parsed[3] > 0) bg = composite(parsed, bg);
            }
            return bg;
          };
          const ratioOf = (fg: [number, number, number], bg: [number, number, number]) => {
            const lum = (rgb: [number, number, number]) =>
              0.2126 * rel(rgb[0]) + 0.7152 * rel(rgb[1]) + 0.0722 * rel(rgb[2]);
            const hi = Math.max(lum(fg), lum(bg));
            const lo = Math.min(lum(fg), lum(bg));
            return (hi + 0.05) / (lo + 0.05);
          };

          const topbar = document.querySelector(".topbar");
          const labels: LabelProbe[] = [];
          for (const el of document.querySelectorAll(".seg__label, .chipbtn__label")) {
            const cs = getComputedStyle(el);
            const folded = cs.display === "none" || cs.visibility === "hidden";
            const range = document.createRange();
            range.selectNodeContents(el);
            const rects = folded ? [] : [...range.getClientRects()];
            const box = el.getBoundingClientRect();
            labels.push({
              text: (el.textContent ?? "").trim(),
              folded,
              lines: rects.length,
              clipped: !folded && (el.scrollWidth > el.clientWidth + 1 || box.height > 22),
            });
          }

          const contrastOf = (el: Element | null, name: string, pseudo?: string): ContrastProbe => {
            if (!el) return { name, fontSize: 0, ratio: 0, fg: "", bg: "" };
            const cs = getComputedStyle(el, pseudo);
            const fgParsed = parse(cs.color);
            const opacity = Number.parseFloat(cs.opacity || "1");
            const bg = backdrop(el);
            const fg = composite(
              [fgParsed[0], fgParsed[1], fgParsed[2], fgParsed[3] * opacity],
              bg,
            );
            return {
              name,
              fontSize: Number.parseFloat(cs.fontSize),
              ratio: ratioOf(fg, bg),
              fg: cs.color,
              bg: `rgb(${bg.map((n) => Math.round(n)).join(",")})`,
            };
          };

          return {
            topbarOverflow: topbar ? topbar.scrollWidth > topbar.clientWidth + 1 : true,
            labels,
            icons: document.querySelectorAll(".topbar .seg svg.icon").length,
            contrast: [
              contrastOf(document.querySelector(".empty__word"), "empty.word"),
              contrastOf(document.querySelector(".empty__sub"), "empty.sub"),
              contrastOf(document.querySelector(".empty__hint"), "empty.hint"),
              contrastOf(document.querySelector("#input"), "placeholder", "::placeholder"),
              contrastOf(document.querySelector(".sessionhead__meta"), "session.meta"),
              contrastOf(document.querySelector(".underbar__aphorism"), "underbar"),
            ],
            sidebarHeading: (
              document.querySelector(".sidebar__headline .eyebrow")?.textContent ?? ""
            ).trim(),
            eyebrows: [...document.querySelectorAll("#aside .eyebrow")].map((el) =>
              (el.textContent ?? "").trim(),
            ),
            agent: (document.querySelector(".agent .eyebrow")?.textContent ?? "").trim(),
          } satisfies FixtureProbe;
        });

        expect(probe.topbarOverflow, "topbar overflow").toBe(false);
        expect(probe.icons).toBe(4);
        for (const label of probe.labels) {
          if (label.folded) continue;
          expect(label.lines, label.text).toBe(1);
          expect(label.clipped, label.text).toBe(false);
          expect(label.text.length, label.text).toBeGreaterThan(1);
        }
        const visible = probe.labels.filter((label) => !label.folded);
        if (width >= 1280) expect(visible.length).toBeGreaterThan(0);

        for (const sample of probe.contrast) {
          const floor = sample.fontSize >= 24 ? 3 : 4.5;
          expect(
            sample.ratio,
            `${sample.name} ${sample.ratio.toFixed(2)} ${sample.fg} on ${sample.bg}`,
          ).toBeGreaterThanOrEqual(floor);
        }

        if (lang === "zh") {
          expect(probe.sidebarHeading).toBe("会话");
          expect(probe.sidebarHeading).not.toContain("构造");
          expect(probe.agent).toBe("智能体");
          expect(probe.eyebrows).toContain("提供方");
          expect(probe.eyebrows).toContain("会话");
          expect(probe.eyebrows.join(" ")).not.toMatch(/PROVIDER|SESSION/);
        } else {
          expect(probe.sidebarHeading.toLowerCase()).toBe("sessions");
          expect(probe.agent).toBe("AGENT");
          expect(probe.eyebrows).toContain("Provider");
          expect(probe.eyebrows).toContain("Session");
        }

        appendFileSync(
          "/tmp/neo-contrast.jsonl",
          `${JSON.stringify({
            lang,
            width,
            visible: visible.map((label) => label.text),
            folded: probe.labels.filter((label) => label.folded).map((label) => label.text),
            contrast: probe.contrast.map((sample) => ({
              name: sample.name,
              ratio: Number(sample.ratio.toFixed(2)),
              fg: sample.fg,
              bg: sample.bg,
            })),
          })}\n`,
        );
      });
    }
  }
});
