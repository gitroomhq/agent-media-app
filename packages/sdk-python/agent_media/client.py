# Copyright 2026 agent-media contributors. Apache-2.0 license.

"""Sync + async client for agent-media API v2."""

from __future__ import annotations

import asyncio
import time
import uuid
from typing import Any

import httpx

DEFAULT_BASE_URL = "https://api.agent-media.ai"


class AgentMediaError(Exception):
    """Raised when the API returns an error."""

    def __init__(self, status: int, code: str, message: str, details: list | None = None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.details = details


class AgentMedia:
    """Sync client for agent-media video generation API.

    Args:
        api_key: Your API key (ma_xxx format).
        base_url: Override the API base URL.
        timeout: Request timeout in seconds (default 60).
    """

    def __init__(
        self,
        api_key: str,
        base_url: str = DEFAULT_BASE_URL,
        timeout: float = 60.0,
    ):
        self._client = httpx.Client(
            base_url=base_url,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            timeout=timeout,
        )
        # v2 product surface — `client.v2.selfie(...)`, `client.v2.create_character(...)`, etc.
        from .v2 import AgentMediaV2  # local import to avoid circular ref
        self.v2 = AgentMediaV2(self._client)

    def _request(self, method: str, path: str, **kwargs: Any) -> dict:
        resp = self._client.request(method, path, **kwargs)
        data = resp.json()
        if not resp.is_success:
            error = data.get("error", {})
            if isinstance(error, dict):
                raise AgentMediaError(
                    resp.status_code,
                    error.get("code", "UNKNOWN"),
                    error.get("message", "Request failed"),
                    error.get("details"),
                )
            raise AgentMediaError(resp.status_code, "UNKNOWN", str(data))
        return data

    def list_actors(self, limit: int = 50, offset: int = 0) -> dict:
        """List available AI actors."""
        return self._request("GET", f"/v1/actors?limit={limit}&offset={offset}")

    def get_video_status(self, job_id: str) -> dict:
        """Get video generation job status."""
        return self._request("GET", f"/v1/videos/{job_id}")

    def submit_video(self, **params: Any) -> dict:
        """Submit a UGC video generation job. Returns immediately."""
        return self._request("POST", "/v1/generate/ugc_video", json=params)

    def submit_subtitle(self, **params: Any) -> dict:
        """Submit a subtitle job."""
        return self._request("POST", "/v1/generate/subtitle", json=params)

    def submit_saas_review(self, **params: Any) -> dict:
        """Submit a SaaS Review job."""
        return self._request("POST", "/v1/generate/saas_review", json=params)

    def submit_product_review(self, **params: Any) -> dict:
        """Deprecated wrapper for submit_saas_review."""
        return self.submit_saas_review(**params)

    def submit_show_your_app(
        self,
        app_screenshot_url: str,
        script: str,
        actor_slug: str | None = None,
        duration: int = 5,
        subtitle_style: str = "hormozi",
        webhook_url: str | None = None,
    ) -> dict:
        """Submit a Show Your App job.

        AI actor holds a phone showing your app screenshot, with Hormozi-style
        subtitles burned in. `app_screenshot_url` MUST be a vertical (portrait)
        PNG/JPEG/WebP. If `actor_slug` is omitted, a random actor is selected.
        Script is capped at 3 words/sec * duration.
        """
        body: dict = {
            "app_screenshot_url": app_screenshot_url,
            "script": script,
            "duration": duration,
            "subtitle_style": subtitle_style,
        }
        if actor_slug is not None:
            body["actor_slug"] = actor_slug
        if webhook_url is not None:
            body["webhook_url"] = webhook_url
        return self._request("POST", "/v1/generate/show_your_app", json=body)

    def submit_product_acting(
        self,
        product_image_url: str,
        actor_slug: str,
        actor_variant_id: str | None = None,
        product_name: str | None = None,
        product_description: str | None = None,
        script: str | None = None,
        template: str = "product-in-hand",
        acting_style: str = "raw-selfie",
        visual_style: str | None = None,
        duration: int = 5,
        subtitles: bool = True,
        subtitle_style: str = "hormozi",
        webhook_url: str | None = None,
    ) -> dict:
        """Submit a Product Acting UGC job.

        Creates a product-in-hand creator video from a product image and actor.
        If `script` is omitted, provide `product_description` and the API will
        generate a short script.
        """
        body: dict = {
            "product_image_url": product_image_url,
            "actor_slug": actor_slug,
            "template": template,
            "acting_style": acting_style,
            "duration": duration,
            "subtitles": subtitles,
            "subtitle_style": subtitle_style,
        }
        if actor_variant_id is not None:
            body["actor_variant_id"] = actor_variant_id
        if product_name is not None:
            body["product_name"] = product_name
        if product_description is not None:
            body["product_description"] = product_description
        if script is not None:
            body["script"] = script
        if visual_style is not None:
            body["visual_style"] = visual_style
        if webhook_url is not None:
            body["webhook_url"] = webhook_url
        return self._request("POST", "/v1/generate/product_acting_ugc", json=body)

    def create_product_acting(
        self,
        timeout_seconds: int = 600,
        poll_interval: int = 5,
        **params: Any,
    ) -> dict:
        """Submit a Product Acting UGC job and wait for completion."""
        job = self.submit_product_acting(**params)
        start = time.time()
        while time.time() - start < timeout_seconds:
            status = self.get_video_status(job["job_id"])
            if status["status"] == "completed" and status.get("video_url"):
                return {
                    "job_id": job["job_id"],
                    "video_url": status["video_url"],
                    "credits_deducted": job.get("credits_deducted"),
                    "actor_slug": job.get("actor_slug"),
                    "duration": params.get("duration", job.get("estimated_duration")),
                }
            if status["status"] == "failed":
                raise AgentMediaError(
                    500,
                    "GENERATION_FAILED",
                    status.get("error_message", "Product Acting UGC generation failed"),
                )
            time.sleep(poll_interval)
        raise AgentMediaError(408, "TIMEOUT", f"Timed out. Job: {job['job_id']}")

    def create_show_your_app(
        self,
        app_screenshot_url: str,
        script: str,
        actor_slug: str | None = None,
        duration: int = 5,
        subtitle_style: str = "hormozi",
        timeout_seconds: int = 600,
        poll_interval: int = 5,
    ) -> dict:
        """Submit a Show Your App job and wait for completion."""
        job = self.submit_show_your_app(
            app_screenshot_url=app_screenshot_url,
            script=script,
            actor_slug=actor_slug,
            duration=duration,
            subtitle_style=subtitle_style,
        )
        start = time.time()
        while time.time() - start < timeout_seconds:
            status = self.get_video_status(job["job_id"])
            if status["status"] == "completed" and status.get("video_url"):
                return {
                    "job_id": job["job_id"],
                    "video_url": status["video_url"],
                    "credits_deducted": job.get("credits_deducted"),
                    "actor_slug": job.get("actor_slug"),
                    "duration": duration,
                }
            if status["status"] == "failed":
                raise AgentMediaError(
                    500,
                    "GENERATION_FAILED",
                    status.get("error_message", "Show Your App generation failed"),
                )
            time.sleep(poll_interval)
        raise AgentMediaError(408, "TIMEOUT", f"Timed out. Job: {job['job_id']}")

    def submit_laptop_ugc(
        self,
        script: str,
        app_screen_recording_url: str | None = None,
        app_screen_image_url: str | None = None,
        actor_slug: str | None = None,
        duration: int = 20,
        subtitle_style: str = "hormozi",
        webhook_url: str | None = None,
    ) -> dict:
        """Submit a Laptop UGC job.

        3-scene ad: actor holds laptop showing your app, scrolling B-roll, then
        a face-only selfie close. Native lip-synced audio. Provide EITHER
        ``app_screen_recording_url`` (mp4/mov, max 10 MB, 10s) OR
        ``app_screen_image_url`` (png/jpeg/webp, max 5 MB), not both. Script is
        capped at 3 words/sec * duration. ``duration`` must be 15 or 20.
        """
        if (app_screen_recording_url is None) == (app_screen_image_url is None):
            raise ValueError(
                "Provide exactly one of app_screen_recording_url or app_screen_image_url"
            )
        body: dict = {
            "script": script,
            "duration": duration,
            "subtitle_style": subtitle_style,
        }
        if app_screen_recording_url is not None:
            body["app_screen_recording_url"] = app_screen_recording_url
        if app_screen_image_url is not None:
            body["app_screen_image_url"] = app_screen_image_url
        if actor_slug is not None:
            body["actor_slug"] = actor_slug
        if webhook_url is not None:
            body["webhook_url"] = webhook_url
        return self._request("POST", "/v1/generate/laptop_ugc", json=body)

    def create_laptop_ugc(
        self,
        timeout_seconds: int = 900,
        poll_interval: int = 5,
        **params: Any,
    ) -> dict:
        """Submit a Laptop UGC job and wait for completion.

        Default timeout is 15 min — first job per actor adds ~3min for pose
        pre-generation; subsequent jobs are faster.
        """
        job = self.submit_laptop_ugc(**params)
        start = time.time()
        while time.time() - start < timeout_seconds:
            status = self.get_video_status(job["job_id"])
            if status["status"] == "completed" and status.get("video_url"):
                return {
                    "job_id": job["job_id"],
                    "video_url": status["video_url"],
                    "credits_deducted": job.get("credits_deducted"),
                    "actor_slug": job.get("actor_slug"),
                    "duration": params.get("duration", 20),
                }
            if status["status"] == "failed":
                raise AgentMediaError(
                    500,
                    "GENERATION_FAILED",
                    status.get("error_message", "Laptop UGC generation failed"),
                )
            time.sleep(poll_interval)
        raise AgentMediaError(408, "TIMEOUT", f"Timed out. Job: {job['job_id']}")

    def create_video(self, timeout_seconds: int = 600, poll_interval: int = 5, **params: Any) -> dict:
        """Generate a video and wait for completion.

        Returns dict with job_id, video_url, credits_deducted.
        """
        job = self.submit_video(**params)
        start = time.time()

        while time.time() - start < timeout_seconds:
            status = self.get_video_status(job["job_id"])

            if status["status"] == "completed" and status.get("video_url"):
                return {
                    "job_id": job["job_id"],
                    "video_url": status["video_url"],
                    "credits_deducted": job.get("credits_deducted"),
                    "duration": job.get("estimated_duration"),
                }

            if status["status"] == "failed":
                raise AgentMediaError(
                    500,
                    "GENERATION_FAILED",
                    status.get("error_message", "Video generation failed"),
                )

            time.sleep(poll_interval)

        raise AgentMediaError(408, "TIMEOUT", f"Timed out after {timeout_seconds}s. Job: {job['job_id']}")

    # ── Content Machine — 3-step character pipeline ─────────────────────
    # Each step is async at the API level — submit returns 202 + job_id;
    # poll GET /v1/videos/{id} until status="completed". The
    # storyboard-suggest endpoint is sync (no credits, returns 3 beat
    # options written by Claude Opus 4.7).

    def submit_character_sheet(
        self,
        description: str | None = None,
        actor_slug: str | None = None,
        reference_image_url: str | None = None,
        session_id: str | None = None,
    ) -> dict:
        """Step 1 — generate a multi-angle character reference sheet.

        Provide at least one of ``description`` / ``actor_slug`` /
        ``reference_image_url``. ``actor_slug`` and ``reference_image_url``
        are mutually exclusive. Pass ``session_id`` (a UUID) consistently
        across all 3 steps so the server can backstop the scene prompt.
        """
        if not (description or actor_slug or reference_image_url):
            raise ValueError(
                "Provide at least one of description, actor_slug, or reference_image_url"
            )
        if actor_slug and reference_image_url:
            raise ValueError("actor_slug and reference_image_url are mutually exclusive")
        body: dict = {}
        if description is not None:
            body["description"] = description
        if actor_slug is not None:
            body["actor_slug"] = actor_slug
        if reference_image_url is not None:
            body["reference_image_url"] = reference_image_url
        if session_id is not None:
            body["session_id"] = session_id
        return self._request("POST", "/v1/character/sheet-generate", json=body)

    def suggest_storyboard(
        self,
        actor_slug: str | None = None,
        character_description: str | None = None,
        vibe: str | None = None,
        duration: int = 10,
        n_panels: int = 6,
    ) -> dict:
        """Step 1.5 (optional) — get 3 AI-suggested beat-sequence options.

        Sync, no credits. Provide exactly one of ``actor_slug`` or
        ``character_description``.
        """
        if bool(actor_slug) == bool(character_description):
            raise ValueError("Provide exactly one of actor_slug or character_description")
        body: dict = {"duration": duration, "n_panels": n_panels}
        if actor_slug is not None:
            body["actor_slug"] = actor_slug
        if character_description is not None:
            body["character_description"] = character_description
        if vibe is not None:
            body["vibe"] = vibe
        return self._request("POST", "/v1/character/storyboard-suggest", json=body)

    def submit_character_storyboard(
        self,
        character_sheet_url: str,
        beats: list[str] | None = None,
        script: str | None = None,
        ratio: str = "9:16",
        session_id: str | None = None,
    ) -> dict:
        """Step 2 — paint a numbered storyboard panel grid.

        Pass either ``beats`` (3-10 short strings) or ``script``
        (free-text up to 1500 chars; the model splits it itself), not both.
        """
        if bool(beats) == bool(script):
            raise ValueError("Provide exactly one of beats or script")
        body: dict = {"character_sheet_url": character_sheet_url, "ratio": ratio}
        if beats is not None:
            body["beats"] = beats
        if script is not None:
            body["script"] = script
        if session_id is not None:
            body["session_id"] = session_id
        return self._request("POST", "/v1/character/storyboard-generate", json=body)

    def submit_character_video(
        self,
        character_sheet_url: str,
        storyboard_url: str,
        action_prompt: str | None = None,
        duration: int = 10,
        aspect_ratio: str = "9:16",
        generate_audio: bool = True,
        session_id: str | None = None,
        webhook_url: str | None = None,
    ) -> dict:
        """Step 3 — render the final 720p Seedance video."""
        body: dict = {
            "character_sheet_url": character_sheet_url,
            "storyboard_url": storyboard_url,
            "duration": duration,
            "aspect_ratio": aspect_ratio,
            "generate_audio": generate_audio,
        }
        if action_prompt is not None:
            body["action_prompt"] = action_prompt
        if session_id is not None:
            body["session_id"] = session_id
        if webhook_url is not None:
            body["webhook_url"] = webhook_url
        return self._request("POST", "/v1/generate/character_video", json=body)

    def create_character_video(
        self,
        description: str | None = None,
        actor_slug: str | None = None,
        reference_image_url: str | None = None,
        beats: list[str] | None = None,
        script: str | None = None,
        duration: int = 10,
        aspect_ratio: str = "9:16",
        generate_audio: bool = True,
        action_prompt: str | None = None,
        webhook_url: str | None = None,
        session_id: str | None = None,
        timeout_seconds: int = 1800,
        poll_interval: int = 5,
    ) -> dict:
        """Run the full 3-step pipeline end-to-end and return all URLs.

        Mints a ``session_id`` UUID once and threads it through all three
        steps so the server backstops the scene prompt from the storyboard.
        Default total timeout is 30 minutes.
        """
        if session_id is None:
            session_id = str(uuid.uuid4())

        # Step 1
        sheet_job = self.submit_character_sheet(
            description=description,
            actor_slug=actor_slug,
            reference_image_url=reference_image_url,
            session_id=session_id,
        )
        sheet = self._poll_until_done(sheet_job["job_id"], "character sheet", timeout_seconds, poll_interval)
        character_sheet_url = sheet.get("video_url") or sheet.get("character_sheet_url")
        if not character_sheet_url:
            raise AgentMediaError(500, "GENERATION_FAILED", f"character sheet completed without URL: {sheet}")

        # Step 2
        sb_job = self.submit_character_storyboard(
            character_sheet_url=character_sheet_url,
            beats=beats,
            script=script,
            ratio=aspect_ratio,
            session_id=session_id,
        )
        sb = self._poll_until_done(sb_job["job_id"], "storyboard", timeout_seconds, poll_interval)
        storyboard_url = sb.get("video_url") or sb.get("storyboard_url")
        if not storyboard_url:
            raise AgentMediaError(500, "GENERATION_FAILED", f"storyboard completed without URL: {sb}")

        # Step 3
        video_job = self.submit_character_video(
            character_sheet_url=character_sheet_url,
            storyboard_url=storyboard_url,
            action_prompt=action_prompt,
            duration=duration,
            aspect_ratio=aspect_ratio,
            generate_audio=generate_audio,
            session_id=session_id,
            webhook_url=webhook_url,
        )
        video = self._poll_until_done(video_job["job_id"], "character video", timeout_seconds, poll_interval)
        video_url = video.get("video_url")
        if not video_url:
            raise AgentMediaError(500, "GENERATION_FAILED", f"video completed without URL: {video}")

        return {
            "session_id": session_id,
            "character_sheet_url": character_sheet_url,
            "storyboard_url": storyboard_url,
            "video_url": video_url,
            "video_job_id": video_job["job_id"],
            "credits_deducted": video_job.get("credits_deducted"),
        }

    def _poll_until_done(self, job_id: str, label: str, timeout_seconds: int, poll_interval: int) -> dict:
        start = time.time()
        while time.time() - start < timeout_seconds:
            status = self.get_video_status(job_id)
            if status["status"] == "completed":
                return status
            if status["status"] == "failed":
                raise AgentMediaError(
                    500,
                    "GENERATION_FAILED",
                    status.get("error_message", f"{label} generation failed"),
                )
            time.sleep(poll_interval)
        raise AgentMediaError(408, "TIMEOUT", f"{label} timed out. Job: {job_id}")

    def close(self) -> None:
        """Close the underlying HTTP client."""
        self._client.close()

    def __enter__(self) -> "AgentMedia":
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()


class AsyncAgentMedia:
    """Async client for agent-media video generation API."""

    def __init__(
        self,
        api_key: str,
        base_url: str = DEFAULT_BASE_URL,
        timeout: float = 60.0,
    ):
        self._client = httpx.AsyncClient(
            base_url=base_url,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            timeout=timeout,
        )
        # v2 product surface — `await client.v2.selfie(...)` etc.
        from .v2 import AsyncAgentMediaV2  # local import to avoid circular ref
        self.v2 = AsyncAgentMediaV2(self._client)

    async def _request(self, method: str, path: str, **kwargs: Any) -> dict:
        resp = await self._client.request(method, path, **kwargs)
        data = resp.json()
        if not resp.is_success:
            error = data.get("error", {})
            if isinstance(error, dict):
                raise AgentMediaError(
                    resp.status_code,
                    error.get("code", "UNKNOWN"),
                    error.get("message", "Request failed"),
                    error.get("details"),
                )
            raise AgentMediaError(resp.status_code, "UNKNOWN", str(data))
        return data

    async def list_actors(self, limit: int = 50, offset: int = 0) -> dict:
        return await self._request("GET", f"/v1/actors?limit={limit}&offset={offset}")

    async def get_video_status(self, job_id: str) -> dict:
        return await self._request("GET", f"/v1/videos/{job_id}")

    async def submit_video(self, **params: Any) -> dict:
        return await self._request("POST", "/v1/generate/ugc_video", json=params)

    async def submit_subtitle(self, **params: Any) -> dict:
        return await self._request("POST", "/v1/generate/subtitle", json=params)

    async def submit_saas_review(self, **params: Any) -> dict:
        return await self._request("POST", "/v1/generate/saas_review", json=params)

    async def submit_product_review(self, **params: Any) -> dict:
        return await self.submit_saas_review(**params)

    async def submit_show_your_app(
        self,
        app_screenshot_url: str,
        script: str,
        actor_slug: str | None = None,
        duration: int = 5,
        subtitle_style: str = "hormozi",
        webhook_url: str | None = None,
    ) -> dict:
        body: dict = {
            "app_screenshot_url": app_screenshot_url,
            "script": script,
            "duration": duration,
            "subtitle_style": subtitle_style,
        }
        if actor_slug is not None:
            body["actor_slug"] = actor_slug
        if webhook_url is not None:
            body["webhook_url"] = webhook_url
        return await self._request("POST", "/v1/generate/show_your_app", json=body)

    async def submit_product_acting(
        self,
        product_image_url: str,
        actor_slug: str,
        actor_variant_id: str | None = None,
        product_name: str | None = None,
        product_description: str | None = None,
        script: str | None = None,
        template: str = "product-in-hand",
        acting_style: str = "raw-selfie",
        visual_style: str | None = None,
        duration: int = 5,
        subtitles: bool = True,
        subtitle_style: str = "hormozi",
        webhook_url: str | None = None,
    ) -> dict:
        body: dict = {
            "product_image_url": product_image_url,
            "actor_slug": actor_slug,
            "template": template,
            "acting_style": acting_style,
            "duration": duration,
            "subtitles": subtitles,
            "subtitle_style": subtitle_style,
        }
        if actor_variant_id is not None:
            body["actor_variant_id"] = actor_variant_id
        if product_name is not None:
            body["product_name"] = product_name
        if product_description is not None:
            body["product_description"] = product_description
        if script is not None:
            body["script"] = script
        if visual_style is not None:
            body["visual_style"] = visual_style
        if webhook_url is not None:
            body["webhook_url"] = webhook_url
        return await self._request("POST", "/v1/generate/product_acting_ugc", json=body)

    async def create_product_acting(
        self,
        timeout_seconds: int = 600,
        poll_interval: int = 5,
        **params: Any,
    ) -> dict:
        import asyncio
        job = await self.submit_product_acting(**params)
        start = time.time()
        while time.time() - start < timeout_seconds:
            status = await self.get_video_status(job["job_id"])
            if status["status"] == "completed" and status.get("video_url"):
                return {
                    "job_id": job["job_id"],
                    "video_url": status["video_url"],
                    "credits_deducted": job.get("credits_deducted"),
                    "actor_slug": job.get("actor_slug"),
                    "duration": params.get("duration", job.get("estimated_duration")),
                }
            if status["status"] == "failed":
                raise AgentMediaError(
                    500,
                    "GENERATION_FAILED",
                    status.get("error_message", "Product Acting UGC generation failed"),
                )
            await asyncio.sleep(poll_interval)
        raise AgentMediaError(408, "TIMEOUT", f"Timed out. Job: {job['job_id']}")

    async def create_show_your_app(
        self,
        app_screenshot_url: str,
        script: str,
        actor_slug: str | None = None,
        duration: int = 5,
        subtitle_style: str = "hormozi",
        timeout_seconds: int = 600,
        poll_interval: int = 5,
    ) -> dict:
        import asyncio
        job = await self.submit_show_your_app(
            app_screenshot_url=app_screenshot_url,
            script=script,
            actor_slug=actor_slug,
            duration=duration,
            subtitle_style=subtitle_style,
        )
        start = time.time()
        while time.time() - start < timeout_seconds:
            status = await self.get_video_status(job["job_id"])
            if status["status"] == "completed" and status.get("video_url"):
                return {
                    "job_id": job["job_id"],
                    "video_url": status["video_url"],
                    "credits_deducted": job.get("credits_deducted"),
                    "actor_slug": job.get("actor_slug"),
                    "duration": duration,
                }
            if status["status"] == "failed":
                raise AgentMediaError(500, "GENERATION_FAILED", status.get("error_message", "Failed"))
            await asyncio.sleep(poll_interval)
        raise AgentMediaError(408, "TIMEOUT", f"Timed out. Job: {job['job_id']}")

    async def submit_laptop_ugc(
        self,
        script: str,
        app_screen_recording_url: str | None = None,
        app_screen_image_url: str | None = None,
        actor_slug: str | None = None,
        duration: int = 20,
        subtitle_style: str = "hormozi",
        webhook_url: str | None = None,
    ) -> dict:
        if (app_screen_recording_url is None) == (app_screen_image_url is None):
            raise ValueError(
                "Provide exactly one of app_screen_recording_url or app_screen_image_url"
            )
        body: dict = {
            "script": script,
            "duration": duration,
            "subtitle_style": subtitle_style,
        }
        if app_screen_recording_url is not None:
            body["app_screen_recording_url"] = app_screen_recording_url
        if app_screen_image_url is not None:
            body["app_screen_image_url"] = app_screen_image_url
        if actor_slug is not None:
            body["actor_slug"] = actor_slug
        if webhook_url is not None:
            body["webhook_url"] = webhook_url
        return await self._request("POST", "/v1/generate/laptop_ugc", json=body)

    async def create_laptop_ugc(
        self,
        timeout_seconds: int = 900,
        poll_interval: int = 5,
        **params: Any,
    ) -> dict:
        import asyncio
        job = await self.submit_laptop_ugc(**params)
        start = time.time()
        while time.time() - start < timeout_seconds:
            status = await self.get_video_status(job["job_id"])
            if status["status"] == "completed" and status.get("video_url"):
                return {
                    "job_id": job["job_id"],
                    "video_url": status["video_url"],
                    "credits_deducted": job.get("credits_deducted"),
                    "actor_slug": job.get("actor_slug"),
                    "duration": params.get("duration", 20),
                }
            if status["status"] == "failed":
                raise AgentMediaError(500, "GENERATION_FAILED", status.get("error_message", "Failed"))
            await asyncio.sleep(poll_interval)
        raise AgentMediaError(408, "TIMEOUT", f"Timed out. Job: {job['job_id']}")

    async def create_video(self, timeout_seconds: int = 600, poll_interval: int = 5, **params: Any) -> dict:
        import asyncio
        job = await self.submit_video(**params)
        start = time.time()
        while time.time() - start < timeout_seconds:
            status = await self.get_video_status(job["job_id"])
            if status["status"] == "completed" and status.get("video_url"):
                return {"job_id": job["job_id"], "video_url": status["video_url"], "credits_deducted": job.get("credits_deducted")}
            if status["status"] == "failed":
                raise AgentMediaError(500, "GENERATION_FAILED", status.get("error_message", "Failed"))
            await asyncio.sleep(poll_interval)
        raise AgentMediaError(408, "TIMEOUT", f"Timed out. Job: {job['job_id']}")

    # ── Content Machine — 3-step character pipeline (async) ─────────────

    async def submit_character_sheet(
        self,
        description: str | None = None,
        actor_slug: str | None = None,
        reference_image_url: str | None = None,
        session_id: str | None = None,
    ) -> dict:
        if not (description or actor_slug or reference_image_url):
            raise ValueError(
                "Provide at least one of description, actor_slug, or reference_image_url"
            )
        if actor_slug and reference_image_url:
            raise ValueError("actor_slug and reference_image_url are mutually exclusive")
        body: dict = {}
        if description is not None:
            body["description"] = description
        if actor_slug is not None:
            body["actor_slug"] = actor_slug
        if reference_image_url is not None:
            body["reference_image_url"] = reference_image_url
        if session_id is not None:
            body["session_id"] = session_id
        return await self._request("POST", "/v1/character/sheet-generate", json=body)

    async def suggest_storyboard(
        self,
        actor_slug: str | None = None,
        character_description: str | None = None,
        vibe: str | None = None,
        duration: int = 10,
        n_panels: int = 6,
    ) -> dict:
        if bool(actor_slug) == bool(character_description):
            raise ValueError("Provide exactly one of actor_slug or character_description")
        body: dict = {"duration": duration, "n_panels": n_panels}
        if actor_slug is not None:
            body["actor_slug"] = actor_slug
        if character_description is not None:
            body["character_description"] = character_description
        if vibe is not None:
            body["vibe"] = vibe
        return await self._request("POST", "/v1/character/storyboard-suggest", json=body)

    async def submit_character_storyboard(
        self,
        character_sheet_url: str,
        beats: list[str] | None = None,
        script: str | None = None,
        ratio: str = "9:16",
        session_id: str | None = None,
    ) -> dict:
        if bool(beats) == bool(script):
            raise ValueError("Provide exactly one of beats or script")
        body: dict = {"character_sheet_url": character_sheet_url, "ratio": ratio}
        if beats is not None:
            body["beats"] = beats
        if script is not None:
            body["script"] = script
        if session_id is not None:
            body["session_id"] = session_id
        return await self._request("POST", "/v1/character/storyboard-generate", json=body)

    async def submit_character_video(
        self,
        character_sheet_url: str,
        storyboard_url: str,
        action_prompt: str | None = None,
        duration: int = 10,
        aspect_ratio: str = "9:16",
        generate_audio: bool = True,
        session_id: str | None = None,
        webhook_url: str | None = None,
    ) -> dict:
        body: dict = {
            "character_sheet_url": character_sheet_url,
            "storyboard_url": storyboard_url,
            "duration": duration,
            "aspect_ratio": aspect_ratio,
            "generate_audio": generate_audio,
        }
        if action_prompt is not None:
            body["action_prompt"] = action_prompt
        if session_id is not None:
            body["session_id"] = session_id
        if webhook_url is not None:
            body["webhook_url"] = webhook_url
        return await self._request("POST", "/v1/generate/character_video", json=body)

    async def create_character_video(
        self,
        description: str | None = None,
        actor_slug: str | None = None,
        reference_image_url: str | None = None,
        beats: list[str] | None = None,
        script: str | None = None,
        duration: int = 10,
        aspect_ratio: str = "9:16",
        generate_audio: bool = True,
        action_prompt: str | None = None,
        webhook_url: str | None = None,
        session_id: str | None = None,
        timeout_seconds: int = 1800,
        poll_interval: int = 5,
    ) -> dict:
        """Run the full 3-step pipeline end-to-end. Same shape as the sync version."""
        if session_id is None:
            session_id = str(uuid.uuid4())

        sheet_job = await self.submit_character_sheet(
            description=description,
            actor_slug=actor_slug,
            reference_image_url=reference_image_url,
            session_id=session_id,
        )
        sheet = await self._poll_until_done(sheet_job["job_id"], "character sheet", timeout_seconds, poll_interval)
        character_sheet_url = sheet.get("video_url") or sheet.get("character_sheet_url")
        if not character_sheet_url:
            raise AgentMediaError(500, "GENERATION_FAILED", f"character sheet completed without URL: {sheet}")

        sb_job = await self.submit_character_storyboard(
            character_sheet_url=character_sheet_url,
            beats=beats,
            script=script,
            ratio=aspect_ratio,
            session_id=session_id,
        )
        sb = await self._poll_until_done(sb_job["job_id"], "storyboard", timeout_seconds, poll_interval)
        storyboard_url = sb.get("video_url") or sb.get("storyboard_url")
        if not storyboard_url:
            raise AgentMediaError(500, "GENERATION_FAILED", f"storyboard completed without URL: {sb}")

        video_job = await self.submit_character_video(
            character_sheet_url=character_sheet_url,
            storyboard_url=storyboard_url,
            action_prompt=action_prompt,
            duration=duration,
            aspect_ratio=aspect_ratio,
            generate_audio=generate_audio,
            session_id=session_id,
            webhook_url=webhook_url,
        )
        video = await self._poll_until_done(video_job["job_id"], "character video", timeout_seconds, poll_interval)
        video_url = video.get("video_url")
        if not video_url:
            raise AgentMediaError(500, "GENERATION_FAILED", f"video completed without URL: {video}")

        return {
            "session_id": session_id,
            "character_sheet_url": character_sheet_url,
            "storyboard_url": storyboard_url,
            "video_url": video_url,
            "video_job_id": video_job["job_id"],
            "credits_deducted": video_job.get("credits_deducted"),
        }

    async def _poll_until_done(self, job_id: str, label: str, timeout_seconds: int, poll_interval: int) -> dict:
        start = asyncio.get_event_loop().time()
        while asyncio.get_event_loop().time() - start < timeout_seconds:
            status = await self.get_video_status(job_id)
            if status["status"] == "completed":
                return status
            if status["status"] == "failed":
                raise AgentMediaError(
                    500,
                    "GENERATION_FAILED",
                    status.get("error_message", f"{label} generation failed"),
                )
            await asyncio.sleep(poll_interval)
        raise AgentMediaError(408, "TIMEOUT", f"{label} timed out. Job: {job_id}")

    async def close(self) -> None:
        await self._client.aclose()

    async def __aenter__(self) -> "AsyncAgentMedia":
        return self

    async def __aexit__(self, *args: Any) -> None:
        await self.close()
