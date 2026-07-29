# Copyright 2026 agent-media contributors. Apache-2.0 license.

"""
agent_media.v2 — Python SDK for the v2 product surface.

    from agent_media import AgentMedia

    client = AgentMedia(api_key="ma_xxx")

    character = client.v2.create_character(
        photo_url="https://...",
        display_name="sofia",
        description="25, asian, long wavy dark hair",
    )

    video = client.v2.selfie(
        character_id=character["character_id"],
        script="...",
    )

Mirrors the TypeScript SDK at packages/sdk-ts/src/v2. Adding the next
v2 op = a few lines in `client.py` (or codegen when we hit 5+).
"""

from .client import AgentMediaV2, AsyncAgentMediaV2

__all__ = ["AgentMediaV2", "AsyncAgentMediaV2"]
