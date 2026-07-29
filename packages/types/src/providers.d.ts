/**
 * Provider abstraction types for the agent-media platform.
 *
 * Every AI provider implements the
 * {@link ProviderAdapter} interface. The platform routes generation
 * requests to the correct provider based on the model registry, keeping
 * all provider implementation details internal.
 */
import type { Model } from './models.js';
/**
 * Normalized generation request passed to a provider adapter.
 * All provider-specific field mapping happens inside the adapter.
 */
export interface GenerationRequest {
    /** Model slug from the model registry. */
    model: string;
    /** Primary text prompt describing the desired output. */
    prompt: string;
    /** Negative prompt -- things to avoid in the output. */
    negativePrompt?: string;
    /** Desired output duration in seconds (video only). */
    duration?: number;
    /** Desired output resolution (e.g., '720p', '1080p', '4k'). */
    resolution?: string;
    /** Deterministic seed for reproducible outputs. */
    seed?: number;
    /** Aspect ratio (e.g., '16:9', '9:16', '1:1'). */
    aspectRatio?: string;
    /** URL to an input media file for image-to-video or similar workflows. */
    inputMediaUrl?: string;
}
/**
 * Response returned by a provider adapter after submitting a job.
 */
export interface GenerationResponse {
    /** Internal agent-media job ID. */
    jobId: string;
    /** Provider-assigned job identifier used for status polling and webhooks. */
    providerJobId: string;
    /** Initial status of the submitted job. */
    status: ProviderJobStatusValue;
    /** Estimated time to completion in seconds, if available. */
    estimatedDuration?: number;
    /** Credits charged for this generation. */
    creditsCost: number;
}
/**
 * Possible states of a provider job.
 */
export type ProviderJobStatusValue = 'pending' | 'processing' | 'completed' | 'failed';
/**
 * Detailed status report for a provider job, including progress tracking.
 */
export interface ProviderJobStatus {
    /** Current state of the job. */
    status: ProviderJobStatusValue;
    /** Completion percentage (0-100). Only meaningful while processing. */
    progress: number;
    /** Estimated time remaining in seconds, if available. */
    estimatedTimeRemaining?: number;
    /** Error message when status is 'failed'. */
    error?: string;
}
/**
 * Final output returned by a provider after successful generation.
 */
export interface ProviderResult {
    /** URL of the generated media file. */
    mediaUrl: string;
    /** URL of the generated thumbnail image. */
    thumbnailUrl?: string;
    /** Actual duration of the generated media in seconds (video only). */
    duration?: number;
    /** Actual resolution of the generated output. */
    resolution?: string;
    /** Provider-specific metadata about the generation. */
    metadata?: Record<string, unknown>;
}
/**
 * Contract that every AI provider must implement.
 *
 * The platform never calls provider APIs directly; all interactions go
 * through an adapter that normalizes request/response formats.
 */
export interface ProviderAdapter {
    /** Unique provider identifier (e.g., 'kie', 'fal', 'replicate'). */
    readonly name: string;
    /**
     * Submit a generation job to the provider.
     *
     * @param model  - The model definition from the registry.
     * @param request - Normalized generation parameters.
     * @returns The provider-assigned job ID.
     */
    submitJob(model: Model, request: GenerationRequest): Promise<string>;
    /**
     * Poll the current status of a provider job.
     *
     * @param providerJobId - The provider-assigned job ID.
     * @returns Current status with optional progress information.
     */
    getStatus(providerJobId: string): Promise<ProviderJobStatus>;
    /**
     * Retrieve the result of a completed provider job.
     *
     * @param providerJobId - The provider-assigned job ID.
     * @returns The generated media URL and metadata.
     */
    getResult(providerJobId: string): Promise<ProviderResult>;
    /**
     * Build the webhook callback URL for this provider.
     *
     * The URL is provider-specific and includes any authentication
     * tokens or path segments needed for routing.
     *
     * @returns Fully-qualified webhook URL.
     */
    buildWebhookUrl(): string;
    /**
     * Verify the authenticity of an incoming webhook request.
     *
     * Checks signatures, HMAC headers, or other provider-specific
     * authentication mechanisms.
     *
     * @param req - The raw incoming HTTP request.
     * @returns `true` if the request is authentic, `false` otherwise.
     */
    verifyWebhook(req: Request): boolean;
}
//# sourceMappingURL=providers.d.ts.map