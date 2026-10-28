import { useEffect, useState } from "preact/hooks";
import { Sprite } from "@/components/Sprite.tsx";
import { Toasts } from "@/components/Toasts.tsx";
import { Boot } from "@/features/boot/Boot.tsx";
import { LoginView } from "@/features/login/LoginView.tsx";
import { Workbench } from "@/features/workbench/Workbench.tsx";
import { restoreSession } from "@/state/app.ts";
import { pushToast, store } from "@/state/store.ts";

const GALLERY = new URLSearchParams(location.search).has("gallery");

export function App() {
  const [booted, setBooted] = useState(GALLERY);
  const [restored] = useState(() => restoreSession());

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

  return (
    <>
      <Sprite />
      {booted ? (
        store.user.value ? (
          <Workbench />
        ) : (
          <LoginView />
        )
      ) : (
        <Boot onDone={() => setBooted(true)} />
      )}
      <Toasts />
      {restored ? null : null}
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
