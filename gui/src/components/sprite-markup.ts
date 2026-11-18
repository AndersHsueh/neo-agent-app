/**
 * components/sprite-markup.ts — 手绘图标 sprite（唯一资产）。
 * 由原型 `index.html` 的 <defs> 直接搬来；改图标改这里，改完跑视觉回归。
 */
export const SPRITE_MARKUP = String.raw`<defs>
    <symbol id="i-logo" viewBox="0 0 24 24">
      <path d="M6.2 7.2 12.2 12 6.2 16.8" />
      <path d="M14.4 9.2h4.2v5.6h-4.2z" />
    </symbol>
    <symbol id="i-plus-cell" viewBox="0 0 24 24">
      <rect x="3.6" y="3.6" width="16.8" height="16.8" rx="4.2" />
      <path d="M12 8.4v7.2M8.4 12h7.2" />
    </symbol>
    <symbol id="i-search" viewBox="0 0 24 24">
      <circle cx="10.6" cy="10.6" r="6.4" />
      <path d="M15.4 15.4L20.3 20.3" />
      <path d="M10.6 7.4v6.4M7.4 10.6h6.4" />
    </symbol>
    <symbol id="i-sessions" viewBox="0 0 24 24">
      <path d="M4 6.2h12.4M4 12h16M4 17.8h9.6" />
      <circle cx="19.4" cy="17.8" r="1.5" />
      <circle cx="19.4" cy="6.2" r="1.5" opacity=".5" />
    </symbol>
    <symbol id="i-peers" viewBox="0 0 24 24">
      <circle cx="7.6" cy="8.6" r="3.2" />
      <circle cx="17" cy="15.4" r="3.2" />
      <path d="M10 10.6l4.6 2.8" />
      <path d="M16.6 8.2v.02M7.2 15.8v.02" />
    </symbol>
    <symbol id="i-memory" viewBox="0 0 24 24">
      <path d="M12 3.4l7.4 3.8L12 11l-7.4-3.8z" />
      <path d="M4.6 11.8L12 15.6l7.4-3.8" />
      <path d="M4.6 15.8L12 19.6l7.4-3.8" />
    </symbol>
    <symbol id="i-wiki" viewBox="0 0 24 24">
      <path d="M5 19.4V8.2a2.4 2.4 0 012.4-2.4h2.2a2.4 2.4 0 012.4 2.4v11.2" />
      <path d="M12 12.6h4.6a2.4 2.4 0 012.4 2.4v4.4" />
      <path d="M3.4 19.4h17.2" />
      <circle cx="17.6" cy="9.4" r="1.4" />
    </symbol>
    <symbol id="i-skills" viewBox="0 0 24 24">
      <path d="M8.2 4.2l3.3 1.9v3.8L8.2 11.8 4.9 9.9V6.1z" />
      <path d="M15.8 12.2l3.3 1.9v3.8l-3.3 1.9-3.3-1.9v-3.8z" />
      <path d="M15.8 4.2l3.3 1.9v1.4" opacity=".55" />
      <path d="M8.2 15.6l-1.6.9" opacity=".55" />
    </symbol>
    <symbol id="i-settings" viewBox="0 0 24 24">
      <path d="M3.8 7.2h8.4M16.4 7.2h3.8M3.8 12h2.8M10.8 12h9.4M3.8 16.8h8M16 16.8h4.2" />
      <circle cx="14.4" cy="7.2" r="2" />
      <circle cx="8.8" cy="12" r="2" />
      <circle cx="13.6" cy="16.8" r="2" />
    </symbol>
    <symbol id="i-globe" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="8.2" />
      <path d="M3.9 12h16.2" />
      <path d="M12 3.8c2.5 2.3 3.9 5.1 3.9 8.2s-1.4 5.9-3.9 8.2c-2.5-2.3-3.9-5.1-3.9-8.2s1.4-5.9 3.9-8.2z" />
    </symbol>
    <symbol id="i-palette" viewBox="0 0 24 24">
      <rect x="3.6" y="4.4" width="16.8" height="15.2" rx="3.2" />
      <path d="M6.6 8.6l3.1 3.1-3.1 3.1" />
      <path d="M12.4 14.9h4.6" />
    </symbol>
    <symbol id="i-panel" viewBox="0 0 24 24">
      <rect x="3.6" y="4.4" width="16.8" height="15.2" rx="3.2" />
      <path d="M14.8 4.4v15.2" />
    </symbol>
    <symbol id="i-chevron-right" viewBox="0 0 24 24">
      <path d="M9.4 5.4l6.7 6.6-6.7 6.6" />
    </symbol>
    <symbol id="i-chevron-down" viewBox="0 0 24 24">
      <path d="M5.4 9.4l6.6 6.7 6.6-6.7" />
    </symbol>
    <symbol id="i-check" viewBox="0 0 24 24">
      <path d="M4.6 12.6l4.9 4.9L19.4 6.6" />
    </symbol>
    <symbol id="i-x" viewBox="0 0 24 24">
      <path d="M6.2 6.2l11.6 11.6M17.8 6.2L6.2 17.8" />
    </symbol>
    <symbol id="i-alert" viewBox="0 0 24 24">
      <path d="M12 4.1l8.4 15.1a.9.9 0 01-.8 1.4H4.4a.9.9 0 01-.8-1.4z" />
      <path d="M12 9.2v4.6M12 16.8v.4" />
    </symbol>
    <symbol id="i-clock" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="8.2" />
      <path d="M12 7.4V12l3.2 2" />
    </symbol>
    <symbol id="i-terminal" viewBox="0 0 24 24">
      <rect x="3.4" y="4.6" width="17.2" height="14.8" rx="3.2" />
      <path d="M7.4 9.8l2.4 2.2-2.4 2.2" />
      <path d="M12.6 14.2h4.2" />
    </symbol>
    <symbol id="i-file" viewBox="0 0 24 24">
      <path d="M6.2 3.8h6.9l4.7 4.7v11.7H6.2z" />
      <path d="M13.1 3.8v4.7h4.7" />
      <path d="M9 12.6h6M9 16h4" />
    </symbol>
    <symbol id="i-edit" viewBox="0 0 24 24">
      <path d="M4 20l1.1-4.4L16.4 4.3l3.3 3.3L8.4 18.9z" />
      <path d="M14.6 6.1l3.3 3.3" />
    </symbol>
    <symbol id="i-test" viewBox="0 0 24 24">
      <path d="M9 3.6h6" />
      <path d="M10 3.6v5.1L5.9 16.4a2.5 2.5 0 002.2 3.6h7.8a2.5 2.5 0 002.2-3.6L14 8.7V3.6" />
      <path d="M7.7 14.4h8.6" />
    </symbol>
    <symbol id="i-diff" viewBox="0 0 24 24">
      <rect x="3.6" y="4.4" width="16.8" height="15.2" rx="3.2" />
      <path d="M12 4.4v15.2" />
      <path d="M6.6 9.6h2.8M8 8.2v2.8" />
      <path d="M15.2 14.8h2.8" />
    </symbol>
    <symbol id="i-shield" viewBox="0 0 24 24">
      <path d="M12 3.3l7.3 2.9v5.5c0 4.2-3 7.5-7.3 8.8-4.3-1.3-7.3-4.6-7.3-8.8V6.2z" />
      <path d="M9 12.2l2.2 2.2 4-4.4" />
    </symbol>
    <symbol id="i-shield-slash" viewBox="0 0 24 24">
      <path d="M12 3.3l7.3 2.9v5.5c0 4.2-3 7.5-7.3 8.8-4.3-1.3-7.3-4.6-7.3-8.8V6.2z" />
      <path d="M8.4 8.4l7.2 7.2" />
    </symbol>
    <symbol id="i-chip" viewBox="0 0 24 24">
      <rect x="7" y="7" width="10" height="10" rx="2.4" />
      <path d="M10 3.6v3.4M14 3.6v3.4M10 17v3.4M14 17v3.4M3.6 10H7M3.6 14H7M17 10h3.4M17 14h3.4" />
    </symbol>
    <symbol id="i-send" viewBox="0 0 24 24">
      <path d="M12 19.6V5.2" />
      <path d="M6.6 10.6L12 5.2l5.4 5.4" />
      <path d="M5.2 21h13.6" />
    </symbol>
    <symbol id="i-stop" viewBox="0 0 24 24">
      <rect x="7" y="7" width="10" height="10" rx="2" />
    </symbol>
    <symbol id="i-pill" viewBox="0 0 24 24">
      <rect x="2.6" y="8.4" width="18.8" height="7.2" rx="3.6" transform="rotate(-45 12 12)" />
      <path d="M8.1 15.9l7.8-7.8" />
    </symbol>
    <symbol id="i-eye" viewBox="0 0 24 24">
      <path d="M2.8 12S6.4 5.8 12 5.8 21.2 12 21.2 12s-3.6 6.2-9.2 6.2S2.8 12 2.8 12z" />
      <circle cx="12" cy="12" r="2.6" />
    </symbol>
    <symbol id="i-zap" viewBox="0 0 24 24">
      <path d="M13.2 2.8L5.8 13.4h5.4L10.8 21.2l7.4-10.6h-5.4z" />
    </symbol>
    <symbol id="i-keyboard" viewBox="0 0 24 24">
      <rect x="2.8" y="6" width="18.4" height="12" rx="3" />
      <path d="M6.4 10h.02M9.4 10h.02M12.4 10h.02M15.4 10h.02M18.4 10h.02M6.4 13.4h.02M18.4 13.4h.02" />
      <path d="M9.4 13.4h5.2" />
    </symbol>
    <symbol id="i-copy" viewBox="0 0 24 24">
      <rect x="8.6" y="8.6" width="11.8" height="11.8" rx="2.8" />
      <path d="M15.4 6.2V5.2a1.8 1.8 0 00-1.8-1.8H5a1.8 1.8 0 00-1.8 1.8v8.6a1.8 1.8 0 001.8 1.8h1" />
    </symbol>
    <symbol id="i-more" viewBox="0 0 24 24">
      <path d="M6.2 12h.02M12 12h.02M17.8 12h.02" stroke-width="2.6" />
    </symbol>
    <symbol id="i-external" viewBox="0 0 24 24">
      <path d="M13.4 4.6h6v6" />
      <path d="M19.4 4.6l-8.2 8.2" />
      <path d="M17.4 13.8v4.6a1.8 1.8 0 01-1.8 1.8H5.6a1.8 1.8 0 01-1.8-1.8V8.4a1.8 1.8 0 011.8-1.8h4.6" />
    </symbol>
    <symbol id="i-rain" viewBox="0 0 24 24">
      <path d="M7 3.6v6.2M7 12.6v2M12 6.6v6.2M12 15.6v2.6M17 3.6v4M17 10.4v6.2" />
    </symbol>
    <symbol id="i-tier-deep" viewBox="0 0 24 24">
      <path d="M12 3.2l6.2 8.8L12 20.8 5.8 12z" />
      <path d="M12 8.2l2.7 3.8-2.7 3.8-2.7-3.8z" opacity=".55" />
    </symbol>
    <symbol id="i-tier-balanced" viewBox="0 0 24 24">
      <path d="M12 3.2l7.4 4.3v8.9L12 20.8 4.6 16.4V7.5z" />
      <path d="M12 8.3l3.6 2.1v4.2L12 16.7l-3.6-2.1v-4.2z" opacity=".55" />
    </symbol>
    <symbol id="i-tier-fast" viewBox="0 0 24 24">
      <path d="M5.6 5.6L11.8 12l-6.2 6.4" />
      <path d="M12.6 5.6L18.8 12l-6.2 6.4" />
    </symbol>
    <symbol id="i-tier-default" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="8.2" />
      <circle cx="12" cy="12" r="3" />
    </symbol>
    <symbol id="i-arrow-in" viewBox="0 0 24 24">
      <path d="M17.4 6.6L13 11v0" />
      <path d="M12 6.6v10.2h8.2" />
    </symbol>
    <symbol id="i-arrow-out" viewBox="0 0 24 24">
      <path d="M12 17.4V7.2H3.8" />
      <path d="M6.6 17.4L11 13v0" />
    </symbol>
    <symbol id="i-gauge" viewBox="0 0 24 24">
      <path d="M4 16.4a8.4 8.4 0 1116 0" />
      <path d="M12 16.4l3.6-4.6" />
      <path d="M3.4 19.4h17.2" />
    </symbol>
    <symbol id="i-retry" viewBox="0 0 24 24">
      <path d="M4.6 12a7.4 7.4 0 101.9-4.9" />
      <path d="M4.4 4.6v4.6h4.6" />
    </symbol>
    <symbol id="i-attach" viewBox="0 0 24 24">
      <path d="M17.6 11.2l-6.5 6.5a3.7 3.7 0 01-5.2-5.2l7.2-7.2a2.4 2.4 0 013.4 3.4l-7.1 7.1a1.2 1.2 0 01-1.7-1.7l6.4-6.4" />
    </symbol>
    <symbol id="i-at" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="4.2" />
      <path d="M16.2 12v1.6a2.6 2.6 0 005.2 0V12a9.4 9.4 0 10-3.9 7.6" />
    </symbol>
    <symbol id="i-command-key" viewBox="0 0 24 24">
      <path d="M9 3.6a3 3 0 013 3v10.8a3 3 0 11-3-3h6a3 3 0 11-3 3V6.6a3 3 0 013-3 3 3 0 010 6H9a3 3 0 010-6z" />
    </symbol>
    <symbol id="i-plug" viewBox="0 0 24 24">
      <path d="M9 3.6v5M15 3.6v5" />
      <path d="M6.4 8.6h11.2v2.6a5.6 5.6 0 01-11.2 0z" />
      <path d="M12 16.8v3.6" />
    </symbol>
    <symbol id="i-tier-swap" viewBox="0 0 24 24">
      <path d="M8.4 5.4L5 8.8l3.4 3.4" />
      <path d="M5 8.8h14" />
      <path d="M15.6 18.6l3.4-3.4-3.4-3.4" />
      <path d="M19 15.2H5" />
    </symbol>
    <symbol id="i-file-tree" viewBox="0 0 24 24">
      <path d="M5 5.6h5.2v3.6H5zM5 14.8h5.2v3.6H5z" />
      <path d="M13.8 5.6h5.2v3.6h-5.2z" opacity=".55" />
      <path d="M10.2 7.4h1.6v9.2h-1.6" />
      <path d="M11.8 12.6h4" opacity=".55" />
    </symbol>
    <symbol id="i-spark" viewBox="0 0 24 24">
      <path d="M12 3v4.4M12 16.6V21M3 12h4.4M16.6 12H21" />
      <path d="M6.4 6.4l2.4 2.4M15.2 15.2l2.4 2.4M17.6 6.4l-2.4 2.4M8.8 15.2l-2.4 2.4" opacity=".5" />
    </symbol>
  </defs>`;
