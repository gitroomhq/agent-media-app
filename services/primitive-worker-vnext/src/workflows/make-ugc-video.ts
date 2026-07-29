// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Composed skill workflow: make_ugc_video.
 *
 * Chains three primitives in a single Temporal Workflow:
 *   (optional) portrait_gpt2  → portrait_url
 *              character_sheet_gpt2 → character_sheet_url
 *              simple_selfie → video_url
 *
 * Identity source rules (mirrors API-level Zod refine):
 *   - description only         → run all 3 steps
 *   - portrait_url supplied    → skip portrait, run 2 + 3
 *   - portrait_image_base64    → API uploads to R2 first, then becomes portrait_url
 *
 * Skill state is tracked via the `composedSkillState` Activity. Each
 * primitive Activity records its own primitive_runs row tied to the
 * parent skill_run_id, so GET /v1/skills/runs/:id reads steps by joining
 * primitive_runs WHERE skill_run_id = :id.
 */

import { proxyActivities } from '@temporalio/workflow';
import type { PrimitiveActivities } from '../activities/index.js';
import type { PortraitGpt2ActivityInput, PortraitGpt2ActivityResult } from '../activities/portrait-gpt2.js';
import type { CharacterSheetGpt2ActivityInput, CharacterSheetGpt2ActivityResult } from '../activities/character-sheet-gpt2.js';
import type { SimpleSelfieActivityInput, SimpleSelfieActivityResult } from '../activities/simple-selfie.js';
import type { SubtitlesActivityInput, SubtitlesActivityResult } from '../activities/subtitles.js';

export interface MakeUgcVideoWorkflowInput {
  /** API mints this before workflow start, identifies the composed skill_run row. */
  skill_run_id: string;
  user_id: string;
  /** Already-resolved identity. Exactly one of: description set, OR portrait_url set. */
  identity:
    | { mode: 'description'; description: string; setting?: string; realism_target: 'natural' | 'commercial' | 'raw_iphone' }
    | { mode: 'portrait_url'; portrait_url: string };
  character_description?: string;
  script: string;
  duration: 5 | 10 | 15;
  location?: string;
  pose?: string;
  aspect_ratio: '9:16' | '1:1';
  subtitles?: boolean;
  subtitles_style?: 'hormozi' | 'tiktok' | 'minimal';
}

export interface MakeUgcVideoWorkflowResult {
  skill_run_id: string;
  portrait_url: string;
  character_sheet_url: string;
  /** Final video — subtitled when subtitles=true, raw selfie otherwise. */
  video_url: string;
  /** Always populated. The raw selfie before subtitles. */
  video_url_unsubtitled: string;
  credits_actual_usd: number;
  duration_seconds: 5 | 10 | 15;
}

const NON_RETRYABLE = [
  'INVALID_INPUT',
  'BUDGET_CAP_PRIMITIVE',
  'BUDGET_CAP_DAY',
  'REFERENCE_FETCH_FAILED',
  'REFERENCE_NOT_IMAGE',
  'REFERENCE_URL_NOT_ALLOWED',
  'PROVIDER_UNCONFIGURED',
  'OPENAI_400',
  'OPENAI_401',
  'OPENAI_403',
  'OPENAI_404',
  'OPENAI_413',
  'OPENAI_415',
  'OPENAI_422',
  'OPENAI_451',
  'EVOLINK_400',
  'EVOLINK_401',
  'EVOLINK_403',
  'EVOLINK_404',
  'EVOLINK_413',
  'EVOLINK_415',
  'EVOLINK_422',
  'EVOLINK_451',
  'INSUFFICIENT_CREDITS',
  'REFERENCE_NOT_VIDEO',
  'TRANSCRIBE_EMPTY',
];

