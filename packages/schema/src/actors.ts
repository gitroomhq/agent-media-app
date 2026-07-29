// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Actor-related types for the variant pipeline.
 */

export const VARIANT_POSITIONS = ['centered', 'left', 'right'] as const;
export type VariantPosition = (typeof VARIANT_POSITIONS)[number];

export const VARIANT_FRAMINGS = ['close-up', 'medium', 'wide'] as const;
export type VariantFraming = (typeof VARIANT_FRAMINGS)[number];

export const VARIANT_EXPRESSIONS = ['neutral', 'serious', 'smiling'] as const;
export type VariantExpression = (typeof VARIANT_EXPRESSIONS)[number];

export interface ActorVariant {
  readonly id: string;
  readonly actor_id: string;
  readonly position: VariantPosition;
  readonly framing: VariantFraming;
  readonly expression: VariantExpression;
  readonly outfit: string;
  readonly background: string;
  readonly image_url: string;
  readonly r2_key: string;
  readonly width: number;
  readonly height: number;
  readonly source: string;
  readonly status: 'active' | 'archived';
}
