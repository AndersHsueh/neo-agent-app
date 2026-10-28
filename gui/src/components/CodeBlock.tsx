import { highlight } from "@/lib/fx.ts";
import { Icon } from "./Icon.tsx";

export function CodeBlock({
  code,
  lang = "ts",
  file,
}: {
  code: string;
  lang?: string;
  file?: string;
}) {
  return (
    <div class="codeblock">
      <div class="codeblock__head">
        <Icon name="file" class="icon icon--xs" />
        <span>{file ?? ""}</span>
        <span class="codeblock__lang">{lang}</span>
      </div>
      <pre dangerouslySetInnerHTML={{ __html: highlight(code) }} />
    </div>
  );
}
