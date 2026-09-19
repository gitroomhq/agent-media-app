// Copyright 2026 agent-media contributors. Apache-2.0 license.
import { isTemporaryImageUrl } from '@agentmedia/schema/v2';
/** Only our expiring image endpoint; it never redirects to user-controlled URLs. */
export const isTemporaryImage = (url: string): boolean =>
  isTemporaryImageUrl(url, process.env.PUBLIC_API_BASE);
