import { store } from "@/state/store.ts";
import { Icon } from "./Icon.tsx";

export function Toasts() {
  return (
    <div class="toasts" aria-live="polite">
      {store.toasts.value.map((toast) => (
        <div
          key={toast.id}
          class={`toast${toast.kind === "warn" ? " toast--warn" : ""}${toast.kind === "danger" ? " toast--danger" : ""}`}
        >
          <Icon name={toast.kind === "ok" ? "check" : toast.kind === "warn" ? "alert" : "x"} />
          <span>{toast.text}</span>
          {toast.sub ? <span class="toast__sub">{toast.sub}</span> : null}
        </div>
      ))}
    </div>
  );
}
