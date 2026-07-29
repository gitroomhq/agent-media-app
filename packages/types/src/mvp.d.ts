/**
 * MVP types for Sprint 8 of the agent-media platform.
 *
 * Covers auto-top-up configuration, unit economics reporting,
 * job retry/inspection tooling, and text overlay parameters.
 * These types are consumed by the CLI, Edge Functions, and
 * the Next.js dashboard.
 */
import type { GenerationJob } from './models.js';
/**
 * User-configurable auto top-up settings.
 *
 * When enabled, the platform automatically purchases a credit pack
 * on the user's behalf when their balance falls below `threshold`.
 * The `maxMonthlyTopUps` cap prevents runaway spending.
 */
export interface AutoTopUpConfig {
    /** Whether automatic top-up is enabled for this user. */
    enabled: boolean;
    /** Credit balance threshold that triggers a top-up. */
    threshold: number;
    /** PAYG pack slug to purchase on each top-up (e.g., 'pack_500'). */
    packSlug: string;
    /** Maximum number of automatic top-ups allowed per billing month. */
    maxMonthlyTopUps: number;
}
/**
 * Per-operation unit economics for a model.
 *
 * Used by the admin dashboard and internal reporting to track
 * revenue, provider cost, and margin for each model × operation pair.
 */
export interface UnitEconomics {
    /** Model identifier (e.g., 'seedance2', 'flux-pro'). */
    modelSlug: string;
    /** Operation type (e.g., 'text-to-video', 'image-to-video'). */
    operation: string;
    /** Number of platform credits charged to the user. */
    creditCost: number;
    /** Actual cost paid to the upstream provider in USD. */
    providerCostUsd: number;
    /** Revenue received from the user in USD. */
    revenueUsd: number;
    /** Gross margin as a percentage (0–100). */
    marginPercent: number;
    /** Gross margin in absolute USD. */
    marginUsd: number;
}
/**
 * Parameters for retrying a previously failed generation job.
 *
 * The user may optionally override the prompt or seed while
 * retaining the original job's model, resolution, and other settings.
 */
export interface RetryJobParams {
    /** The ID of the original job to retry. */
    jobId: string;
    /** Optional replacement prompt for the retry attempt. */
    newPrompt?: string;
    /** Optional replacement seed for the retry attempt. */
    newSeed?: number;
}
/**
 * A single entry in a job's status-change timeline.
 *
 * The timeline is an ordered list showing each status transition
 * along with elapsed time from the job's creation.
 */
export interface JobTimelineEntry {
    /** The status the job transitioned to. */
    status: string;
    /** ISO 8601 timestamp of the transition. */
    timestamp: string;
    /** Milliseconds elapsed since job creation, or `null` for the first entry. */
    elapsedMs: number | null;
}
/**
 * Ordered list of status-change events for a generation job.
 */
export type JobTimeline = JobTimelineEntry[];
/**
 * Full inspection payload for a generation job.
 *
 * Returned by the `job inspect` CLI command and the admin API.
 * Combines the job record with its timeline, cost breakdown,
 * and upstream provider details.
 */
export interface JobInspection {
    /** The generation job record. */
    job: GenerationJob;
    /** Ordered status-change timeline for the job. */
    timeline: JobTimeline;
    /** Breakdown of credits charged and revenue earned. */
    costBreakdown: {
        /** Total credits charged for this job. */
        creditsCharged: number;
        /** Source pool from which credits were deducted. */
        creditSource: 'monthly' | 'purchased' | 'mixed';
        /** Actual cost paid to the upstream provider in USD. */
        providerCostUsd: number;
        /** Gross margin as a percentage (0–100). */
        marginPercent: number;
        /** Revenue received from the user in USD. */
        revenueUsd: number;
    };
    /** Upstream provider tracking details. */
    providerDetails: {
        /** Provider identifier (e.g., 'kie', 'fal', 'replicate'). */
        providerSlug: string;
        /** Provider-assigned job identifier. */
        providerJobId: string;
        /** Latest webhook checkpoint for this job. */
        webhookCheckpoint: string;
    };
}
/**
 * Parameters for the text overlay post-processing step.
 *
 * Used by the CLI `overlay` command to burn text into a video
 * or image file using ffmpeg.
 */
export interface TextOverlayParams {
    /** Path to the input media file. */
    inputPath: string;
    /** Text content to render on the media. */
    text: string;
    /** Vertical position of the text overlay. Defaults to 'bottom'. */
    position?: 'top' | 'center' | 'bottom';
    /** Font size in pixels. Defaults to provider-appropriate size. */
    fontSize?: number;
    /** Text color as a CSS-compatible string (e.g., '#ffffff', 'white'). */
    color?: string;
    /** Path for the output file. Defaults to input path with '-overlay' suffix. */
    outputPath?: string;
}
//# sourceMappingURL=mvp.d.ts.map