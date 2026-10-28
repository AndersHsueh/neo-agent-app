/** 设计系统原子组件：只吃 props，不读 store、不发请求。 */
import type { ComponentChildren } from "preact";
import { Icon } from "./Icon.tsx";

export function Button({
  variant = "ghost",
  size = "md",
  icon,
  children,
  onClick,
  disabled,
  title,
  type = "button",
  class: className = "",
}: {
  variant?: "primary" | "ghost" | "danger" | "quiet";
  size?: "md" | "sm";
  icon?: string;
  children?: ComponentChildren;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  type?: "button" | "submit";
  class?: string;
}) {
  return (
    <button
      type={type}
      class={`btn btn--${variant}${size === "sm" ? " btn--sm" : ""} ${className}`.trim()}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {icon ? <Icon name={icon} class="icon icon--xs" /> : null}
      {children}
    </button>
  );
}

export function IconButton({
  icon,
  title,
  onClick,
  active = false,
  class: className = "",
  disabled,
  dataAction,
}: {
  icon: string;
  title: string;
  onClick?: () => void;
  active?: boolean;
  class?: string;
  disabled?: boolean;
  /** 稳定测试钩子（e2e 用，不参与样式） */
  dataAction?: string;
}) {
  return (
    <button
      type="button"
      class={`iconbtn${active ? " is-on" : ""} ${className}`.trim()}
      title={title}
      aria-label={title}
      data-action={dataAction}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon name={icon} />
    </button>
  );
}

export function Kbd({ children }: { children: ComponentChildren }) {
  return <kbd class="kbd">{children}</kbd>;
}

export function Tag({
  children,
  tone = "plain",
}: {
  children: ComponentChildren;
  tone?: "plain" | "accent" | "warn" | "danger";
}) {
  return <span class={`tag${tone === "plain" ? "" : ` tag--${tone}`}`}>{children}</span>;
}

export function Toggle({
  on,
  label,
  hint,
  onChange,
  keyLabel,
}: {
  on: boolean;
  label: string;
  hint?: string;
  onChange: () => void;
  keyLabel?: string;
}) {
  return (
    <div class="togrow">
      <span class="togrow__label">
        {label}
        {keyLabel ? <code class="togrow__key">{keyLabel}</code> : null}
        {hint ? <span class="togrow__hint">{hint}</span> : null}
      </span>
      <button
        type="button"
        class={`tog${on ? " is-on" : ""}`}
        aria-pressed={on}
        aria-label={label}
        onClick={onChange}
      >
        <i />
      </button>
    </div>
  );
}

export function ProgressRing({
  pct,
  label,
  compactPct,
}: {
  pct: number;
  label: string;
  compactPct: number;
}) {
  const radius = 33;
  const circumference = 2 * Math.PI * radius;
  return (
    <div
      class="ring"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={label}
    >
      <svg class="ring__svg" viewBox="0 0 78 78" role="img">
        <title>{label}</title>
        <circle class="ring__track" cx="39" cy="39" r={radius} />
        <circle
          class="ring__val"
          cx="39"
          cy="39"
          r={radius}
          stroke-dasharray={circumference}
          stroke-dashoffset={circumference - (pct / 100) * circumference}
        />
        <line
          class="ring__mark"
          x1="39"
          y1="2"
          x2="39"
          y2="9"
          transform={`rotate(${(compactPct / 100) * 360} 39 39)`}
        />
      </svg>
      <div class="ring__center">
        <span class="ring__pct">{pct}%</span>
        <span class="ring__unit">CTX</span>
      </div>
    </div>
  );
}

export function Field({
  label,
  keyName,
  children,
  hint,
  wide = false,
  htmlFor,
}: {
  label: string;
  keyName?: string;
  children: ComponentChildren;
  hint?: string;
  wide?: boolean;
  htmlFor?: string;
}) {
  const Wrapper = htmlFor ? "label" : "div";
  return (
    <Wrapper class={`field${wide ? " field--wide" : ""}`} htmlFor={htmlFor}>
      <span class="field__label">
        <span class="field__main">{label}</span>
        {keyName ? <code>{keyName}</code> : null}
      </span>
      {children}
      {hint ? <span class="field__hint">{hint}</span> : null}
    </Wrapper>
  );
}
