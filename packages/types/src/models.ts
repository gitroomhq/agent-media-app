// Copyright 2026 agent-media contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * Model registry types for the agent-media platform.
 *
 * Defines the model, job, and pricing types used across the CLI,
 * Edge Functions, and dashboard.
 */

// ── Model Types ──────────────────────────────────────────────────────────────

export type ModelType = 'video' | 'image';

export type ModelOperation = 'text-to-video' | 'image-to-video' | 'text-to-image';

export type ModelStatus = 'active' | 'inactive' | 'deprecated';

export interface Model {
  slug: string;
  displayName: string;
  type: ModelType;
  providerSlug: string;
  providerModelId: string;
  supportedOperations: ModelOperation[];
  supportedResolutions: string[];
  supportedDurations: number[];
  supportedAspectRatios: string[];
  maxInputFiles: number;
  capabilities: Record<string, unknown>;
  status: ModelStatus;
  visible: boolean;
}

// ── Job Types ────────────────────────────────────────────────────────────────

export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed';

export interface GenerationJob {
  id: string;
  userId: string;
  modelSlug: string;
  operation: ModelOperation;
  status: JobStatus;
  prompt: string;
  inputMediaUrls: string[];
  outputUrl: string | null;
  thumbnailUrl: string | null;
  creditsCharged: number;
  creditSource: 'plan' | 'purchased' | 'mixed';
  errorMessage: string | null;
  durationSeconds: number | null;
  resolution: string | null;
  aspectRatio: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  completedAt: string | null;
}

export interface GenerationParams {
  modelSlug: string;
  prompt: string;
  inputMediaUrls?: string[];
  duration?: number;
  resolution?: string;
  aspectRatio?: string;
}

// ── Subscription Types ───────────────────────────────────────────────────────

export type PlanTier = 'free' | 'starter' | 'growth' | 'pro' | 'enterprise';

export interface Subscription {
  userId: string;
  plan: PlanTier;
  monthlyCreditsAllowance: number;
  monthlyCreditsRemaining: number;
  maxResolution: string;
  hasWatermark: boolean;
  hasPriority: boolean;
  hasApiAccess: boolean;
  maxConcurrentJobs: number;
  status: 'active' | 'canceled' | 'past_due';
  currentPeriodStart: string;
  currentPeriodEnd: string;
}

// ── Pricing Types ────────────────────────────────────────────────────────────

export interface ModelPricing {
  modelSlug: string;
  operation: ModelOperation;
  duration: number | null;
  resolution: string | null;
  credits: number;
}
