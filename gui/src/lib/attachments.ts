/**
 * lib/attachments.ts — 图片附件的读取/校验/编码（v0.0.2：png|jpeg|webp，≤5 张，单张 ≤5MB）。
 *
 * 协议里只传 `ImageAttachmentInput`（mime + 裸 base64，不含 data: 前缀）；
 * 本地预览用 data URL。服务端不做历史回传，刷新后图片不再显示（协议已知限制）。
 */
import type { ImageAttachmentInput } from "@/protocol";

export const MAX_IMAGES = 5;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export type AllowedImageMime = "image/png" | "image/jpeg" | "image/webp";
export const ALLOWED_IMAGE_MIMES: readonly AllowedImageMime[] = [
  "image/png",
  "image/jpeg",
  "image/webp",
];

export interface PendingImage {
  id: string;
  name: string;
  mime: AllowedImageMime;
  size: number;
  dataBase64: string;
}

export function isAllowedImageMime(mime: string): mime is AllowedImageMime {
  return (ALLOWED_IMAGE_MIMES as readonly string[]).includes(mime);
}

export function dataUrlOf(image: { mime: string; dataBase64: string }): string {
  return `data:${image.mime};base64,${image.dataBase64}`;
}

export type ReadImageResult =
  | { ok: true; image: PendingImage }
  | { ok: false; reason: "type" | "size" | "read" };

/** File → PendingImage（FileReader 读 data URL，剥掉前缀只留 base64） */
export function readImageFile(file: File): Promise<ReadImageResult> {
  if (!isAllowedImageMime(file.type)) return Promise.resolve({ ok: false, reason: "type" });
  if (file.size > MAX_IMAGE_BYTES) return Promise.resolve({ ok: false, reason: "size" });
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => resolve({ ok: false, reason: "read" });
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const comma = result.indexOf(",");
      const base64 = comma >= 0 ? result.slice(comma + 1) : "";
      if (!base64) {
        resolve({ ok: false, reason: "read" });
        return;
      }
      resolve({
        ok: true,
        image: {
          id: crypto.randomUUID(),
          name: file.name || "image",
          mime: file.type as AllowedImageMime,
          size: file.size,
          dataBase64: base64,
        },
      });
    };
    reader.readAsDataURL(file);
  });
}

export function toAttachmentInput(image: PendingImage): ImageAttachmentInput {
  return { kind: "image", mime: image.mime, dataBase64: image.dataBase64 };
}
