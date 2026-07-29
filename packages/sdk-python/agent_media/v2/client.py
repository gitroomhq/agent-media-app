# Copyright 2026 agent-media contributors. Apache-2.0 license.

"""v2 product surface — sync and async clients."""

from __future__ import annotations

import asyncio
import time
from typing import Any, Optional, TYPE_CHECKING

if TYPE_CHECKING:  # avoid circular import at runtime
    import httpx


class AgentMediaV2:
    """
    Synchronous v2 surface. Bound to an AgentMedia instance — users access it
    via `client.v2`. Each method is a thin wrapper over an api-v2 REST route
    declared in @agentmedia/schema/v2 → V2_GENERATORS.
    """

    def __init__(self, http_client: "httpx.Client") -> None:
        self._http = http_client

    def _request(self, method: str, path: str, **kwargs: Any) -> dict:
        resp = self._http.request(method, path, **kwargs)
        # Import here so the module loads without httpx installed at parse time.
        from ..client import AgentMediaError  # type: ignore
        data: Any
        try:
            data = resp.json()
        except Exception:
            data = {}
        if not resp.is_success:
            error = data.get("error", {}) if isinstance(data, dict) else {}
            if isinstance(error, dict):
                raise AgentMediaError(
                    resp.status_code,
                    error.get("code", "UNKNOWN"),
                    error.get("message", "Request failed"),
                    error.get("details") or error.get("issues"),
                )
            raise AgentMediaError(resp.status_code, "UNKNOWN", str(data))
        return data  # type: ignore[return-value]

    # ── v2 generator endpoints ─────────────────────────────────────────
    def selfie(self, **params: Any) -> dict:
        """Submit a v2 Selfie job. Returns immediately with job_id."""
        return self._request("POST", "/v2/selfie", json=params)

    def create_character(self, **params: Any) -> dict:
        """Create + persist a v2 character. Returns immediately with job_id."""
        return self._request("POST", "/v2/characters", json=params)

    # ── status + polling ───────────────────────────────────────────────
    def status(self, job_id: str) -> dict:
        """Status of any v2 job. Same shape as the v1 status route."""
        return self._request("GET", f"/v1/videos/{job_id}")

    def run_until_done(
        self,
        submission: dict,
        *,
        interval_seconds: int = 5,
        timeout_seconds: int = 600,
    ) -> dict:
        """
        Poll until terminal (completed | failed) or timeout. Returns the
        final status row.
        """
        job_id = submission["job_id"]
        deadline = time.monotonic() + timeout_seconds
        while time.monotonic() < deadline:
            s = self.status(job_id)
            if s.get("status") in ("completed", "failed"):
                return s
            time.sleep(interval_seconds)
        raise TimeoutError(
            f"v2 SDK: job {job_id} did not complete within {timeout_seconds}s"
        )


class AsyncAgentMediaV2:
    """
    Async variant of AgentMediaV2. Bound to an AsyncAgentMedia instance —
    users access it via `client.v2`.
    """

    def __init__(self, http_client: "httpx.AsyncClient") -> None:
        self._http = http_client

    async def _request(self, method: str, path: str, **kwargs: Any) -> dict:
        resp = await self._http.request(method, path, **kwargs)
        from ..client import AgentMediaError  # type: ignore
        data: Any
        try:
            data = resp.json()
        except Exception:
            data = {}
        if not resp.is_success:
            error = data.get("error", {}) if isinstance(data, dict) else {}
            if isinstance(error, dict):
                raise AgentMediaError(
                    resp.status_code,
                    error.get("code", "UNKNOWN"),
                    error.get("message", "Request failed"),
                    error.get("details") or error.get("issues"),
                )
            raise AgentMediaError(resp.status_code, "UNKNOWN", str(data))
        return data  # type: ignore[return-value]

    async def selfie(self, **params: Any) -> dict:
        return await self._request("POST", "/v2/selfie", json=params)

    async def create_character(self, **params: Any) -> dict:
        return await self._request("POST", "/v2/characters", json=params)

    async def status(self, job_id: str) -> dict:
        return await self._request("GET", f"/v1/videos/{job_id}")

    async def run_until_done(
        self,
        submission: dict,
        *,
        interval_seconds: int = 5,
        timeout_seconds: int = 600,
    ) -> dict:
        job_id = submission["job_id"]
        deadline = asyncio.get_event_loop().time() + timeout_seconds
        while asyncio.get_event_loop().time() < deadline:
            s = await self.status(job_id)
            if s.get("status") in ("completed", "failed"):
                return s
            await asyncio.sleep(interval_seconds)
        raise TimeoutError(
            f"v2 SDK: job {job_id} did not complete within {timeout_seconds}s"
        )