const { portraitGpt2 } = proxyActivities<PrimitiveActivities>({
  startToCloseTimeout: '5 minutes',
  heartbeatTimeout: '90 seconds',
  retry: { initialInterval: '5s', maximumInterval: '60s', backoffCoefficient: 2, maximumAttempts: 3, nonRetryableErrorTypes: NON_RETRYABLE },
});
const { characterSheetGpt2 } = proxyActivities<PrimitiveActivities>({
  startToCloseTimeout: '5 minutes',
  heartbeatTimeout: '90 seconds',
  retry: { initialInterval: '5s', maximumInterval: '60s', backoffCoefficient: 2, maximumAttempts: 3, nonRetryableErrorTypes: NON_RETRYABLE },
});
const { simpleSelfie } = proxyActivities<PrimitiveActivities>({
  startToCloseTimeout: '20 minutes',
  heartbeatTimeout: '5 minutes',
  retry: { initialInterval: '10s', maximumInterval: '2m', backoffCoefficient: 2, maximumAttempts: 3, nonRetryableErrorTypes: NON_RETRYABLE },
});
const { subtitles } = proxyActivities<PrimitiveActivities>({
  startToCloseTimeout: '10 minutes',
  heartbeatTimeout: '90 seconds',
  retry: { initialInterval: '5s', maximumInterval: '60s', backoffCoefficient: 2, maximumAttempts: 3, nonRetryableErrorTypes: NON_RETRYABLE },
});
const { composedSkillState } = proxyActivities<PrimitiveActivities>({
  startToCloseTimeout: '30 seconds',
  retry: { maximumAttempts: 3 },
});

// Terminal-failure compensation: refund every charged child run and mark the
// skill_run failed, so a paid render that never completes returns the user's
// credits and does not sit stuck 'running'. Idempotent (refund_credits guards
// ALREADY_REFUNDED / NO_DEDUCTION_FOUND — portrait/sheet are billed 0 so their
// refunds no-op; selfie + subtitles are the real charges). Flagship money fix.
const { refundCredits } = proxyActivities<PrimitiveActivities>({
  startToCloseTimeout: '30 seconds',
  retry: { initialInterval: '2s', maximumInterval: '20s', backoffCoefficient: 2, maximumAttempts: 5 },
});

export async function makeUgcVideoWorkflow(
  input: MakeUgcVideoWorkflowInput,
): Promise<MakeUgcVideoWorkflowResult> {
  try {
    return await makeUgcVideoImpl(input);
  } catch (err) {
    const steps = ['portrait', 'sheet', 'selfie', 'subtitles'] as const;
    for (const step of steps) {
      await refundCredits({ primitive_run_id: makeChildRunId(input.skill_run_id, step) });
    }
    await composedSkillState({
      skill_run_id: input.skill_run_id,
      status: 'failed',
      finished_at_now: true,
    });
    throw err;
  }
}

