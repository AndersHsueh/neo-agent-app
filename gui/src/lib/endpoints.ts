/**
 * 端点解析：开发期直连 dummy-serv（5292），生产期同源（Tauri/Bun 后端同进程端口）。
 * 这样 WebSocket 不经过 Vite 代理，重连行为与生产一致。
 */

const DEV_DUMMY = (import.meta.env.VITE_DUMMY as string | undefined) ?? "127.0.0.1:5292";

export const isDev = import.meta.env.DEV;

export const httpBase = (): string => (isDev ? `http://${DEV_DUMMY}` : "");

export const wsUrl = (lang: "zh" | "en"): string => {
  if (isDev) return `ws://${DEV_DUMMY}/ws?lang=${lang}`;
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/ws?lang=${lang}`;
};

/** 状态栏展示用：dev 显示直连的 dummy，生产显示同源 */
export const hubLabel = (): string => (isDev ? DEV_DUMMY : location.host);
