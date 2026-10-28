/**
 * dummy-serv/auth.ts — 本地账号 + 短时 token。
 *
 * 只用于开发与 e2e：token 存内存（重启即失效）、密码用 Bun.password 哈希。
 * 真 hub 换成 OIDC / 团队 SSO 时，前端只换 api/auth 一层，协议与状态模型不变。
 */

import type { TokenGrant, User } from "../../gui/src/protocol/index.ts";
import { DEV_USERS, type World } from "./store.ts";

const TOKEN_TTL_MS = 2 * 60 * 60 * 1000;

export async function initAuth(world: World): Promise<void> {
  for (const seed of DEV_USERS) {
    const stored = world.users.find((u) => u.user.id === seed.user.id);
    if (!stored) continue;
    stored.passwordHash = await Bun.password.hash(seed.password, { algorithm: "argon2id" });
  }
}

export async function login(
  world: World,
  email: string,
  password: string,
): Promise<TokenGrant | null> {
  const stored = world.users.find((u) => u.user.email.toLowerCase() === email.toLowerCase());
  if (!stored) return null;
  const ok = await Bun.password.verify(password, stored.passwordHash);
  if (!ok) return null;

  const token = crypto.randomUUID().replaceAll("-", "");
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  world.tokens.set(token, { userId: stored.user.id, expiresAt });
  return { token, expiresAt, user: stored.user };
}

export function verify(world: World, token: string): User | null {
  const entry = world.tokens.get(token);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    world.tokens.delete(token);
    return null;
  }
  const stored = world.users.find((u) => u.user.id === entry.userId);
  return stored?.user ?? null;
}

export function logout(world: World, token: string): void {
  world.tokens.delete(token);
}