async function makeUgcVideoImpl(
  input: MakeUgcVideoWorkflowInput,
): Promise<MakeUgcVideoWorkflowResult> {
  await composedSkillState({
    skill_run_id: input.skill_run_id,
    status: 'running',
    current_step: 'portrait',
    started_at_now: true,
  });

  // Step 1: portrait (skipped when caller supplied portrait_url).
  let portraitUrl: string;
  let totalCredits = 0;
  if (input.identity.mode === 'description') {
    const portraitInput: PortraitGpt2ActivityInput = {
      // Worker mints its own primitive_run_id via gen_random_uuid default;
      // but the column has no DEFAULT yet for portrait_gpt2 inserts that
      // omit id. Use a deterministic uuid via temporal random? Simpler:
      // the Activity expects primitive_run_id in its input. We mint here.
      primitive_run_id: makeChildRunId(input.skill_run_id, 'portrait'),
      user_id: input.user_id,
      skill_run_id: input.skill_run_id,
      input: {
        description: input.identity.description,
        setting: input.identity.setting,
        aspect_ratio: '1:1',
        realism_target: input.identity.realism_target,
      },
    };
    const r: PortraitGpt2ActivityResult = await portraitGpt2(portraitInput);
    portraitUrl = r.portrait_url;
    totalCredits += r.credits_actual_usd;
  } else {
    portraitUrl = input.identity.portrait_url;
  }

  await composedSkillState({
    skill_run_id: input.skill_run_id,
    current_step: 'character_sheet',
  });

  // Step 2: character sheet
  const sheetInput: CharacterSheetGpt2ActivityInput = {
    primitive_run_id: makeChildRunId(input.skill_run_id, 'sheet'),
    user_id: input.user_id,
    skill_run_id: input.skill_run_id,
    // The sheet is free inside a video — only a standalone make_character_sheet charges.
    bill_credits: false,
    input: {
      portrait_url: portraitUrl,
      description: input.character_description,
      aspect_ratio: '1:1',
    },
  };
  const sheet: CharacterSheetGpt2ActivityResult = await characterSheetGpt2(sheetInput);
  totalCredits += sheet.credits_actual_usd;

  await composedSkillState({
    skill_run_id: input.skill_run_id,
    current_step: 'selfie',
  });

  // Step 3: simple selfie
  const selfieInput: SimpleSelfieActivityInput = {
    primitive_run_id: makeChildRunId(input.skill_run_id, 'selfie'),
    user_id: input.user_id,
    skill_run_id: input.skill_run_id,
    portrait_url: portraitUrl,
    input: {
      character_sheet_url: sheet.character_sheet_url,
      duration: input.duration,
      script: input.script,
      location: input.location,
      pose: input.pose,
      aspect_ratio: input.aspect_ratio,
    },
  };
  const video: SimpleSelfieActivityResult = await simpleSelfie(selfieInput);
  totalCredits += video.credits_actual_usd;

  // Step 4 (optional): burn subtitles
  let finalVideoUrl = video.video_url;
  if (input.subtitles !== false) {
    await composedSkillState({
      skill_run_id: input.skill_run_id,
      current_step: 'subtitles',
    });
    const subsInput: SubtitlesActivityInput = {
      primitive_run_id: makeChildRunId(input.skill_run_id, 'subtitles'),
      user_id: input.user_id,
      skill_run_id: input.skill_run_id,
      input: {
        video_url: video.video_url,
        transcript: input.script,
        style: input.subtitles_style ?? 'hormozi',
        aspect_ratio: input.aspect_ratio,
      },
    };
    const subs: SubtitlesActivityResult = await subtitles(subsInput);
    totalCredits += subs.credits_actual_usd;
    finalVideoUrl = subs.video_url;
  }

  const finalOutput = {
    portrait_url: portraitUrl,
    character_sheet_url: sheet.character_sheet_url,
    video_url: finalVideoUrl,
    video_url_unsubtitled: video.video_url,
    credits_actual_usd: totalCredits,
    duration_seconds: input.duration,
  };

  await composedSkillState({
    skill_run_id: input.skill_run_id,
    status: 'succeeded',
    current_step: 'done',
    finished_at_now: true,
    final_output: finalOutput,
  });

  return {
    skill_run_id: input.skill_run_id,
    ...finalOutput,
  };
}

/**
 * Deterministic child primitive_run_id derived from the skill_run_id
 * and step name. Keeps the IDs idempotent across workflow retries.
 *
 * NOTE: this runs inside a Temporal workflow isolate — no Node crypto
 * APIs are available. Use Temporal's workflow random via uuid4().
 */
function makeChildRunId(
  skillRunId: string,
  step: 'portrait' | 'sheet' | 'selfie' | 'subtitles',
): string {
  // Replace the last 12 hex chars of the skill_run_id with the step
  // hash, keeping the uuid shape and remaining deterministic.
  const stepHash: Record<string, string> = {
    portrait: '11111111aaaa',
    sheet: '22222222bbbb',
    selfie: '33333333cccc',
    subtitles: '44444444dddd',
  };
  const base = skillRunId.replace(/[^a-f0-9-]/gi, '').toLowerCase();
  return base.slice(0, base.length - 12) + stepHash[step];
}
