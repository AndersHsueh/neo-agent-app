/**
 * features/boot/Boot.tsx — 开机序列（一次性的仪式，可跳过）。
 * 代码雨 → 标记 → NEO 字标 → Agent 身份名变幻 → 格言 → 幕布上提。
 */
import { useEffect, useRef, useState } from "preact/hooks";
import { lang, t } from "@/i18n";
import { pickAphorism } from "@/lib/aphorisms.ts";
import { morphText, reducedMotion, startRain } from "@/lib/fx.ts";

const STEPS = [
  { at: 120, key: "rain" },
  { at: 260, key: "mark" },
  { at: 460, key: "word" },
  { at: 820, key: "ident" },
  { at: 1280, key: "aphorism" },
  { at: 2100, key: "leave" },
] as const;

export function Boot({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<Record<string, boolean>>({});
  const [leaving, setLeaving] = useState(false);
  const [done, setDone] = useState(false);
  const identity = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (reducedMotion()) {
      setDone(true);
      onDone();
      return;
    }
    const rain = canvas.current ? startRain(canvas.current) : null;
    const timers = STEPS.map((step) =>
      setTimeout(() => {
        if (step.key === "leave") {
          setLeaving(true);
          setTimeout(() => {
            setDone(true);
            onDone();
          }, 420);
          return;
        }
        setPhase((p) => ({ ...p, [step.key]: true }));
        if (step.key === "ident" && identity.current) {
          identity.current.textContent = "Agent: Mr. Andersson";
          setTimeout(() => {
            if (identity.current) void morphText(identity.current, "Agent: NEO", 620);
          }, 360);
        }
      }, step.at),
    );
    return () => {
      timers.forEach(clearTimeout);
      rain?.destroy();
    };
  }, [onDone]);

  const finish = () => {
    if (done) return;
    setLeaving(true);
    setTimeout(() => {
      setDone(true);
      onDone();
    }, 240);
  };

  useEffect(() => {
    window.addEventListener("keydown", finish, { once: true });
    return () => window.removeEventListener("keydown", finish);
  });

  if (done) return null;
  const aphorism = pickAphorism(0);
  const quote = lang.value === "zh" ? aphorism.zh : aphorism.en;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: 点击任意处跳过开机动画
    // biome-ignore lint/a11y/useKeyWithClickEvents: 任意按键已在 window 上监听
    <div
      class={`boot${leaving ? " is-leaving" : ""}${phase.rain ? " is-rain" : ""}${phase.mark ? " is-mark" : ""}${phase.word ? " is-word" : ""}${phase.ident ? " is-ident is-run" : ""}${phase.aphorism ? " is-aph is-skip" : ""}`}
      onClick={finish}
    >
      <canvas class="boot__rain" ref={canvas} />
      <div class="boot__corner boot__corner--l">OPERATOR CONSOLE</div>
      <div class="boot__corner boot__corner--r">MATRIX · V0.1</div>
      <div class="boot__inner">
        <div class="boot__mark">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <use href="#i-logo" />
          </svg>
        </div>
        <div class="boot__word" aria-hidden="true">
          <span>N</span>
          <span>E</span>
          <span>O</span>
        </div>
        <div class="boot__identity" ref={identity} />
        <div class="boot__aphorism">
          {phase.aphorism ? (
            <>
              <span>{quote}</span>
              <cite>{aphorism.src}</cite>
            </>
          ) : null}
        </div>
        <div class="boot__progress">
          <i />
        </div>
        <button class="boot__skip" type="button" onClick={finish}>
          {t("boot.skip")}
        </button>
      </div>
    </div>
  );
}
