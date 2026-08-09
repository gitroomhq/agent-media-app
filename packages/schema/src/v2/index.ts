// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * @agent-media/schema/v2 — v2 product line surface.
 *
 * Old code keeps importing from `@agent-media/schema`. New code
 * (sdk-ts/v2, sdk-python.v2, MCP loop, CLI v2 commands, api-v2
 * /v2/* routes, new dashboard, new docs, new SKILL.md) imports
 * exclusively from `@agent-media/schema/v2`.
 */

export * from './selfie.js';
export * from './character.js';
export * from './subtitle.js';
export * from './crazy-look.js';
export * from './generators.js';
