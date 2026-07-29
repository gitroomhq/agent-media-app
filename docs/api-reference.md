# agent-media REST API Reference

> Complete reference for the agent-media public REST API. All endpoints require authentication via API key unless otherwise noted.

## Overview

### Base URL

```
https://api.agent-media.ai/v1
```

For local development:

```
http://localhost:3000/api/v1
```

### Authentication

All API requests require a Bearer token in the `Authorization` header. API keys use the `ma_` prefix.

```
Authorization: Bearer ma_your_api_key_here
```

Get your API key from the [dashboard](https://agent-media.ai/settings) or create one via the API (see [Create API Key](#post-apiv1accountkeys)).

### Rate Limiting

Rate limit headers are returned on all responses when available:

| Header | Description |
|--------|-------------|
| `X-RateLimit-Limit` | Maximum requests per window |
| `X-RateLimit-Remaining` | Remaining requests in current window |
| `X-RateLimit-Reset` | Unix timestamp when the window resets |

When rate limited, the API returns HTTP `429` with a `Retry-After` header.

### Error Format

All errors follow a consistent JSON structure:

```json
{
  "error": {
    "code": "missing_script",
    "message": "Either script or prompt is required",
    "type": "validation_error"
  }
}
```

**Error types:**

| Type | HTTP Status | Description |
|------|-------------|-------------|
| `validation_error` | 400 | Invalid request parameters |
| `authentication_error` | 401, 403 | Missing or invalid API key |
| `insufficient_credits` | 402 | Not enough credits for the operation |
| `not_found` | 404 | Resource not found |
| `rate_limit_error` | 429 | Too many requests |
| `server_error` | 500, 502 | Internal error or edge function unreachable |

### Standard Headers

Every response includes:

| Header | Description |
|--------|-------------|
| `Content-Type` | Always `application/json` |
| `Cache-Control` | Always `no-store` |
| `X-Request-Id` | Unique request identifier (UUID) |

---

## Quickstart

### 1. Get an API key

Create an API key from the dashboard at https://agent-media.ai/settings, or via the API:

```bash
curl -X POST https://api.agent-media.ai/v1/account/keys \
  -H "Authorization: Bearer ma_your_existing_key" \
  -H "Content-Type: application/json" \
  -d '{"name": "My New Key"}'
```

### 2. Create a video

```bash
curl -X POST https://api.agent-media.ai/v1/videos \
  -H "Authorization: Bearer ma_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "script": "Ever wonder why top founders wake up at 5am? It is not about the alarm clock. It is about the mindset. Here is what they know that you do not.",
    "actor_slug": "emma",
    "style": "hormozi"
  }'
```

Response:

```json
{
  "job_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "submitted",
  "estimated_duration": 10,
  "credits_deducted": 300,
  "selected_voice": "cgSgspJ2msm6clMCkdW9",
  "voice_auto_detected": false
}
```

### 3. Poll for completion

```bash
curl https://api.agent-media.ai/v1/videos/a1b2c3d4-e5f6-7890-abcd-ef1234567890 \
  -H "Authorization: Bearer ma_your_api_key"
```

The response includes a `Retry-After: 5` header for non-terminal statuses. Poll every 5 seconds until `status` is `completed`, `failed`, or `canceled`.

### 4. Get the output URL

When `status` is `completed`, the response includes `output_url` with the final video URL.

---

## Endpoints

---

### POST /api/v1/videos

Create a new video generation job.

**Request Body (JSON):**

#### Core Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `script` | string | Yes* | - | The video script (50-3000 characters). Required unless `prompt` is provided. |
| `prompt` | string | Yes* | - | A text prompt to auto-generate the script via GPT-4o. Required unless `script` is provided. Costs 5 extra credits. |
| `product_url` | string | No | - | URL of a product page. Used alongside `prompt` for context when generating scripts. |
| `actor_slug` | string | No | - | Slug of a library actor for talking heads. Use GET /v1/actors to browse available actors. |
| `target_duration` | number | No | auto | Target video duration in seconds. Valid values: `5`, `10`, `15`. Auto-estimated from script length if omitted. |
| `style` | string | No | `"hormozi"` | Subtitle animation style. See [Subtitle Styles](#subtitle-styles). |

#### Advanced Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `tone` | string | No | - | Video tone. Values: `energetic`, `calm`, `confident`, `dramatic` |
| `voice_speed` | number | No | - | TTS voice speed multiplier. Range: `0.7` to `1.5` |
| `music` | string | No | - | Background music genre. Values: `chill`, `energetic`, `corporate`, `dramatic`, `upbeat` |
| `cta` | string | No | - | Call-to-action text for end screen. Max 100 characters. |
| `aspect_ratio` | string | No | `"9:16"` | Video aspect ratio. Values: `9:16`, `16:9`, `1:1` |
| `template` | string | No | - | Script/video template. Values: `monologue`, `testimonial`, `problem-solution`, `saas-review`, `before-after`, `listicle`, `product-demo` |
| `allow_broll` | boolean | No | `false` | Enable AI-generated B-roll cutaway scenes. |
| `broll_model` | string | No | - | B-roll video generation model. Values: `kling3`, `hailuo2`, `wan21` |
| `broll_images` | string[] | No | - | Array of image URLs to use as B-roll (max 10). Each must be a valid HTTP URL. |
| `product_image_url` | string | No | - | Product image URL for product-focused videos. Must be a valid HTTP URL. |
| `dub_language` | string | No | - | BCP-47 language code for dubbing (e.g. `"es"`, `"fr"`, `"de"`). |
| `webhook_url` | string | No | - | URL to receive a webhook when the job completes. |

#### Composition Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `composition_mode` | string | No | - | Set to `"pip"` for picture-in-picture layout. |
| `pip_options` | object | No | - | PIP overlay configuration (only used when `composition_mode` is `"pip"`). |
| `pip_options.position` | string | No | - | PIP position: `bottom-center`, `bottom-left`, `bottom-right` |
| `pip_options.size` | string | No | - | PIP size: `small`, `medium`, `large` |
| `pip_options.animation` | string | No | - | PIP animation: `slide-up`, `slide-left`, `slide-right`, `fade`, `scale` |
| `pip_options.frame_style` | string | No | - | PIP frame style: `none`, `rounded`, `shadow` |

#### Scene Control

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `scenes` | array | No | - | Manual scene definitions (max 30). Each scene object has the fields below. |
| `scenes[].type` | string | No | - | Scene type: `talking_head` or `broll` |
| `scenes[].text` | string | Yes | - | Narration text for this scene (required, non-empty) |
| `scenes[].visual_prompt` | string | No | - | Prompt for AI-generated visuals |
| `scenes[].image` | string | No | - | Image URL for the scene (must be valid HTTP URL) |

**Response (201):**

```json
{
  "job_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "submitted",
  "estimated_duration": 10,
  "credits_deducted": 300,
  "selected_voice": "cgSgspJ2msm6clMCkdW9",
  "voice_auto_detected": false
}
```

When using `prompt` (script generation), the response also includes:

```json
{
  "generated_script": "The auto-generated script text..."
}
```

**curl example:**

```bash
# Minimal — just a script
curl -X POST https://api.agent-media.ai/v1/videos \
  -H "Authorization: Bearer ma_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "script": "Ever wonder why top founders wake up at 5am? It is not about the alarm clock. It is about the mindset.",
    "actor_slug": "emma",
    "style": "hormozi"
  }'

# With AI script generation
curl -X POST https://api.agent-media.ai/v1/videos \
  -H "Authorization: Bearer ma_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Create a 10 second video about why developers love TypeScript",
    "actor_slug": "naomi",
    "target_duration": 10,
    "style": "bold",
    "music": "chill"
  }'

# PIP composition
curl -X POST https://api.agent-media.ai/v1/videos \
  -H "Authorization: Bearer ma_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "script": "Check out this amazing product that changed my morning routine...",
    "actor_slug": "sofia",
    "composition_mode": "pip",
    "pip_options": {
      "position": "bottom-right",
      "size": "medium",
      "animation": "slide-up",
      "frame_style": "rounded"
    },
    "allow_broll": true
  }'
```

---

### GET /api/v1/videos

List your video generation jobs with optional filtering and pagination.

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `limit` | number | No | `20` | Number of results to return. Max: `100`. |
| `offset` | number | No | `0` | Number of results to skip (for pagination). |
| `status` | string | No | - | Filter by job status: `submitted`, `queued`, `processing`, `completed`, `failed`, `canceled` |
| `sort` | string | No | `"newest"` | Sort order: `newest` or `oldest` |

**Response (200):**

```json
{
  "jobs": [
    {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "user_id": "user-uuid",
      "model_slug": "ugc-basic",
      "operation": "ugc_video",
      "status": "completed",
      "prompt": "Ever wonder why top founders wake up at 5am?...",
      "credit_cost": 300,
      "output_url": "https://media.agent-media.ai/videos/a1b2c3d4.mp4",
      "created_at": "2026-03-20T14:30:00.000Z",
      "started_at": "2026-03-20T14:30:01.000Z",
      "completed_at": "2026-03-20T14:32:15.000Z"
    }
  ],
  "total": 42
}
```

**curl example:**

```bash
# List recent videos
curl "https://api.agent-media.ai/v1/videos?limit=10" \
  -H "Authorization: Bearer ma_your_api_key"

# List only completed videos
curl "https://api.agent-media.ai/v1/videos?status=completed&limit=20" \
  -H "Authorization: Bearer ma_your_api_key"
```

---

### GET /api/v1/videos/:id

Get the status and details of a single video generation job.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | The job ID (UUID) returned from POST /api/v1/videos |

**Response (200) -- in progress:**

```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "user_id": "user-uuid",
  "model_slug": "ugc-basic",
  "operation": "ugc_video",
  "status": "processing",
  "prompt": "Ever wonder why top founders...",
  "credit_cost": 300,
  "output_url": null,
  "error_message": null,
  "created_at": "2026-03-20T14:30:00.000Z",
  "started_at": "2026-03-20T14:30:01.000Z",
  "completed_at": null
}
```

The response includes a `Retry-After: 5` header when the job is not in a terminal state (`completed`, `failed`, `canceled`). Use this to pace your polling.

**Response (200) -- completed:**

```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "completed",
  "output_url": "https://media.agent-media.ai/videos/a1b2c3d4.mp4",
  "completed_at": "2026-03-20T14:32:15.000Z"
}
```

**curl example:**

```bash
curl https://api.agent-media.ai/v1/videos/a1b2c3d4-e5f6-7890-abcd-ef1234567890 \
  -H "Authorization: Bearer ma_your_api_key"
```

---

### DELETE /api/v1/videos/:id

Soft-delete a video generation job. The video can be restored later.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | The job ID (UUID) |

**Response (200):**

```json
{
  "success": true,
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "deletedAt": "2026-03-20T15:00:00.000Z"
}
```

**curl example:**

```bash
curl -X DELETE https://api.agent-media.ai/v1/videos/a1b2c3d4-e5f6-7890-abcd-ef1234567890 \
  -H "Authorization: Bearer ma_your_api_key"
```

---

### POST /api/v1/videos/:id/cancel

Cancel a video generation job that is still in progress. Credits are refunded.

Only jobs with status `submitted`, `queued`, or `processing` can be canceled.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | The job ID (UUID) |

**Response (200):**

```json
{
  "canceled": true,
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "credits_refunded": 300,
  "refund_pending": false
}
```

If the refund fails, `refund_pending` will be `true` and `credits_refunded` will be `0`. The refund will be retried automatically.

**Error (400) -- job already finished:**

```json
{
  "error": {
    "code": "cannot_cancel",
    "message": "Job is already completed",
    "type": "validation_error"
  }
}
```

**curl example:**

```bash
curl -X POST https://api.agent-media.ai/v1/videos/a1b2c3d4-e5f6-7890-abcd-ef1234567890/cancel \
  -H "Authorization: Bearer ma_your_api_key"
```

---

### POST /api/v1/generate/show_your_app

Generate a **Show Your App** video: an AI actor holds a phone showing your app screenshot and reads your script, with Hormozi-style word-by-word subtitles burned in.

The actor is composited onto a green-screen template; the green phone screen is replaced with your app screenshot via GPT Image 2; the scene is animated with Seedance 2.0; then Hormozi subtitles are burned in and the final video is uploaded to R2.

**Request Body (JSON):**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `app_screenshot_url` | string | Yes | - | Publicly accessible URL of a **vertical** (portrait) app screenshot. PNG, JPEG, or WebP. Height must exceed width. |
| `script` | string | Yes | - | What the actor reads aloud (5–3000 chars). Word count capped at `3 × duration` (e.g. ≤15 words at 5s). |
| `actor_slug` | string | No | random | Slug of a specific actor. When omitted, a random actor is picked from the `show_your_app` preset pool. |
| `duration` | number | No | `5` | Video duration in seconds. Valid values: `5`, `10`, `15`. |
| `subtitle_style` | enum | No | `"hormozi"` | Subtitle style. Values: `hormozi`, `none`. |
| `webhook_url` | string | No | - | Webhook called with the final payload on completion. |

**Response (201):**

```json
{
  "job_id": "f2ac7e79-af71-4df2-8da6-b47d7f32d5be",
  "status": "submitted",
  "credits_deducted": 75,
  "actor_slug": "sarah",
  "actor_random": true,
  "subtitle_style": "hormozi"
}
```

**Error responses:**

| Status | Code | Meaning |
|--------|------|---------|
| 400 | `INVALID_IMAGE` | Screenshot URL could not be read or is not PNG/JPEG/WebP |
| 400 | `INVALID_IMAGE_ORIENTATION` | Screenshot is not vertical (width ≥ height) |
| 400 | `VALIDATION_ERROR` | Script exceeds word-rate cap or other schema failure |
| 402 | `INSUFFICIENT_CREDITS` | Not enough credits (costs 75) |
| 404 | `ACTOR_NOT_FOUND` | `actor_slug` does not exist |
| 503 | `NO_ACTORS_AVAILABLE` | No actors with `show_your_app` preset are available |

**curl example:**

```bash
curl -X POST https://api.agent-media.ai/v1/generate/show_your_app \
  -H "Authorization: Bearer ma_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "app_screenshot_url": "https://cdn.example.com/my-app.png",
    "script": "You really need to try this — it generates UGC videos in seconds.",
    "duration": 5
  }'
```

Poll `GET /api/v1/videos/:job_id` until status is `completed`, then fetch `video_url`.

**Credit cost:** 75 (flat, regardless of duration).

---

### POST /api/v1/generate/product_acting_ugc

Generate a **Product Acting UGC** video: an AI creator presents, holds, or reacts to your product image in a real-world UGC scenario. The pipeline creates a product/actor opening frame, animates it with speech, transcribes the final audio, and burns word-level synced subtitles.

**Request Body (JSON):**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `product_image_url` | string | Yes | - | Publicly accessible URL of the product image. PNG, JPEG, or WebP recommended. |
| `actor_slug` | string | Yes | - | Actor slug from `GET /v1/actors`. |
| `actor_variant_id` | uuid | No | - | Optional actor look/variant UUID. |
| `product_name` | string | No | - | Product name used for prompt and script context. |
| `product_description` | string | Required if no `script` | - | Product context used to generate a short script. |
| `script` | string | Required if no `product_description` | generated | Exact words the actor says. Word count capped at `3 × duration`. |
| `template` | enum | No | `product-in-hand` | Scenario: `product-in-hand`, `mirror-selfie`, `bathroom-reaction`, `kitchen-counter`, `car-selfie`, `couch-review`, `expert-interview`, `product-closeup`. |
| `acting_style` | enum | No | `raw-selfie` | Delivery: `raw-selfie`, `shocked`, `angry`, `excited`, `dramatic`, `weird-hook`, `casual-demo`, `honest-review`. |
| `visual_style` | string | No | - | Extra camera, pose, environment, or framing direction. |
| `duration` | number | No | `5` | Video duration in seconds. Valid values: `5`, `10`, `15`. |
| `subtitles` | boolean | No | `true` | Whether to burn synced subtitles into the final video. |
| `subtitle_style` | enum | No | `hormozi` | Values: `hormozi`, `none`. |
| `webhook_url` | string | No | - | Webhook called with the final payload on completion. |

**Response (201):**

```json
{
  "job_id": "f64b6806-4fca-44d5-967b-bae93c722d5b",
  "status": "submitted",
  "estimated_duration": 5,
  "credits_deducted": 205,
  "actor_slug": "sarah",
  "script": "I did not expect this perfume to smell this expensive.",
  "subtitles": true,
  "subtitle_style": "hormozi"
}
```

**curl example:**

```bash
curl -X POST https://api.agent-media.ai/v1/generate/product_acting_ugc \
  -H "Authorization: Bearer ma_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "product_image_url": "https://cdn.example.com/perfume.png",
    "actor_slug": "sarah",
    "product_name": "Rose Noir",
    "product_description": "Premium rose perfume with a warm vanilla dry-down.",
    "template": "product-in-hand",
    "acting_style": "honest-review",
    "duration": 5,
    "subtitle_style": "hormozi"
  }'
```

Poll `GET /api/v1/videos/:job_id` until status is `completed`, then fetch `video_url`.

**Credit cost:** `30 × duration + 50` credits, plus `5` credits when the API generates the script.

---

### GET /api/v1/actors

List available AI actors with optional filtering, or look up a single actor by slug.

**Public endpoint — no API key required.** Rate limit: 60 requests/minute per IP.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `gender` | string | Filter by gender. Values: `female`, `male` |
| `age_range` | string | Filter by age range. Values: `18-25`, `26-35`, `36-50`, `51+` |
| `actor_type` | string | Filter by persona type. Values: `Young Adult`, `Professional`, `Mom`, `Elder`, `Casual` |
| `preset` | string | Filter by preset tag (e.g. `show_your_app`) |
| `search` | string | Case-insensitive substring on `name` |
| `slug` | string | Exact slug lookup. Returns a single actor or 404 with similar-slug suggestions. Other filters are ignored when set. |
| `limit` | integer | Page size (1–500, default 500 — returns the full active library in one call). Ignored when `slug` is set. |
| `offset` | integer | Page offset (default 0). Ignored when `slug` is set. |

**Response (200) — list:**

```json
{
  "actors": [
    {
      "id": "66ac63f6-1be0-4c70-9914-c8ed90208be0",
      "slug": "aaliyah",
      "name": "Aaliyah",
      "gender": "female",
      "age": 28,
      "age_range": "26-35",
      "nationality": "African American",
      "actor_type": "Professional",
      "style": "Confident, poised, thoughtful presence",
      "portrait_url": "https://example.com/portraits/aaliyah.png",
      "green_screen_url": "https://example.com/green-screen/aaliyah.png",
      "voice_id": "cgSgspJ2msm6clMCkdW9",
      "voice_gender": "female",
      "lip_sync_engine": "aurora",
      "preset": null,
      "presets": ["show_your_app"],
      "bio_occupation": "Financial Wellness Educator",
      "bio_story": "Aaliyah works as a financial wellness educator …",
      "bio_hobbies": ["home espresso", "early morning runs"],
      "status": "active",
      "created_at": "2026-02-27T19:12:35.927Z",
      "updated_at": "2026-02-27T19:12:35.927Z"
    }
  ],
  "total": 200,
  "limit": 50,
  "offset": 0
}
```

**Response (200) — single actor (`?slug=…`):**

```json
{
  "actor": {
    "id": "66ac63f6-1be0-4c70-9914-c8ed90208be0",
    "slug": "aaliyah",
    "name": "Aaliyah",
    "...": "all fields as above"
  }
}
```

**Error (404) — slug lookup miss:**

```json
{
  "error": {
    "code": "ACTOR_NOT_FOUND",
    "message": "Actor 'aaliya' not found. Did you mean: aaliyah?",
    "similar": ["aaliyah"]
  }
}
```

**curl examples:**

```bash
# List all actors (default page size 50)
curl "https://api.agent-media.ai/v1/actors"

# Filter by gender, paginated
curl "https://api.agent-media.ai/v1/actors?gender=female&limit=20&offset=0"

# Search by name
curl "https://api.agent-media.ai/v1/actors?search=aali"

# Look up a specific actor by slug
curl "https://api.agent-media.ai/v1/actors?slug=aaliyah"
```

---

### GET /api/v1/account

Get account information including plan details, credit balances, and feature limits.

**Response (200):**

```json
{
  "user_id": "user-uuid",
  "plan": {
    "tier": "starter",
    "name": "Creator",
    "status": "active",
    "trial_active": false,
    "trial_ends_at": null,
    "current_period_end": "2026-04-20T00:00:00.000Z"
  },
  "credits": {
    "monthly_remaining": 2400,
    "monthly_allowance": 3900,
    "purchased": 0,
    "total": 2400
  },
  "limits": {
    "max_concurrent_jobs": 3,
    "max_video_duration": 10,
    "models_available": ["ugc-basic"]
  }
}
```

**Plan tiers and limits:**

| Tier | Name | Monthly Credits | Max Concurrent Jobs | Max Duration |
|------|------|----------------|--------------------:|-------------:|
| `free` | Free | 0 | 1 | 5s |
| `payg` | Pay As You Go | 0 | 2 | 15s |
| `starter` | Creator | 3,900 | 3 | 10s |
| `creator` | Pro | 6,900 | 5 | 15s |
| `pro_plus` | Pro Plus | 12,900 | 10 | 15s |

**curl example:**

```bash
curl https://api.agent-media.ai/v1/account \
  -H "Authorization: Bearer ma_your_api_key"
```

---

### GET /api/v1/account/usage

Get usage statistics for your account over a specified time period.

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `period` | string | No | `"30d"` | Time period. Values: `7d`, `30d`, `90d` |

**Response (200):**

```json
{
  "period": "30d",
  "period_start": "2026-02-21T00:00:00.000Z",
  "period_end": "2026-03-23T00:00:00.000Z",
  "summary": {
    "total_jobs": 45,
    "completed_jobs": 40,
    "failed_jobs": 3,
    "credits_used": 12000
  },
  "by_model": [
    {
      "model_slug": "ugc-basic",
      "job_count": 45,
      "credits_used": 12000,
      "avg_duration_seconds": 85.2
    }
  ],
  "daily": [
    {
      "date": "2026-03-22",
      "job_count": 3,
      "credits_used": 900
    }
  ],
  "by_operation": [
    {
      "operation": "ugc_video",
      "job_count": 45
    }
  ]
}
```

**curl example:**

```bash
# Last 30 days (default)
curl "https://api.agent-media.ai/v1/account/usage" \
  -H "Authorization: Bearer ma_your_api_key"

# Last 7 days
curl "https://api.agent-media.ai/v1/account/usage?period=7d" \
  -H "Authorization: Bearer ma_your_api_key"
```

---

### POST /api/v1/account/keys

Create a new API key. The raw key is returned only once -- store it securely.

**Request Body (JSON):**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `name` | string | No | `"Default"` | A name for the key (max 100 characters) |

**Response (201):**

```json
{
  "key": "ma_a1b2c3d4e5f6789012345678901234ab",
  "id": "key-uuid",
  "key_prefix": "ma_a1b2c3d4",
  "name": "My Production Key",
  "created_at": "2026-03-23T10:00:00.000Z"
}
```

The `key` field contains the full API key. This is the **only time** the full key is returned. Store it securely. Subsequent requests to list keys only return the `key_prefix`.

Maximum 25 active keys per account.

**curl example:**

```bash
curl -X POST https://api.agent-media.ai/v1/account/keys \
  -H "Authorization: Bearer ma_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{"name": "Production Key"}'
```

---

### GET /api/v1/account/keys

List all active API keys for your account. Returns metadata only -- the full key is never returned after creation.

**Response (200):**

```json
{
  "keys": [
    {
      "id": "key-uuid",
      "key_prefix": "ma_a1b2c3d4",
      "name": "Production Key",
      "created_at": "2026-03-23T10:00:00.000Z",
      "last_used_at": "2026-03-23T14:30:00.000Z"
    }
  ]
}
```

**curl example:**

```bash
curl https://api.agent-media.ai/v1/account/keys \
  -H "Authorization: Bearer ma_your_api_key"
```

---

### DELETE /api/v1/account/keys/:keyId

Revoke (soft-delete) an API key. The key can no longer be used for authentication after revocation.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `keyId` | string | The key ID (UUID) returned from key creation or listing |

**Response (200):**

```json
{
  "revoked": true,
  "id": "key-uuid"
}
```

**curl example:**

```bash
curl -X DELETE https://api.agent-media.ai/v1/account/keys/key-uuid-here \
  -H "Authorization: Bearer ma_your_api_key"
```

---

## Subtitle Styles

The `style` parameter on video creation accepts these values:

| Style | Description |
|-------|-------------|
| `hormozi` | Yellow karaoke-style highlight (default) |
| `minimal` | Clean white text, minimal animation |
| `bold` | Neon cyan bold text |
| `karaoke` | Green pop karaoke highlighting |
| `clean` | White text on dark background |
| `tiktok` | TikTok-native subtitle style |
| `neon` | Neon glow effect |
| `fire` | Fire/flame animated text |
| `glow` | Soft glow effect |
| `pop` | Pop-in animation |
| `aesthetic` | Aesthetic/pastel style |
| `impact` | Impact font, bold white |
| `pastel` | Pastel color palette |
| `electric` | Electric/lightning effect |
| `boxed` | Text in colored boxes |
| `gradient` | Gradient-colored text |
| `spotlight` | Spotlight highlight effect |

---

## Credit Costs

Videos are billed per second at **30 credits/second**, rounded up to the nearest duration bucket.

| Duration | Credits | USD Equivalent |
|----------|--------:|---------------:|
| 5s | 150 | ~$1.50 |
| 10s | 300 | ~$3.00 |
| 15s | 450 | ~$4.50 |

AI script generation (using `prompt` instead of `script`) adds a surcharge of **5 credits**.

Credits are deducted immediately when a job is created. If the job fails at the worker dispatch stage, credits are automatically refunded. You can also cancel in-progress jobs for a full refund.

---

## Job Statuses

| Status | Terminal | Description |
|--------|----------|-------------|
| `submitted` | No | Job accepted and sent to worker |
| `queued` | No | Waiting for processing capacity |
| `processing` | No | Video is being generated |
| `completed` | Yes | Video ready at `output_url` |
| `failed` | Yes | Generation failed (see `error_message`) |
| `canceled` | Yes | Canceled by user, credits refunded |

---

## Webhooks

When a video generation job completes (or fails), agent-media sends an HTTP POST to the `webhook_url` you supplied in the create request. This removes the need to poll.

### Requesting a webhook

Include `webhook_url` in the POST body when creating the job:

```bash
curl -X POST https://api.agent-media.ai/v1/videos \
  -H "Authorization: Bearer ma_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "script": "Ever wonder why top founders wake up at 5am?...",
    "actor_slug": "emma",
    "target_duration": 10,
    "webhook_url": "https://example.com/webhooks/agent-media?secret=MY_TOKEN"
  }'
```

**Requirements:**
- Must use `https://` (plain HTTP is rejected)
- Must be publicly reachable
- Max URL length: 2048 characters

### Payload format

On **success**:

```json
{
  "job_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "completed",
  "video_url": "https://media.agent-media.ai/videos/a1b2c3d4.mp4"
}
```

On **failure**:

```json
{
  "job_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "failed",
  "error_message": "Script exceeded maximum duration for selected actor."
}
```

The webhook body is `Content-Type: application/json`. The completed video is also accessible via `GET /api/v1/videos/:id` on the `output_url` field.

### Retry policy

If your endpoint returns a non-2xx status code (or times out), agent-media retries up to **3 times** with exponential backoff: 1 s, 4 s, 16 s. After all retries are exhausted the webhook is abandoned — you can still poll `GET /api/v1/videos/:id` for the result.

### Verifying authenticity

The simplest approach is to include a shared secret as a query parameter in your webhook URL (e.g. `?secret=MY_TOKEN`) and check it on every request. agent-media preserves the query string as-supplied, so any HMAC signing parameters you append will come back unchanged.

### Example receiver

```bash
# What your endpoint will receive
POST https://example.com/webhooks/agent-media?secret=MY_TOKEN
Content-Type: application/json

{
  "job_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "completed",
  "video_url": "https://media.agent-media.ai/videos/a1b2c3d4.mp4"
}
```

> **Tip:** use [webhook.site](https://webhook.site) to inspect webhook payloads while developing.

---

## Important Notes

- **Max video duration is 15 seconds.** The `target_duration` must be 5, 10, or 15.
- **Videos are generated asynchronously.** Use polling (GET /api/v1/videos/:id) or `webhook_url` to get notified on completion.
- **Credits are deducted immediately** on job creation and refunded on failure or cancellation.
- **Custom personas are not supported** via the REST API. Use `actor_slug` to select from 200+ pre-built actors.
- **The `voice`, `tts_provider`, `persona_slug`, and `face_photo_url` parameters are not exposed** through the REST API. Voice is automatically selected based on the chosen actor.
- **Starter/Creator plans are limited to 10s max duration.** Pro and Pro Plus support 15s.
- **API keys use the `ma_` prefix** and are hashed with SHA-256 before storage. The full key is only shown once at creation.
