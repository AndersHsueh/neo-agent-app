import { useEffect, useRef, useState } from "preact/hooks";
import { Icon } from "@/components/Icon.tsx";
import { t } from "@/i18n";
import {
  dataUrlOf,
  MAX_IMAGES,
  type PendingImage,
  readImageFile,
  toAttachmentInput,
} from "@/lib/attachments.ts";
import { TIER_KEYS, tierName } from "@/lib/tiers.ts";
import { abortTurn, refreshUsage, sendMessage } from "@/state/app.ts";
import { activeMeta, activeSession, pendingQuestion, pushToast, store } from "@/state/store.ts";

export function Composer() {
  const [text, setText] = useState("");
  const [images, setImages] = useState<PendingImage[]>([]);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const state = activeSession.value;
  const meta = activeMeta.value;
  const busy = Boolean(state?.streaming.turnActive) || state?.meta.status === "working";
  const question = pendingQuestion.value;
  const context = state?.context;
  const pct = context ? Math.min(100, Math.round((context.used / context.limit) * 100)) : 0;
  const supportsImages = store.capabilities.value.includes("attachments.image");

  useEffect(() => {
    const node = textarea.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, 220)}px`;
  }, [text]);

  const addFiles = async (files: File[]): Promise<void> => {
    if (!files.length) return;
    const accepted: PendingImage[] = [];
    for (const file of files) {
      if (images.length + accepted.length >= MAX_IMAGES) {
        pushToast(t("composer.attach.tooMany"), { kind: "warn" });
        break;
      }
      const result = await readImageFile(file);
      if (!result.ok) {
        pushToast(
          t(result.reason === "size" ? "composer.attach.tooBig" : "composer.attach.rejected"),
          { kind: "warn" },
        );
        continue;
      }
      accepted.push(result.image);
    }
    if (accepted.length) setImages((prev) => [...prev, ...accepted]);
  };

  const submit = () => {
    const body = text.trim();
    if ((!body && images.length === 0) || busy) return;
    sendMessage(body, undefined, images.map(toAttachmentInput));
    setText("");
    setImages([]);
    void refreshUsage("session");
  };

  return (
    <div class="composer-dock">
      <div class={`composer${text.trim() ? " is-ready" : ""}${busy ? " is-working" : ""}`}>
        {question ? (
          <div class="composer__notices">
            <i class="led led--warn led--pulse" />
            <span>{t("question.keys")}</span>
          </div>
        ) : null}
        {images.length ? (
          <div class="attachrow" data-role="attach-preview">
            {images.map((image) => (
              <div class="attach" key={image.id}>
                <img class="attach__thumb" src={dataUrlOf(image)} alt={image.name} />
                <button
                  class="attach__remove"
                  type="button"
                  data-remove={image.id}
                  title={t("composer.attach.remove")}
                  onClick={() => setImages((prev) => prev.filter((x) => x.id !== image.id))}
                >
                  <Icon name="x" class="icon icon--xs" />
                </button>
              </div>
            ))}
            <span class="attachrow__count mono">
              {t("composer.attach.count", { n: images.length, max: MAX_IMAGES })}
            </span>
          </div>
        ) : null}
        <div class="composer__editor">
          <textarea
            ref={textarea}
            id="input"
            rows={1}
            spellcheck={false}
            placeholder={t("composer.placeholder")}
            value={text}
            onInput={(event) => {
              const value = (event.target as HTMLTextAreaElement).value;
              setText(value);
              if (value === "/") {
                setText("");
                store.overlay.value = "palette";
              }
            }}
            onPaste={(event) => {
              const files = Array.from(event.clipboardData?.files ?? []);
              const imgs = files.filter((f) => f.type.startsWith("image/"));
              if (imgs.length) {
                event.preventDefault();
                void addFiles(imgs);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
                event.preventDefault();
                submit();
              }
            }}
          />
        </div>
        <div class="composer__toolbar">
          <div class="composer__tools">
            <button class="toolbtn" type="button" onClick={() => alertNotWired(t("composer.file"))}>
              <Icon name="at" class="icon icon--xs" />
              <span>{t("composer.file")}</span>
            </button>
            <button class="toolbtn" type="button" onClick={() => (store.overlay.value = "palette")}>
              <Icon name="command-key" class="icon icon--xs" />
              <span>{t("composer.command")}</span>
            </button>
            <button
              class="toolbtn"
              type="button"
              data-action="attach-image"
              title={t("composer.attach.title")}
              disabled={!supportsImages}
              onClick={() => fileInput.current?.click()}
            >
              <Icon name="attach" class="icon icon--xs" />
              <span>{t("composer.image")}</span>
            </button>
            <input
              ref={fileInput}
              data-role="image-input"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              hidden
              onChange={(event) => {
                const input = event.target as HTMLInputElement;
                void addFiles(Array.from(input.files ?? []));
                input.value = "";
              }}
            />
          </div>
          <div class="composer__submit">
            <span class="composer__hint mono">{t("composer.sendHint")}</span>
            <button
              class="sendbtn"
              type="button"
              title={busy ? t("composer.workingHint") : t("composer.send")}
              onClick={() => (busy ? abortTurn() : submit())}
            >
              <Icon name={busy ? "stop" : "send"} />
            </button>
          </div>
        </div>
        <div class="composer__bar">
          <div class="ctxbar" title={t("composer.context")}>
            <i class="ctxbar__fill" style={{ width: `${pct}%` }} />
            <b class="ctxbar__mark" />
          </div>
          <span class="mono dim" id="ctx-label">
            {pct}% · {Math.round((context?.used ?? 0) / 1000)}k /{" "}
            {Math.round((context?.limit ?? 0) / 1000)}k
          </span>
        </div>
      </div>
      <div class="underbar">
        <span class="underbar__aphorism">{t("composer.idle.aphorism")}</span>
        <span class="underbar__hint mono">
          {meta?.model ?? "—"} · {tierName(meta?.tier ?? "balanced")} ·{" "}
          {t(`mode.${store.mode.value}`)}
        </span>
      </div>
    </div>
  );
}

function alertNotWired(label: string) {
  const event = new CustomEvent("neo:toast", { detail: { text: label, sub: t("toast.proto") } });
  window.dispatchEvent(event);
}

export function composerTierVar(tier: keyof typeof TIER_KEYS): string {
  return `var(--tier-${TIER_KEYS[tier]})`;
}
