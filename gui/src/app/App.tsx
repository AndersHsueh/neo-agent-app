import { useEffect, useState } from "preact/hooks";
import { Sprite } from "@/components/Sprite.tsx";
import { Toasts } from "@/components/Toasts.tsx";
import { Boot } from "@/features/boot/Boot.tsx";
import { LoginView } from "@/features/login/LoginView.tsx";
import { Workbench } from "@/features/workbench/Workbench.tsx";
import { bootstrap } from "@/state/app.ts";
import { pushToast, store } from "@/state/store.ts";

const GALLERY = new URLSearchParams(location.search).has("gallery");

export function App() {
  const [booted, setBooted] = useState(GALLERY);

  // 启动链与开机动画并行：动画只是仪式，不阻塞 Hub 发现。
  useEffect(() => {
    bootstrap();
  }, []);

  useEffect(() => {
    const onToast = (event: Event) => {
      const detail = (event as CustomEvent<{ text: string; sub?: string }>).detail;
      pushToast(detail.text, { sub: detail.sub });
    };
    window.addEventListener("neo:toast", onToast);
    return () => window.removeEventListener("neo:toast", onToast);
  }, []);

  if (GALLERY) {
    return (
      <>
        <Sprite />
        <GalleryLoader />
        <Toasts />
      </>
    );
  }

  // 发现成功（有 endpoint）就算"连上过"，WS 抖动交给 Workbench 的 connbar 呈现；
  // 只有发现失败（boot=offline）才回登录页兜底。
  const connected =
    store.user.value !== null && store.boot.value !== "offline" && store.endpoint.value !== null;

  return (
    <>
      <Sprite />
      {!booted ? (
        <Boot onDone={() => setBooted(true)} />
      ) : connected ? (
        <Workbench />
      ) : (
        <LoginView />
      )}
      <Toasts />
    </>
  );
}

function GalleryLoader() {
  const [mod, setMod] = useState<null | { Gallery: () => preact.JSX.Element }>(null);
  useEffect(() => {
    void import("@/dev/Gallery.tsx").then((m) => setMod({ Gallery: m.Gallery }));
  }, []);
  if (!mod) return <div class="gallery">loading…</div>;
  const Gallery = mod.Gallery;
  return <Gallery />;
}
