// Copyright 2026 agent-media contributors. Apache-2.0 license.
//
// OpenAI's safety refusal (a reference photo of a public figure, explicit or
// violent content) must reach the user as an instruction they can act on,
// not as the provider's raw "rejected by the safety system" sentence.
import { describe, expect, it } from 'vitest';
import OpenAI from 'openai';
import { classifyOpenAIError, classifySafetyRejection, SAFETY_REJECTED_MESSAGE } from '../client/openai.js';

const safetyText =
  '400 Your request was rejected by the safety system. If you believe this is an error, contact us at help.openai.com and include the request ID req_8b72.';

describe('classifyOpenAIError', () => {
  it('maps a safety-system 400 to SAFETY_REJECTED with a user-fixable message, not retryable', () => {
    const err = new OpenAI.APIError(400, { error: { message: safetyText } }, safetyText, {});
    const c = classifyOpenAIError(err);
    expect(c.code).toBe('SAFETY_REJECTED');
    expect(c.retryable).toBe(false);
    expect(c.message).toBe(SAFETY_REJECTED_MESSAGE);
    expect(c.message).not.toContain('help.openai.com');
    expect(c.message).toContain('public figure');
  });

  it('keeps other 4xx errors as OPENAI_<status>', () => {
    const err = new OpenAI.APIError(400, { error: { message: 'invalid size' } }, 'invalid size', {});
    const c = classifyOpenAIError(err);
    expect(c.code).toBe('OPENAI_400');
    expect(c.retryable).toBe(false);
  });

  it('recognises the content_policy_violation and moderation wording too', () => {
    expect(classifySafetyRejection('content_policy_violation: x')?.code).toBe('SAFETY_REJECTED');
    expect(classifySafetyRejection('moderation_blocked')?.code).toBe('SAFETY_REJECTED');
    expect(classifySafetyRejection('rate limit')).toBeNull();
  });
});
