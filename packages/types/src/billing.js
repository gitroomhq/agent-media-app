// Copyright 2026 agent-media contributors
// SPDX-License-Identifier: Apache-2.0
/**
 * Billing domain types for the agent-media platform.
 *
 * Defines plan tiers, feature gates, PAYG packs, and billing-cycle
 * configuration. These types are consumed by both the backend
 * (Edge Functions, CLI) and the frontend (Next.js dashboard).
 */
// ── Plan Tier ───────────────────────────────────────────────────────────────
/**
 * Subscription plan tiers offered by agent-media.
 *
 * NOTE: `PlanTier` is also exported from index.ts for backward compatibility.
 * This enum-style constant provides runtime values in addition to the type.
 */
export const PLAN_TIERS = ['free', 'starter', 'growth', 'pro'];
//# sourceMappingURL=billing.js.map