/**
 * state/session.ts — 兼容层：会话状态机已 vendor 到 `protocol/reducer.ts`。
 *
 * 历史：本文件曾是独立实现，v0.0.2 起与 core 侧共用同一份 reducer（协议真源），
 * 这里只做 re-export，避免调用点（app.ts / tests）大面积改动。
 */

export {
  appendOptimisticUser,
  appendPickedUser,
  applyEvent,
  applyEvents,
  hydrate,
  removeUserByClientId,
  tailBlock,
} from "@/protocol/reducer.ts";
