/**
 * Generation pipeline types for the agent-media CLI and Edge Functions.
 *
 * {@link GenerateParams} represents the CLI user's input before it is
 * validated and mapped to a {@link GenerationRequest} for the provider
 * adapter layer.
 */
import type { BillingPlanTier } from './billing.js';
/**
 * Parameters captured from the CLI `generate` command.
 *
 * These are the raw user inputs before any validation, pricing lookup,
 * or provider-specific mapping occurs.
 */
export interface GenerateParams {
    /** Model slug (e.g., 'seedance2', 'flux-pro'). */
    modelSlug: string;
    /** Primary text prompt. */
    prompt: string;
    /** Negative prompt -- things to avoid in the output. */
    negativePrompt?: string;
    /** Desired output duration in seconds (video only). */
    duration?: number;
    /** Desired output resolution (e.g., '720p', '1080p'). */
    resolution?: string;
    /** Aspect ratio (e.g., '16:9', '9:16', '1:1'). */
    aspectRatio?: string;
    /** Deterministic seed for reproducible outputs. */
    seed?: number;
    /** Local or remote path to an input media file. */
    inputMediaPath?: string;
    /** Idempotency key to prevent duplicate submissions. */
    idempotencyKey?: string;
    /** If true, skip the cost confirmation prompt. */
    skipConfirmation?: boolean;
}
/**
 * Estimated cost for a generation request, shown to the user
 * before they confirm submission.
 */
export interface CostEstimate {
    /** Number of credits this generation will cost. */
    credits: number;
    /** Equivalent cost in USD. */
    costUsd: number;
    /** User's current available credit balance. */
    availableCredits: number;
    /** Whether the user has enough credits to proceed. */
    canAfford: boolean;
    /** Model display name for the confirmation prompt. */
    modelDisplayName: string;
    /** Breakdown of which credit pools will be drawn from. */
    breakdown: {
        /** Credits that will come from the monthly plan allowance. */
        planCredits: number;
        /** Credits that will come from purchased PAYG packs. */
        purchasedCredits: number;
    };
}
/**
 * Result of the cost confirmation step in the CLI.
 */
export interface CostConfirmation {
    /** Whether the user confirmed the generation. */
    confirmed: boolean;
    /** The cost estimate that was presented to the user. */
    estimate: CostEstimate;
    /** Timestamp when the confirmation was given. */
    confirmedAt?: string;
}
/**
 * Feature flag for controlling rollout of platform capabilities.
 *
 * Feature flags can be scoped to specific plan tiers and support
 * gradual percentage-based rollout.
 */
export interface FeatureFlag {
    /** Unique name identifying the feature (e.g., 'video_generation'). */
    name: string;
    /** Whether the feature is globally enabled. */
    enabled: boolean;
    /** Percentage of eligible users who see the feature (0-100). */
    rolloutPercentage: number;
    /** Plan tiers that have access to this feature. Empty array means all tiers. */
    planTiers: BillingPlanTier[];
    /** Arbitrary metadata for feature-specific configuration. */
    metadata: Record<string, unknown>;
}
//# sourceMappingURL=generation.d.ts.map