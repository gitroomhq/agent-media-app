// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Generator registry — the single interface all consumers read from.
 *
 * Each generator is an opaque black box with a schema-defined input
 * contract and a predictable output. Users and integrations never see
 * internals (models, pipelines, rendering).
 */

import {
  CharacterVideoSchema,
  CreateVideoSchema,
  LaptopUgcSchema,
  ProductActingSchema,
  ProductReviewSchema,
  SaasReviewSchema,
  ShowYourAppSchema,
  SubtitleSchema,
  TextToVideoSchema,
} from './video.js';

export const GENERATORS = {
  ugc_video: {
    description: 'Generate a UGC-style video from a script or prompt',
    inputSchema: CreateVideoSchema,
    output: 'video_url' as const,
  },
  saas_review: {
    description: 'Generate a SaaS review video from a SaaS product URL',
    inputSchema: SaasReviewSchema,
    output: 'video_url' as const,
  },
  product_review: {
    description: 'Legacy alias for SaaS Review video generation',
    inputSchema: ProductReviewSchema,
    output: 'video_url' as const,
    legacy: true,
  },
  subtitle: {
    description: 'Add styled subtitles to an existing video',
    inputSchema: SubtitleSchema,
    output: 'video_url' as const,
  },
  show_your_app: {
    description: 'Generate a video showing your app with an AI actor holding a phone',
    inputSchema: ShowYourAppSchema,
    output: 'video_url' as const,
  },
  product_acting_ugc: {
    description: 'Generate a product-in-hand UGC video from a product image and actor reference',
    inputSchema: ProductActingSchema,
    output: 'video_url' as const,
  },
  laptop_ugc: {
    description: 'Generate a 3-scene laptop-UGC ad: actor holds laptop showing your app, scrolling B-roll, then a face-only selfie close',
    inputSchema: LaptopUgcSchema,
    output: 'video_url' as const,
  },
  character_video: {
    description: 'Generate a video of a character. Pick an actor by slug, OR pass a short description and we generate a character sheet via gpt-image-2 behind the scenes. Then Seedance 2.0 animates the reference image with your storyboard text.',
    inputSchema: CharacterVideoSchema,
    output: 'video_url' as const,
  },
  text_to_video: {
    description: 'Pure text-to-video via Seedance 2.0 — no character, no storyboard, no actor. The prompt IS the whole creative (style, subject, mood, composition). Best for stylistic / scene-driven content where you want the model to invent everything from the prompt text alone.',
    inputSchema: TextToVideoSchema,
    output: 'video_url' as const,
  },
} as const;

export type GeneratorId = keyof typeof GENERATORS;

export const GENERATOR_IDS = Object.keys(GENERATORS).filter(
  (id) => !(GENERATORS[id as GeneratorId] as { legacy?: boolean }).legacy,
) as GeneratorId[];
