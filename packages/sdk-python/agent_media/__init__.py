# Copyright 2026 agent-media contributors. Apache-2.0 license.

"""
agent-media Python SDK — AI UGC video generation.

Usage:
    from agent_media import AgentMedia

    client = AgentMedia(api_key="ma_xxx")
    video = client.create_video(script="...", actor_slug="sofia")
    print(video["video_url"])
"""

from .client import AgentMedia, AgentMediaError

__all__ = ["AgentMedia", "AgentMediaError"]
__version__ = "0.1.0"
