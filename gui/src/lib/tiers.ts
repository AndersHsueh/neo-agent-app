import { t } from "@/i18n";
import type { PermissionMode, Tier } from "@/protocol";

export const TIER_KEYS: Record<Tier, "deep" | "balanced" | "fast" | "default"> = {
  deep_reasoning: "deep",
  balanced: "balanced",
  fast: "fast",
  default: "default",
};

export const TIER_ICONS: Record<Tier, string> = {
  deep_reasoning: "tier-deep",
  balanced: "tier-balanced",
  fast: "tier-fast",
  default: "tier-default",
};

export const tierName = (tier: Tier): string => t(`tier.${TIER_KEYS[tier]}.name`);
export const tierShort = (tier: Tier): string => t(`tier.${TIER_KEYS[tier]}.short`);
export const modeName = (mode: PermissionMode): string => t(`mode.${mode}`);
export const tierCssVar = (tier: Tier): string => `var(--tier-${TIER_KEYS[tier]})`;

export const agentNameForTier = (tier: Tier): string =>
  tier === "deep_reasoning" ? "Mr. Andersson" : "NEO";
