# NEO 图标

已批准的 v3 标记。不要改造型。

源稿：

- `source/neo-icon.svg` — 128px 及以上，含 1024。圆角收笔的 chevron。
- `source/neo-icon-small.svg` — 16 和 32，以及它们的 @2x（32、64）。间隙更宽，chevron 方头，笔画略粗。

导出在 `icons/`，给以后的 Tauri 壳直接用（这个仓库还没有 Tauri crate，不要在这里搭窗口或打包）：

| 文件 | 像素 | 源稿 |
|---|---|---|
| `icon.icns` | 16–1024，含 @2x | 按上表 |
| `icon.ico` | 16, 24, 32, 48, 64, 128, 256 | ≤64 用 small，其余用 large |
| `icon.png` | 512 | large |
| `32x32.png` | 32 | small |
| `128x128.png` | 128 | large |
| `128x128@2x.png` | 256 | large |
| `Square30x30Logo.png` `Square44x44Logo.png` `StoreLogo.png` (50) | ≤64 | small |
| `Square71x71Logo.png` 及更大的 Square* | ≥71 | large |

浏览器标签用的是同一份 small 源稿：`gui/public/favicon.svg`。
