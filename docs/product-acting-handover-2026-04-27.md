# Product Acting UGC Full Engineering Handover - 2026-04-27

Owner context: this document is a full handoff for the Product Acting UGC work, the public website fixes, the API/worker integration, and the release risks discovered during the incident on 2026-04-27.
Scope: web dashboard, public landing site, API v2, media-worker-v2, CLI, SDKs, MCP server, skills, docs, deployment, production verification, and known gaps.
Audience: next engineer, release owner, support engineer, or agent taking over the current workspace without conversation context.
Important: do not copy secrets from chat, logs, local env files, or production dashboards into tickets or docs. Some secrets were pasted during the incident and must be rotated.

## 1. Executive Summary

- Product Acting UGC is an end-to-end pipeline that turns a product image, actor, scenario, acting style, optional product context, and optional exact script into a vertical creator-style UGC video.
- The current production-facing API generator id is `product_acting_ugc`.
- The canonical public API base URL is `https://api.agent-media.ai`.
- The public website domain is `https://agent-media.ai`.
- The dashboard create page is `apps/web/app/(dashboard)/create/product-acting/page.tsx`.
- The dashboard submit proxy is `apps/web/app/api/v1/product-acting/route.ts`.
- The API v2 dispatch logic is `services/api-v2/src/routes/generate.ts`.
- The worker endpoint is `POST /product-acting` in `services/media-worker-v2/src/server.js`.
- The core worker pipeline is `services/media-worker-v2/src/product-acting-pipeline.js`.
- The CLI command is `apps/cli/src/commands/product-acting.ts`.
- The TypeScript SDK methods are in `packages/sdk-ts/src/index.ts`.
- The MCP tool is `product_acting_ugc` in `packages/mcp-server/src/index.ts`.
- The shared schema registry includes Product Acting in `packages/schema/src/generators.ts` and `packages/schema/src/video.ts`.
- The public homepage was fixed to show poster frames immediately and lazy-load full-quality MP4s only when visible.
- The bad low-resolution local preview files were deleted from the latest commit.
- The media proxy now avoids caching partial range responses incorrectly.
- The grouped landing header and mobile menu were restored from a previous good worktree.
- Actor public pages were restored and `/ai-actors` was added to the sitemap.
- The latest verified commit in this worktree is `a453b779 Lazy load full quality homepage videos`.
- The previous hotfix commits are `7296a14b Fix homepage video loading`, `a80049cb Use lightweight homepage video previews`, and `3c1b3851 Restore grouped header and actor navigation`.
- Production Vercel deployment `agent-media-dze4v1cez-yuval-suedes-projects.vercel.app` was Ready and aliased to `agent-media.ai` during verification.
- Local checks passed: `pnpm --filter @agent-media/web typecheck` and `pnpm --filter @agent-media/web build`.
- Existing lint warnings are unrelated and pre-existing in dashboard/landing files.
- Critical open risk: rotate any secrets pasted in chat before considering production secure.
- Critical open risk: public GitRoom repo synchronization may still be incomplete; do not assume `gitroomhq/agent-media` has the same state as the production repo.
- Critical open risk: CDN/media derivative strategy is still not ideal; current fix is lazy loading plus posters, not true adaptive streaming.
- Critical open risk: older markdown docs still contain at least two old `https://agent.media` curl examples and need cleanup if those files are source-of-truth for publishing.

## 2. Current Production Status

- Website: `https://agent-media.ai` resolves to Vercel production.
- API: `https://api.agent-media.ai` is the intended public API domain.
- Worker: media-worker-v2 runs on Railway and is configured behind API v2 via `WORKER_V2_URL`.
- Storage: generation output media is stored in Cloudflare R2 and accessed on public site through the same-origin media proxy `/api/media/...`.
- Auth: dashboard requests use Supabase session JWT; API/CLI/SDK/MCP requests use Bearer API keys or Supabase JWTs accepted by API v2.
- Credits: Product Acting costs `duration * 30 + 50`, plus `5` if API generates the script.
- Durations: 5, 10, and 15 seconds.
- Script pacing: max 3 words per second.
- Subtitles: Product Acting defaults to Hormozi-style synced burned-in subtitles unless disabled.
- Homepage videos: original production MP4 URLs are restored; `LazyVideo` assigns `src` only when visible.
- Homepage poster assets: local JPGs under `apps/web/public/showcase-posters`.
- Media proxy cache: 206 partial responses are `no-store` and include `Vary: range`; 200 complete responses are immutable.
- Header: grouped desktop nav and mobile hamburger menu are restored.
- Actors nav: `/ai-actors` exists and actor detail route exists.
- Sitemap: `/ai-actors` is listed.
- Build status: production build succeeds.
- Deployment method used: Git push to `origin/main`, letting Vercel build from Git. Local `vercel deploy --prod` is not preferred because it attempted huge workspace uploads.

## 3. Latest Verification Snapshot

- Verified `https://agent-media.ai` HTML contains grouped nav strings: `Actors`, `Developers`, `Resources`.
- Verified `https://agent-media.ai` HTML contains `showcase-posters/*.jpg`.
- Verified local poster `https://agent-media.ai/showcase-posters/austin-watch.jpg` returns HTTP 200 image/jpeg.
- Verified product acting MP4 range request returns HTTP 206 video/mp4 with `content-range`.
- Verified media proxy sets `cache-control: no-store` for range responses.
- Verified media proxy sets `vary: range`.
- Verified browser screenshot after production deploy showed visible carousel videos/posters instead of all-black boxes.
- Verified `git status --short --branch` was clean after latest commit.
- Verified Vercel inspect reported deployment status `Ready`.

## 4. Repository and Remotes

- Workspace path used for this handoff: `/Users/suede/.codex/worktrees/b777/videoagent`.
- Production-linked remote during work: `https://github.com/yuvalsuede/agent-media.git`.
- Branch pushed during work: `main`.
- Public GitHub URL shown in product/docs/header: `https://github.com/gitroomhq/agent-media`.
- Do not assume the public GitRoom repository has been updated unless a separate sync/push is explicitly verified.
- The worktree is detached HEAD in the local Codex worktree, but commits were pushed to `origin/main` using `git push origin HEAD:main`.
- Because the worktree is detached, future agents should check `git status --short --branch` before committing.
- Avoid `git reset --hard` or checkout-based rollback unless the user explicitly requests it.

## 5. High-Level Architecture

```mermaid
flowchart LR
  User[Dashboard user] --> Web[Next.js web app]
  Web --> Upload[upload-url Edge Function]
  Upload --> Storage[Supabase Storage input media]
  Web --> Signer[generation-input-url route]
  Web --> Proxy[/api/v1/product-acting]
  Proxy --> API[API v2 /v1/generate/product_acting_ugc]
  CLI[CLI / SDK / MCP] --> API
  API --> DB[(Supabase DB)]
  API --> Credits[deduct_credits / refund_credits RPCs]
  API --> Worker[media-worker-v2 /product-acting]
  Worker --> Provider[EvoLink image/video APIs]
  Worker --> Whisper[Whisper transcription]
  Worker --> FFmpeg[FFmpeg normalize/trim/subtitle]
  Worker --> R2[(Cloudflare R2 outputs)]
  Worker --> Callback[Supabase webhook-provider callback]
  Callback --> DB
  Web --> MediaProxy[/api/media/... proxy]
  MediaProxy --> R2
```

## 6. End-to-End Product Acting Request Flow

1. Dashboard user opens `/create/product-acting`.
2. Client fetches actors from `/api/actors?limit=200`.
3. Client filters actors to entries with non-empty `portrait_url`.
4. User selects scenario template.
5. User uploads a product image.
6. Client validates file type: PNG, JPEG, JPG, or WebP.
7. Client validates max product image size: 50 MB.
8. Client calls `invokeFn("upload-url")` to receive upload URL and storage path.
9. Client PUTs the image to the returned upload URL.
10. Client calls `/api/v1/generation-input-url` with storage path to get signed input URL.
11. Client stores signed URL in `productImageUrl`.
12. User selects actor and optionally actor variant.
13. Client fetches actor variants from `/api/actors/{id}/variants`.
14. User selects acting style, duration, subtitles, and visual style.
15. Client requires either `script` or `productDescription` before final submission.
16. Client submits to same-origin `POST /api/v1/product-acting`.
17. Next.js route verifies Supabase session and forwards JWT to API v2.
18. API v2 validates generator id and request schema.
19. API v2 preflights worker health and Product Acting endpoint.
20. API v2 generates a short script if script is missing.
21. API v2 enforces max words as `duration * 3`.
22. API v2 looks up actor by `actor_slug`, active status, and portrait URL.
23. API v2 optionally validates actor variant ownership and active status.
24. API v2 inserts `generation_jobs` row with status `pending`.
25. API v2 deducts credits with `deduct_credits`.
26. API v2 dispatches worker with `X-Worker-Secret`.
27. API v2 marks job `submitted`.
28. Worker queues per user if another job is already running.
29. Worker generates opening frame using actor and product images.
30. Worker validates generated frame is usable portrait 9:16.
31. Worker retries strict portrait prompt when needed.
32. Worker normalizes frame to 1080x1920 with FFmpeg.
33. Worker uploads normalized frame to R2.
34. Worker animates frame through video provider with generated audio.
35. Worker downloads generated MP4.
36. Worker trims first 0.3s.
37. Worker optionally extracts audio, runs Whisper, generates ASS subtitles, and burns them with FFmpeg.
38. Worker uploads final video to R2 as `product-acting-final.mp4`.
39. Worker calls Supabase webhook callback with completed status and output URL.
40. Dashboard/gallery reads updated job row and plays output media.

## 7. Web App Details

### 7.1 Dashboard Product Acting Page

- File: `apps/web/app/(dashboard)/create/product-acting/page.tsx`.
- Client component.
- Uses `useRouter` from Next navigation.
- Uses local state for each wizard step.
- Steps are `Scenario`, `Product`, `Actor`, `Style`, `Script`.
- Product template options include `product-in-hand`, `mirror-selfie`, `bathroom-reaction`, `kitchen-counter`, `car-selfie`, `couch-review`, `expert-interview`, and `product-closeup`.
- Acting style options include `raw-selfie`, `shocked`, `angry`, `excited`, `dramatic`, `weird-hook`, `casual-demo`, and `honest-review`.
- Duration options are 5, 10, 15 seconds.
- Credit estimate uses 30 credits/second, 50 Product Acting frame credits, and 5 script-generation credits if no script.
- Actor picker is a modal with search and variant selection.
- Actor search includes actor name, slug, gender, age, and nationality.
- Selected actor image prefers selected variant URL, falling back to actor portrait URL.
- Final payload includes product image URL, actor slug, template, acting style, duration, subtitles, subtitle style, optional variant id, product name, product description, script, and visual style.
- Successful submit redirects to `/gallery/{job_id}`.
- Submit errors are shown on final step.
- Upload errors are shown on product step.
- Known UX issue to monitor: user complained earlier about oversized UI and responsiveness. Some improvements were made, but no dedicated visual regression tests exist.
- Known UX issue to monitor: actor filtering was requested for male/female and less duplicated text; implementation state should be manually rechecked.

### 7.2 Dashboard Product Acting Proxy

- File: `apps/web/app/api/v1/product-acting/route.ts`.
- Accepts JSON POST from dashboard.
- Rejects invalid JSON with 400 `invalid_json`.
- Requires Supabase session access token.
- Rejects unauthenticated requests with 401 `unauthenticated`.
- Resolves API v2 URL from `API_V2_URL` env if configured.
- For localhost hostnames, defaults API v2 to `http://localhost:3001`.
- For production, defaults API v2 to `https://api.agent-media.ai`.
- Forwards raw JSON body to `/v1/generate/product_acting_ugc`.
- Preserves upstream response status.
- Wraps non-JSON upstream response in `upstream_error`.
- Returns 502 `upstream_unreachable` if fetch fails.

### 7.3 Media Proxy

- File: `apps/web/app/api/media/[...path]/route.ts`.
- Purpose: hide direct R2 public domain from app/docs/public HTML and centralize cache behavior.
- Runtime: edge.
- Requires `R2_PUBLIC_URL`.
- Allowed prefixes are `generation-outputs/`, `app-screenshots/`, `actors/`, `actor-variants/`.
- Rejects missing/unallowed media path with 404.
- Forwards Range header to upstream.
- Uses `cache: no-store` for upstream fetch to avoid poisoned partial response cache.
- Copies `accept-ranges`, `content-length`, `content-range`, `content-type`, `etag`, and `last-modified`.
- Sets `Vary: range`.
- Sets `Cache-Control: no-store` for 206 responses.
- Sets immutable one-year cache only for complete 200 responses.
- Known issue: media proxy is a same-origin bridge, not a full video CDN with adaptive variants.

### 7.4 Homepage Video Carousel

- File: `apps/web/components/video-carousel.tsx`.
- Exports `LazyVideo` and `VideoCarousel`.
- `LazyVideo` renders `<video>` without a `src` until IntersectionObserver marks it visible.
- `LazyVideo` shows `poster` immediately.
- `LazyVideo` uses `preload="none"`.
- `LazyVideo` appends `?v=3#t=0.4` when assigning video src.
- The query string busts stale browser/CDN cache variants.
- The time fragment nudges browser off black first frames.
- The poster is the real immediate visual fallback.
- `VideoCarousel` doubles item list for marquee loop.
- Default root margin is 240px; compact root margin is 120px.
- Current production uses original full-quality MP4 URLs plus local poster JPGs.
- Rejected approach: low-resolution local MP4 previews were created but removed because quality was unacceptable.
- Open performance improvement: generate acceptable 360p/540p derivatives via CDN, not ultra-compressed local previews.

### 7.5 Landing Header

- File: `apps/web/components/landing-header.tsx`.
- Desktop nav is grouped.
- Primary product links: Actors, Use Cases, Pricing.
- Developers dropdown: Developers, Integrations, API Docs, GitHub.
- Resources dropdown: Showcase, Blog.
- GitHub link points to `https://github.com/gitroomhq/agent-media`.
- Mobile menu exists and groups Product, Developers, Resources.
- CTA opens login modal through `useLogin`.
- Header is sticky, rounded, translucent white, and max width 1200px.
- The user explicitly rejected the flat ungrouped header; do not revert to flat list.

## 8. API v2 Details

### 8.1 Server Entrypoint

- File: `services/api-v2/src/server.ts`.
- Express server.
- Port default: 3001.
- Requires `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
- Uses shared schema registry from `@agentmedia/schema`.
- Rate limit for generate endpoints: 10 requests/minute per authenticated user or IP fallback.
- Rate limit for read endpoints: 60 requests/minute.
- Auth middleware accepts Bearer tokens and calls `verifyToken`.
- Health endpoint returns service `api-v2` and generator ids.
- OpenAPI endpoint is `/openapi.json`.
- Scalar API docs are mounted at `/docs`.
- Main generate route is `POST /v1/generate/:generatorId`.
- Actor list route is `GET /v1/actors`.
- Job status route is `GET /v1/videos/:jobId`.
- Compatibility routes proxy `/functions/v1/*` for legacy CLI behavior.

### 8.2 Product Acting Generate Branch

- File: `services/api-v2/src/routes/generate.ts`.
- Branch condition: `generatorId === "product_acting_ugc"`.
- Default duration: 5.
- Subtitle flag: enabled unless `subtitles === false` or `subtitle_style === "none"`.
- Default subtitle style: `hormozi`.
- Requires `WORKER_V2_URL` and `WORKER_SECRET`.
- Runs `checkProductActingWorkerEndpoint()` before charging credits.
- Worker health preflight: `GET {WORKER_V2_URL}/health`.
- Endpoint preflight: unauthenticated/empty `POST /product-acting` expecting status 400 for deployed endpoint.
- 404 endpoint preflight returns user-safe message: endpoint not deployed, no credits charged.
- 401/403 endpoint preflight returns worker auth misconfigured, no credits charged.
- Missing script triggers `generateProductActingScript`.
- Script generation uses OpenAI and can fail before credits are charged.
- Max words are `duration * 3`.
- Actor lookup selects `id, slug, name, portrait_url` from active `actors`.
- Actor must have portrait URL.
- Variant lookup validates `actor_variant_id`, actor ownership, active status, and image URL.
- Credit cost is `duration * CREDITS_PER_SECOND + 50 + optional script surcharge`.
- Job id is generated with `crypto.randomUUID()`.
- Job inserted into `generation_jobs` with status `pending`.
- Job operation is `product_acting_ugc`.
- Job provider slug is `railway`.
- Job provider job id equals job id.
- Job prompt stores first 500 characters of script.
- Job input params include actor slug, variant, product image URL, product name, product description, template, acting style, visual style, duration, subtitles, subtitle style, and generated script.
- Credits deducted with `deduct_credits` RPC after job insert.
- If credit deduction fails, pending job is deleted.
- If insufficient credits, response status is 402.
- Worker dispatch timeout is 15 seconds.
- Worker dispatch endpoint is `{WORKER_V2_URL}/product-acting`.
- Worker dispatch includes `X-Worker-Secret`.
- Worker receives callback URL from `buildCallbackUrl(jobId)`.
- If worker dispatch fails, API calls `failJobAndRefund`.
- Successful dispatch marks job `submitted` with `webhook_checkpoint: submitted`.
- 201 response includes job id, submitted status, credits, actor slug, variant id, generated script, subtitle flags, and subtitle style.

### 8.3 API Error Semantics

- 400 `SCRIPT_TOO_LONG`: script word count exceeds max for duration.
- 401 `UNAUTHORIZED`: missing/invalid bearer token at server middleware.
- 402 `INSUFFICIENT_CREDITS`: credit RPC detects insufficient balance.
- 404 `ACTOR_NOT_FOUND`: actor slug missing, inactive, or no portrait.
- 404 `ACTOR_VARIANT_NOT_FOUND`: variant missing/inactive/not owned by actor.
- 500 `SCRIPT_GENERATION_FAILED`: OpenAI/script generator failed.
- 500 `DATABASE_ERROR`: actor/variant/job insert database failure.
- 500 `DISPATCH_ERROR`: worker dispatch failed after credits were refunded.
- 503 `SERVICE_UNAVAILABLE`: worker URL/secret missing, health failure, endpoint missing, or worker auth misconfigured.
- Important support language: if preflight fails before charging, say no credits charged. If dispatch fails after deduction, say credits refunded.

## 9. Worker v2 Details

### 9.1 Server

- File: `services/media-worker-v2/src/server.js`.
- Express server.
- Port default: `PORT || 3000`.
- Requires `WORKER_SECRET` for all job endpoints.
- Uses Supabase service role for recovery/callback-related work.
- Health endpoint: `GET /health`.
- Queue endpoint: `GET /queue`, authenticated by worker secret.
- Job endpoints: `/subtitle`, `/ugc`, `/show-your-app`, `/product-acting`.
- Uses in-memory per-user FIFO queue.
- Each user can have one running job; later jobs wait in that user queue.
- On startup, abandoned jobs older than 15 minutes in `submitted` or `pending` with provider `railway` are marked failed and refunded.
- Queue is memory-only; worker restart drops queue state, but recovery attempts to clean old submitted/pending DB jobs.
- Worker acknowledges requests with HTTP 202 before processing async.
- Worker sends callback with completed/failed status.

### 9.2 Product Acting Endpoint

- Endpoint: `POST /product-acting`.
- Auth: `X-Worker-Secret` header must match `WORKER_SECRET`.
- Required fields: `job_id`, `user_id`, `actor_image_url`, `product_image_url`, `script`.
- Optional fields: `template`, `acting_style`, `visual_style`, `product_name`, `product_description`, `duration`, `subtitles`, `subtitle_style`, `callback_url`, `webhook_url`.
- Defaults: template `product-in-hand`, acting style `raw-selfie`, duration 5, subtitles true, subtitle style `hormozi`.
- Queue key: `user_id` or anonymous fallback.
- If running job exists for user, request is accepted and queued with position.
- If no running job exists, processing starts immediately.
- Processing function: `processProductActing`.

### 9.3 Product Acting Pipeline

- File: `services/media-worker-v2/src/product-acting-pipeline.js`.
- Provider API key required: `EVOLINK_API_KEY`.
- Image model env priority: `PRODUCT_ACTING_IMAGE_MODEL`, then `GPT_IMAGE_MODEL`, then default `gpt-image-2`.
- Video model env priority: `PRODUCT_ACTING_VIDEO_MODEL`, then default `seedance-2.0-image-to-video`.
- Image size default: `9:16`.
- Image resolution default: `2K`.
- Image quality default: `medium`.
- Image timeout default: 600 seconds.
- Video timeout default: 600 seconds.
- Templates are prompt fragments, not separate pipeline code paths.
- Acting styles are prompt fragments, not separate pipeline code paths.
- Safety filter patterns trigger conservative retry.
- Prompt sanitizer replaces risky content such as explicit, medical, body-transformation, and suggestive terms.
- Frame prompt requires photorealistic vertical 9:16 UGC phone-video opening frame.
- Frame prompt uses image 1 as actor reference.
- Frame prompt uses image 2 as product reference.
- Frame prompt requires fully clothed modest casual clothing.
- Full-body visual style is detected and changes framing instruction.
- Image generation endpoint: `https://api.evolink.ai/v1/images/generations`.
- Image task polling endpoint: `https://api.evolink.ai/v1/tasks/{taskId}`.
- Opening frame is downloaded to temp work directory.
- Generated frame dimensions are read with `ffprobe`.
- Portrait 9:16 tolerance allows width/height ratio within 0.06 of 9/16.
- If frame is not usable portrait, worker retries with strict portrait visual style.
- If still not portrait, job fails.
- Frame normalization uses FFmpeg scale/pad to 1080x1920, SAR 1, JPEG quality 2.
- Normalized frame is uploaded to R2 as `{user_id}/{job_id}/product-acting-frame.jpg`.
- Video prompt animates still image as raw vertical UGC phone video.
- Video prompt includes script as actor speech.
- Video generation endpoint: `https://api.evolink.ai/v1/videos/generations`.
- Video generation includes `generate_audio: true`.
- Video generation uses duration and 9:16 aspect ratio.
- Raw video is downloaded after provider completion.
- Worker trims first 0.3 seconds to remove startup artifacts.
- Trim uses FFmpeg re-encode with libx264, CRF 18, AAC 128k.
- Subtitle step extracts 16k mono MP3 audio.
- Whisper transcription returns word-level timing.
- ASS subtitle file generated through shared `generateASS`.
- Subtitles are burned with FFmpeg `ass=` filter.
- Subtitle burn failure is non-fatal; job continues without subtitles.
- Final video uploaded to R2 as `{user_id}/{job_id}/product-acting-final.mp4`.
- Temporary work directory is removed in `finally`.

### 9.4 Known Worker Risks

- In-memory queue is not durable across worker restarts.
- Startup recovery marks abandoned jobs older than 15 minutes failed/refunded, which may conflict with legitimately slow jobs if callback is delayed.
- Provider timeout defaults are 10 minutes for image and video, but user-observed failures previously happened around 3 minutes before timeout increase/deploy verification.
- Subtitle synchronization depends on generated audio and Whisper word timings; if provider speech timing diverges or Whisper misses words, subtitles may drift.
- Subtitle failure currently skips subtitles rather than failing the entire job.
- Product frame safety filter can block certain categories; safe-mode retry helps but is not guaranteed.
- Generated frame may fail portrait validation; strict retry helps but can still fail.
- Direct R2 public URL fallback exists in worker R2 helper; public site should still proxy through `/api/media`.

## 10. Shared Schema and Contracts

- Generator registry file: `packages/schema/src/generators.ts`.
- Product Acting registry key: `product_acting_ugc`.
- Product Acting output type: `video_url`.
- Video schema file: `packages/schema/src/video.ts`.
- Global duration enum: `[5, 10, 15]`.
- Credits per second: 30.
- Script generation surcharge: 5.
- Show Your App and Product Acting both enforce 3 words per second.
- Product Acting schema should be the single source of truth; avoid hardcoding allowed values in new consumers.
- Current CLI still has local hardcoded Product Acting template/style sets; future refactor should import from schema package if practical.

### 10.1 Public Product Acting API Fields

- Field `product_image_url`: required. Public or signed URL to product image.
- Field `actor_slug`: required. Actor slug from actor library.
- Field `actor_variant_id`: optional. UUID for a selected actor variant.
- Field `product_name`: optional. Name used in prompt/script context.
- Field `product_description`: optional if script provided. Used for generated script and frame context.
- Field `script`: optional if product_description provided. Exact actor words.
- Field `template`: optional. Scenario template, default product-in-hand.
- Field `acting_style`: optional. Delivery/energy style, default raw-selfie.
- Field `visual_style`: optional. Extra camera/framing direction.
- Field `duration`: optional. 5, 10, or 15 seconds.
- Field `subtitles`: optional. Boolean; false disables subtitle burn.
- Field `subtitle_style`: optional. hormozi or none in Product Acting flow.
- Field `webhook_url`: optional. Client callback URL for completion if supported by worker/webhook path.

## 11. CLI Details

- File: `apps/cli/src/commands/product-acting.ts`.
- Command name: `agent-media product-acting`.
- Requires `--product-image`.
- Requires `--actor`.
- Requires either `--script` or `--about`.
- Optional `--actor-variant-id`.
- Optional `--product-name`.
- Optional `--template`; default `product-in-hand`.
- Optional `--acting-style`; default `raw-selfie`.
- Optional `--visual-style`.
- Optional `--duration`; default `5`.
- Optional `--subtitle-style`; default `hormozi`.
- Optional `--webhook-url`.
- Optional `--sync` waits for completion.
- Valid durations are 5, 10, 15.
- Valid subtitle styles are `hormozi` and `none`.
- Valid templates mirror the dashboard templates.
- Valid acting styles mirror dashboard styles.
- CLI validates script word count before submitting.
- CLI polls every 5 seconds in sync mode.
- Terminal statuses are completed, failed, canceled.
- Quiet mode prints job id or output URL.
- JSON mode prints structured payload.
- Human mode prints colored status and useful next command.
- CLI update command exists in `apps/cli/src/commands/update.ts`.
- Update command defaults self-update package manager to npm to avoid pnpm global bin failures.
- Update command skill refresh command is `npx --yes skills add gitroomhq/agent-media --agent claude-code --yes`.

## 12. SDK and MCP Details

### 12.1 TypeScript SDK

- File: `packages/sdk-ts/src/index.ts`.
- Default base URL is `https://api.agent-media.ai`.
- `submitProductActing(input)` posts to `/v1/generate/product_acting_ugc`.
- `createProductActing(input, options)` submits and polls until completion or timeout.
- Default SDK polling timeout is 10 minutes.
- SDK polls every 5 seconds.
- SDK throws `AgentMediaError` for failed status or timeout.
- SDK returns job id, video URL, credits deducted, duration, and actor slug on success.

### 12.2 MCP Server

- File: `packages/mcp-server/src/index.ts`.
- Default API URL is `https://api.agent-media.ai`.
- Requires `AGENT_MEDIA_API_KEY`.
- Exposes tool `product_acting_ugc`.
- Tool schema is generated from `ProductActingSchema` via `zod-to-json-schema`.
- Tool submits to `/v1/generate/product_acting_ugc`.
- MCP polls for up to 10 minutes.
- On completion, MCP returns job id, actor, subtitles, credits, and video URL.
- On failure, MCP returns `Product Acting UGC failed: ...`.
- On timeout, MCP returns job id and asks caller to check later.

## 13. Docs, Skills, and Public Content

- Main agent skill file: `SKILL.md`.
- Public API docs page: `apps/web/app/(landing)/docs/api-reference/page.tsx`.
- Markdown API reference: `docs/api-reference.md`.
- Generated OpenAPI: `generated/openapi.json`.
- Generated API types: `generated/api-types.d.ts`.
- CLI README: `apps/cli/README.md`.
- SDK README: `packages/sdk-ts/README.md`.
- MCP README: `packages/mcp-server/README.md`.
- Python SDK README: `packages/sdk-python/README.md`.
- Important open issue: `docs/api-reference.md` still has old `https://agent.media/api/v1/generate/show_your_app` and `https://agent.media/api/v1/generate/product_acting_ugc` examples. Fix before using that markdown as published source.
- Important open issue: public GitRoom repository state was not verified after the final production fixes.
- Skill install UX: `npx add-skill` is deprecated; users should use `npx skills add gitroomhq/agent-media`.
- Claude Code users may need to select Claude Code in the skills installer UI unless using a yes/agent flag supported by the tool.
- Skill content should instruct agents to use `agent-media update --force` when CLI/skill drift is suspected.

## 14. Website Incident Details

### 14.1 Header Regression

- Symptom: public website header showed flat ungrouped links and lost the previous organized menu.
- Expected desktop structure: Product links plus Developers dropdown plus Resources dropdown.
- Expected mobile structure: hamburger menu with grouped sections.
- Fix: restored `apps/web/components/landing-header.tsx` from previous good worktree and adapted links.
- Added actor public pages because restored header links to `/ai-actors`.
- Added `/ai-actors` to sitemap.
- Verification: homepage HTML contains `Actors`, `Developers`, and `Resources`.

### 14.2 Homepage Video Loading Regression

- Symptom: front page carousel showed black boxes while videos loaded.
- Root cause 1: MP4s were loaded directly and first frame could be black.
- Root cause 2: browsers requested many multi-megabyte videos at once.
- Root cause 3: partial range responses were potentially cached incorrectly without `Vary: range`.
- First attempted fix: local ultra-low-resolution preview MP4s.
- Why first attempted fix was rejected: video quality was unacceptable.
- Final fix: local poster JPGs plus lazy-loading original full-quality videos when visible.
- Final fix file: `apps/web/components/video-carousel.tsx`.
- Final fix route: `apps/web/app/api/media/[...path]/route.ts`.
- Final fix assets: `apps/web/public/showcase-posters/*.jpg`.
- Verification: screenshot showed visible content in carousel, not black cards.
- Remaining improvement: create proper CDN derivatives rather than depending on original MP4s for all clients.

## 15. Deployment Architecture and Commands

- Web app is deployed to Vercel.
- API v2 is deployed to Railway using `services/api-v2/Dockerfile`.
- media-worker-v2 is deployed to Railway using `services/media-worker-v2/Dockerfile`.
- API v2 Dockerfile installs pnpm, copies schema and service, installs filtered workspace deps, builds schema, builds api-v2, and runs `node dist/server.js`.
- Worker Dockerfile installs ffmpeg and fonts-liberation, installs production npm deps, copies worker src, and runs `node src/server.js`.
- Web production deploy should prefer Git push to `origin/main` and let Vercel build.
- Avoid local `vercel deploy --prod` from this worktree because it attempted to upload local `node_modules` and `.next` despite ignore attempts.
- If local Vercel deploy is required, run from a clean checkout or fix deployment ignore/config first.
- Check Vercel deployments with `vercel ls agent-media --scope yuval-suedes-projects`.
- Inspect a specific deployment with `vercel inspect --wait <deployment-url> --scope yuval-suedes-projects`.
- Verify alias section includes `https://agent-media.ai`.
- Railway worker deploy must include `WORKER_SECRET`, provider keys, R2 credentials, and timeout envs.
- Railway API v2 deploy must include Supabase keys, `WORKER_SECRET`, and `WORKER_V2_URL`.

## 16. Environment Variables

### 16.1 Web / Vercel

- R2_PUBLIC_URL: required for /api/media proxy.
- API_V2_URL: optional override; production defaults to https://api.agent-media.ai.
- Supabase URL and anon configuration: required for auth/session and dashboard data.
- Postiz OAuth/auth envs: required for login if deployed auth path depends on them.
- Stripe envs: required for billing pages and subscription flow.

### 16.2 API v2 / Railway

- PORT: Railway port, service defaults to 3001 locally.
- SUPABASE_URL: required.
- SUPABASE_ANON_KEY: required for proxying legacy edge functions.
- SUPABASE_SERVICE_ROLE_KEY: required for DB access and admin operations.
- WORKER_V2_URL: required for UGC/Product Acting/Show Your App dispatch.
- WORKER_SECRET: required to authenticate worker calls.
- OPENAI_API_KEY: required for script generation paths.

### 16.3 media-worker-v2 / Railway

- PORT: Railway port, service defaults to 3000.
- WORKER_SECRET: required for endpoint auth.
- SUPABASE_URL: used for abandoned job recovery and callbacks.
- SUPABASE_SERVICE_ROLE_KEY: used for abandoned job recovery and callbacks.
- EVOLINK_API_KEY: required by Product Acting image/video provider calls.
- R2_ACCOUNT_ID: required for R2 upload helper.
- R2_ACCESS_KEY_ID: required for R2 upload helper.
- R2_SECRET_ACCESS_KEY: required for R2 upload helper.
- R2_BUCKET: defaults to agent-media-outputs.
- R2_PUBLIC_URL: defaults to an R2 public URL in code but should be explicitly configured.
- PRODUCT_ACTING_IMAGE_MODEL: optional override.
- GPT_IMAGE_MODEL: fallback image model override.
- PRODUCT_ACTING_VIDEO_MODEL: optional override.
- PRODUCT_ACTING_IMAGE_SIZE: optional, default 9:16.
- PRODUCT_ACTING_IMAGE_RESOLUTION: optional, default 2K.
- PRODUCT_ACTING_IMAGE_QUALITY: optional, default medium.
- PRODUCT_ACTING_IMAGE_TIMEOUT_MS: optional, default 600000.
- PRODUCT_ACTING_VIDEO_TIMEOUT_MS: optional, default 600000.
- Whisper/OpenAI transcription envs: verify based on `services/media-worker-v2/src/whisper.js` implementation before deploy.

### 16.4 Secret Rotation Required

- OpenAI service key was pasted in chat. Rotate it.
- Supabase anon key was pasted in chat. Anon keys are public-ish but should still be reviewed.
- Supabase service role key was pasted in chat. Rotate it immediately.
- Worker secret was pasted in chat. Rotate it and update API v2 and worker together.
- Any Railway/Vercel env values copied from chat should be considered compromised.
- After rotation, test dashboard Product Acting, CLI Product Acting, Show Your App, UGC, actor list, and media proxy.

## 17. Database and Storage Model

- Primary table used by generation flows: `generation_jobs`.
- Actor lookup table: `actors`.
- Actor variant lookup table: `actor_variants`.
- Credit table/RPC surface: `user_credits`, `deduct_credits`, `refund_credits`, `get_credit_balance`.
- Product Acting job operation: `product_acting_ugc`.
- Product Acting job status lifecycle: pending -> submitted -> completed/failed/canceled.
- Job callback provider: `railway`.
- Webhook checkpoint values observed: `none`, `submitted`, `failed`, and completed path through callback.
- Input params are JSON and should be used for support/debugging but should not be shown raw on public processing page.
- User explicitly asked to remove excessive params/meta from processing page; keep gallery detail UI user-facing and concise.
- R2 key convention for Product Acting frame: `generation-outputs/{user_id}/{job_id}/product-acting-frame.jpg`.
- R2 key convention for Product Acting output: `generation-outputs/{user_id}/{job_id}/product-acting-final.mp4`.
- Public site should display R2 media through `/api/media/generation-outputs/...`, not direct R2 URLs.

## 18. Credit and Refund Behavior

- Product Acting estimated web cost: duration * 30 + 50 + optional 5 for generated script.
- API v2 cost calculation matches this formula.
- Credits are deducted after job row insert and before worker dispatch.
- If worker is unavailable during preflight, credits are not charged.
- If worker dispatch fails after deduction, API marks job failed and refunds credits.
- If job fails later inside worker, callback failure path should trigger failure handling/refund through existing webhook/provider logic; verify with Supabase Edge Function implementation before changing.
- Canceled jobs should refund credits through existing cancel flow.
- Support message should distinguish no-charge failures from refunded failures.
- Known user-facing failures observed: Product frame timed out, invalid API key, worker endpoint not deployed, video generation failed to start credits refunded.

## 19. Subtitle Synchronization

- Product Acting generates audio as part of provider video generation.
- Worker extracts audio from the generated/trimmed MP4.
- Worker transcribes extracted audio with Whisper.
- Worker generates word-level ASS subtitles from transcription.
- Subtitles are burned onto the video with FFmpeg.
- This is more accurate than estimating timing from script, but depends on Whisper word detection.
- If subtitles are out of sync, inspect whether trim offset, provider audio delay, or Whisper timing is responsible.
- Current trim removes first 0.3 seconds before subtitle extraction, so subtitle timing should align to trimmed video.
- If provider output has latent audio offset after trim, adjust subtitle timing offset in ASS generation/burn path, not frontend.
- If words are missing, consider using script-guided alignment instead of raw Whisper word list.
- If no words detected, worker currently skips subtitles and logs warning.

## 20. Public API and Domain Consistency

- Canonical public API base: `https://api.agent-media.ai`.
- Do not publish Railway API URLs in docs, CLI output, SDK examples, skills, or website.
- Do not publish direct R2 URLs in public website examples.
- Public GitHub URL should be `https://github.com/gitroomhq/agent-media`.
- Production source remote was `https://github.com/yuvalsuede/agent-media.git`; treat this as deploy source unless project settings changed.
- Open docs gap: `docs/api-reference.md` still has old `https://agent.media` examples.
- Open sync gap: public GitRoom repo may not include latest header/media/doc changes.

## 21. Open Issues Register

- ISSUE-001 [P0] Rotate exposed secrets — OpenAI service key, Supabase service role key, and worker secret were pasted into chat; rotate before considering production secure.
- ISSUE-002 [P0] Verify public GitRoom repo sync — Production deploy source and public repo may differ; confirm and sync without force-pushing unknown history.
- ISSUE-003 [P0] Fix old API base examples in markdown docs — `docs/api-reference.md` has old `https://agent.media` examples for Show Your App and Product Acting.
- ISSUE-004 [P0] Confirm all production envs after secret rotation — API v2 and worker must share the new worker secret exactly.
- ISSUE-005 [P1] Implement proper media derivatives — Homepage needs high-quality 360p/540p preview derivatives or adaptive streaming, not just original MP4 lazy loading.
- ISSUE-006 [P1] Add automated browser smoke test — Cover grouped header, mobile menu, homepage poster frames, lazy video src behavior, and create page gating.
- ISSUE-007 [P1] Add Product Acting API integration test — Mock or staging worker should verify no-credit preflight failure and refunded dispatch failure.
- ISSUE-008 [P1] Subtitle drift investigation tooling — Need reproducible job inspection for audio waveform, Whisper timings, trim offset, and ASS cues.
- ISSUE-009 [P1] Queue durability — Worker queue is in-memory; jobs queued but not persisted can be lost on restart.
- ISSUE-010 [P1] Abandoned job recovery cutoff — 15-minute cutoff may be risky for slow provider jobs; verify actual max runtime.
- ISSUE-011 [P1] Gallery processing page simplification — User complained about params/meta noise; verify current gallery detail page stays clean.
- ISSUE-012 [P1] Actor filters in dashboard — User asked for male/female filters and less duplicated actor text; verify/finish UI.
- ISSUE-013 [P1] Create page responsive design — User complained UI was huge and not responsive; visual QA across mobile/desktop needed.
- ISSUE-014 [P1] R2_PUBLIC_URL hardcoded fallback — Worker R2 helper contains public R2 fallback; prefer explicit env and no public leakage.
- ISSUE-015 [P2] Schema duplication in CLI — CLI hardcodes Product Acting templates/styles instead of importing shared schema.
- ISSUE-016 [P2] MCP timeout UX — MCP returns timeout after 10 minutes; consider exposing status URL and shorter progress messages.
- ISSUE-017 [P2] Docs publication source clarity — Clarify whether `apps/web` docs, `docs/api-reference.md`, generated OpenAPI, README, and SKILL are all published.
- ISSUE-018 [P2] Vercel local deploy upload size — Local deploy tried to upload huge workspace; rely on Git deploy or fix ignore/project root.
- ISSUE-019 [P2] Media proxy CDN semantics — Proxy currently no-stores range responses; consider CDN key normalization for range-safe caching.
- ISSUE-020 [P2] Homepage lower Show Your App video lazy loading — Now uses LazyVideo; keep browser-network verification after future edits.
- ISSUE-021 [P2] Actor public API filters — Ensure `/v1/actors?gender=female` docs match actual API behavior.
- ISSUE-022 [P2] Status route output contract — Ensure SDK/MCP status expectations match actual `statusRoute`.
- ISSUE-023 [P2] Provider error mapping — Map provider safety/timeouts into stable error codes instead of raw strings.
- ISSUE-024 [P2] Product frame prompt safety — Continue tuning prompt to avoid false safety blocks.
- ISSUE-025 [P2] Frame validation strictness — 0.06 tolerance may accept near-portrait but padded outputs; monitor.
- ISSUE-026 [P3] Landing headline/menu layout polish — User is sensitive to header regression; keep visual snapshots before release.
- ISSUE-027 [P3] Handover doc maintenance — Update this file after every production deploy until feature stabilizes.

## 22. Release Timeline From This Incident

- T-001: Initial Product Acting dashboard page was created under `/create/product-acting`.
- T-002: User reported UI too large and not responsive.
- T-003: Actor picker needed filters and less duplicated text.
- T-004: Mandatory step gating was requested so users cannot proceed without required data.
- T-005: Product upload initially failed with Edge Function non-2xx status.
- T-006: Generator id mismatch surfaced: unknown `product_acting_ugc` before registry/API support was aligned.
- T-007: Invalid API key surfaced and required env validation.
- T-008: Worker dispatch failure produced credits-refunded message.
- T-009: Worker endpoint missing/deploy issue produced no-credits-charged message.
- T-010: User provided Railway screenshot showing media-worker-v2 deployment state.
- T-011: Processing/gallery page had too much raw params/meta and needed cleanup.
- T-012: Subtitles were visibly out of sync and required pipeline-level timing handling.
- T-013: Docs/API/skills/npm/PyPI/SDK support were added or updated across packages.
- T-014: CLI update command was added and then fixed to avoid pnpm global bin default failure.
- T-015: External Claude skill install flow showed deprecation of `add-skill` and need for `skills add` guidance.
- T-016: Product frame timeout happened repeatedly at around 3 minutes across multiple attempts; worker timeouts/deploy needed attention.
- T-017: Latest videos were added to showcase/front page.
- T-018: Create page cards were updated with video previews near each type.
- T-019: Create card layout was adjusted to avoid clipped videos and support 2-per-row desktop layout.
- T-020: Public website header regressed to a different ungrouped nav.
- T-021: Grouped header and mobile menu were restored from a good worktree.
- T-022: Direct Railway API URL and direct R2 media URL leakage were called out and fixed in public surfaces where touched.
- T-023: Homepage carousel showed black boxes because videos loaded slowly and first frames were black.
- T-024: Poster frames were generated and local poster assets were added.
- T-025: Media proxy range cache behavior was fixed.
- T-026: Low-resolution local previews were tried and rejected for quality.
- T-027: Final homepage approach restored full-quality MP4s with lazy loading and posters.
- T-028: This handover document was expanded after the first short version was rejected.

## 23. Runbooks

### 23.1 Verify Product Acting From Dashboard

1. Open `https://agent-media.ai/create/product-acting` while authenticated.
2. Confirm stepper shows Scenario, Product, Actor, Style, Script.
3. Try clicking Next on Product step without upload; button should be disabled or blocked.
4. Upload PNG/JPEG/WebP product image under 50 MB.
5. Confirm upload preview appears and no Edge Function error shows.
6. Enter product name and description.
7. Pick an actor and optionally a variant.
8. Pick style and duration.
9. Leave script blank to test generated script, or enter max duration*3 words.
10. Submit and confirm redirect to gallery job page.
11. Confirm credits are deducted according to formula.
12. Confirm job status reaches completed or clear failure/refund message appears.
13. Confirm final video URL exists and plays.
14. Confirm subtitles align with speech if enabled.

### 23.2 Verify Product Acting From CLI

```bash
agent-media actor list --quiet | head
agent-media product-acting \
  --product-image https://example.com/product.png \
  --actor austin \
  --about "A simple product benefit in one sentence" \
  --template kitchen-counter \
  --acting-style honest-review \
  --duration 5 \
  --sync
```
- Use a real public product image URL, not `example.com`.
- If actor list fails with object error, inspect API response and auth key.
- If job times out but API returned job id, check `agent-media status <job_id>`.

### 23.3 Verify API Directly

```bash
curl -X POST https://api.agent-media.ai/v1/generate/product_acting_ugc \
  -H "Authorization: Bearer ma_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "product_image_url": "https://cdn.example.com/product.png",
    "actor_slug": "austin",
    "product_description": "A useful product with a clear everyday benefit",
    "template": "kitchen-counter",
    "acting_style": "honest-review",
    "duration": 5,
    "subtitles": true,
    "subtitle_style": "hormozi"
  }'
```
- Replace key and product URL before running.
- Expected initial response: HTTP 201 with job id and credits deducted.
- Poll with `GET /v1/videos/{job_id}`.

### 23.4 Verify Homepage Video Loading

1. Hard refresh `https://agent-media.ai`.
2. Open devtools/network if available.
3. Confirm poster JPGs load immediately.
4. Confirm carousel is not all black before video buffering completes.
5. Confirm MP4 requests do not all start before the carousel is near viewport.
6. Confirm visible videos are full quality, not ultra-compressed preview files.
7. Confirm no `/showcase-videos/*.mp4` requests remain.
8. Confirm `/api/media/...mp4?v=3` requests appear only when videos intersect.
9. Confirm Range responses return 206 with `Vary: range` and `Cache-Control: no-store`.

### 23.5 Verify Header and Mobile Menu

1. Desktop: open homepage at wide viewport.
2. Confirm brand says `agent-media`.
3. Confirm Actors, Use Cases, Pricing are visible as primary links.
4. Hover/focus Developers and confirm Developers, Integrations, API Docs, GitHub appear.
5. Hover/focus Resources and confirm Showcase, Blog appear.
6. Mobile: reduce viewport width or use device emulation.
7. Confirm hamburger button appears.
8. Open hamburger menu.
9. Confirm Product group appears.
10. Confirm Developers group appears.
11. Confirm Resources group appears.
12. Click a link and confirm menu closes.

### 23.6 Verify Worker Health and Endpoint

```bash
curl https://media-worker-v2-production.up.railway.app/health
curl -i -X POST https://media-worker-v2-production.up.railway.app/product-acting \
  -H "Content-Type: application/json" \
  -H "X-Worker-Secret: $WORKER_SECRET" \
  -d "{}"
```
- Expected health response includes service `media-worker-v2`.
- Expected empty Product Acting post with valid secret returns HTTP 400, proving endpoint exists.
- HTTP 404 means endpoint deploy is missing.
- HTTP 401 means secret mismatch or missing secret.

## 24. Rollback and Recovery

- Do not blindly revert only the latest commit if production is broken; identify whether issue is website, API, worker, env, or provider.
- For homepage video display issue, safe rollback target is before low-res preview commit only if lazy/full-quality fix is bad.
- For header regression, do not rollback to flat nav; restore grouped header.
- For worker Product Acting failures, inspect Railway logs before redeploying.
- For API v2 dispatch failures, inspect API v2 Railway logs and worker health.
- For credit/refund issues, inspect `generation_jobs`, credit transaction records, and `refund_credits` RPC outcome.
- For abandoned jobs after worker restart, confirm recovery did not incorrectly fail active jobs.
- For secret rotation, deploy API v2 and worker in a coordinated window because worker secret must match both sides.

## 25. Observability and Logs

- API v2 logs should show generator id, validation errors, worker dispatch failures, job insert failures, and credit errors.
- Worker logs should show job start, step 1 frame generation, frame task id, strict portrait retry, normalized upload, video task id, download/trim, subtitle burn, final upload, and callback.
- Vercel logs should show media proxy request failures or missing env for `R2_PUBLIC_URL`.
- Supabase logs should show webhook-provider callback updates.
- Railway deploy tab shows whether latest worker/API deploy is active, building, or failed.
- Browser network is essential for homepage video regressions. HTML checks are not enough.

## 26. Support Playbook for Common User-Facing Errors

- SUPPORT-001 Unknown generator product_acting_ugc: API v2/schema/deployed server does not include Product Acting registry or route; redeploy API v2 after schema changes.
- SUPPORT-002 Invalid API key: Check API key prefix/value, auth middleware, and whether user is using old key from docs.
- SUPPORT-003 Product Acting worker endpoint is not deployed yet. No credits charged.: API preflight got 404 from worker `/product-acting`; deploy media-worker-v2 with endpoint.
- SUPPORT-004 Video generation worker authentication is misconfigured. No credits charged.: API preflight got 401/403; WORKER_SECRET mismatch.
- SUPPORT-005 Video generation failed to start. Credits refunded.: Worker dispatch failed after credit deduction; inspect API logs and worker availability.
- SUPPORT-006 Product frame timed out: Image provider task timed out; inspect worker timeout envs, provider task status, prompt safety, provider health.
- SUPPORT-007 No subtitle words detected: Whisper did not detect words in generated audio; subtitles skipped or job may fail depending path.
- SUPPORT-008 Subtitles out of sync: Inspect trim offset, audio extraction timing, Whisper word timings, and ASS generation.
- SUPPORT-009 Homepage videos black: Check poster assets, LazyVideo src assignment, media proxy range cache, and first frame.
- SUPPORT-010 Videos low quality: Check no `/showcase-videos/*.mp4` preview files are being referenced.
- SUPPORT-011 Direct R2/Railway URL visible: Search public HTML/docs for `r2.dev`, Railway domains, and replace with proxy/custom domain.

## 27. File Inventory

- FILE-001 `apps/web/app/(dashboard)/create/product-acting/page.tsx` — Dashboard Product Acting wizard.
- FILE-002 `apps/web/app/api/v1/product-acting/route.ts` — Same-origin proxy from dashboard to API v2.
- FILE-003 `apps/web/app/api/v1/show-your-app/route.ts` — Same-origin proxy for Show Your App.
- FILE-004 `apps/web/app/api/media/[...path]/route.ts` — R2 media proxy and range cache handling.
- FILE-005 `apps/web/app/(landing)/page.tsx` — Public homepage and showcase carousel data.
- FILE-006 `apps/web/components/video-carousel.tsx` — Poster-first lazy video carousel.
- FILE-007 `apps/web/components/landing-header.tsx` — Grouped header and mobile menu.
- FILE-008 `apps/web/public/showcase-posters/austin-watch.jpg` — Homepage poster.
- FILE-009 `apps/web/public/showcase-posters/amara-perfume-car.jpg` — Homepage poster.
- FILE-010 `apps/web/public/showcase-posters/divya-perfume-kitchen.jpg` — Homepage poster.
- FILE-011 `apps/web/public/showcase-posters/morning-routine.jpg` — Homepage poster.
- FILE-012 `apps/web/public/showcase-posters/show-your-app.jpg` — Homepage poster.
- FILE-013 `apps/web/public/showcase-posters/ugc-hook.jpg` — Homepage poster.
- FILE-014 `apps/web/public/showcase-posters/naomi-app.jpg` — Homepage poster.
- FILE-015 `apps/web/public/showcase-posters/anna-perfume.jpg` — Homepage poster.
- FILE-016 `apps/web/public/showcase-posters/talking-head-review.jpg` — Homepage poster.
- FILE-017 `apps/web/app/(landing)/ai-actors/page.tsx` — Public actor library page.
- FILE-018 `apps/web/app/(landing)/ai-actors/actor-library-client.tsx` — Client actor library UI.
- FILE-019 `apps/web/app/(landing)/ai-actors/[slug]/page.tsx` — Public actor detail page.
- FILE-020 `apps/web/app/(landing)/ai-actors/[slug]/profile-client.tsx` — Client actor profile UI.
- FILE-021 `apps/web/components/actor-image.tsx` — Actor image component.
- FILE-022 `apps/web/components/developer-code-panel.tsx` — Code panel component copied with actor pages.
- FILE-023 `apps/web/app/sitemap.ts` — Sitemap including `/ai-actors`.
- FILE-024 `services/api-v2/src/server.ts` — API v2 Express server.
- FILE-025 `services/api-v2/src/routes/generate.ts` — Generate route and Product Acting dispatch.
- FILE-026 `services/api-v2/src/routes/actors.ts` — Actor list API route.
- FILE-027 `services/api-v2/src/routes/status.ts` — Job status API route.
- FILE-028 `services/api-v2/src/auth.ts` — Bearer token verification.
- FILE-029 `services/api-v2/Dockerfile` — API v2 Railway Dockerfile.
- FILE-030 `services/media-worker-v2/src/server.js` — Worker Express endpoints and queues.
- FILE-031 `services/media-worker-v2/src/product-acting-pipeline.js` — Product Acting core pipeline.
- FILE-032 `services/media-worker-v2/src/show-your-app-pipeline.js` — Show Your App pipeline.
- FILE-033 `services/media-worker-v2/src/ugc-pipeline.js` — Full UGC pipeline.
- FILE-034 `services/media-worker-v2/src/ass-generator.js` — Subtitle style generation.
- FILE-035 `services/media-worker-v2/src/hormozi-subtitles.js` — Hormozi subtitle helper.
- FILE-036 `services/media-worker-v2/src/whisper.js` — Transcription integration.
- FILE-037 `services/media-worker-v2/src/r2.js` — R2 upload/presign helper.
- FILE-038 `services/media-worker-v2/Dockerfile` — Worker Railway Dockerfile.
- FILE-039 `packages/schema/src/generators.ts` — Generator registry.
- FILE-040 `packages/schema/src/video.ts` — Shared schemas and constants.
- FILE-041 `packages/sdk-ts/src/index.ts` — TypeScript SDK.
- FILE-042 `packages/mcp-server/src/index.ts` — MCP tools.
- FILE-043 `apps/cli/src/commands/product-acting.ts` — CLI Product Acting command.
- FILE-044 `apps/cli/src/commands/update.ts` — CLI update command and skill refresh.
- FILE-045 `SKILL.md` — Agent skill instructions.
- FILE-046 `README.md` — Public repository README.
- FILE-047 `docs/api-reference.md` — Markdown API reference with known stale URLs.
- FILE-048 `generated/openapi.json` — Generated OpenAPI spec.
- FILE-049 `generated/api-types.d.ts` — Generated API types.
- FILE-050 `.vercelignore` — Ignore build/dependency artifacts for Vercel deploy attempts.
- FILE-051 `docs/product-acting-handover-2026-04-27.md` — This handover document.

## 28. Verification Matrix

- VERIFY-001 Dashboard wizard: happy path works.
- VERIFY-002 Dashboard wizard: error path is user-safe.
- VERIFY-003 Dashboard wizard: credits behavior is correct.
- VERIFY-004 Dashboard wizard: logs are actionable.
- VERIFY-005 Dashboard wizard: docs match behavior.
- VERIFY-006 Product upload: happy path works.
- VERIFY-007 Product upload: error path is user-safe.
- VERIFY-008 Product upload: credits behavior is correct.
- VERIFY-009 Product upload: logs are actionable.
- VERIFY-010 Product upload: docs match behavior.
- VERIFY-011 Actor picker: happy path works.
- VERIFY-012 Actor picker: error path is user-safe.
- VERIFY-013 Actor picker: credits behavior is correct.
- VERIFY-014 Actor picker: logs are actionable.
- VERIFY-015 Actor picker: docs match behavior.
- VERIFY-016 Actor variants: happy path works.
- VERIFY-017 Actor variants: error path is user-safe.
- VERIFY-018 Actor variants: credits behavior is correct.
- VERIFY-019 Actor variants: logs are actionable.
- VERIFY-020 Actor variants: docs match behavior.
- VERIFY-021 Step validation: happy path works.
- VERIFY-022 Step validation: error path is user-safe.
- VERIFY-023 Step validation: credits behavior is correct.
- VERIFY-024 Step validation: logs are actionable.
- VERIFY-025 Step validation: docs match behavior.
- VERIFY-026 Submit proxy: happy path works.
- VERIFY-027 Submit proxy: error path is user-safe.
- VERIFY-028 Submit proxy: credits behavior is correct.
- VERIFY-029 Submit proxy: logs are actionable.
- VERIFY-030 Submit proxy: docs match behavior.
- VERIFY-031 API v2 auth: happy path works.
- VERIFY-032 API v2 auth: error path is user-safe.
- VERIFY-033 API v2 auth: credits behavior is correct.
- VERIFY-034 API v2 auth: logs are actionable.
- VERIFY-035 API v2 auth: docs match behavior.
- VERIFY-036 API v2 schema: happy path works.
- VERIFY-037 API v2 schema: error path is user-safe.
- VERIFY-038 API v2 schema: credits behavior is correct.
- VERIFY-039 API v2 schema: logs are actionable.
- VERIFY-040 API v2 schema: docs match behavior.
- VERIFY-041 API v2 credits: happy path works.
- VERIFY-042 API v2 credits: error path is user-safe.
- VERIFY-043 API v2 credits: credits behavior is correct.
- VERIFY-044 API v2 credits: logs are actionable.
- VERIFY-045 API v2 credits: docs match behavior.
- VERIFY-046 API v2 worker preflight: happy path works.
- VERIFY-047 API v2 worker preflight: error path is user-safe.
- VERIFY-048 API v2 worker preflight: credits behavior is correct.
- VERIFY-049 API v2 worker preflight: logs are actionable.
- VERIFY-050 API v2 worker preflight: docs match behavior.
- VERIFY-051 API v2 worker dispatch: happy path works.
- VERIFY-052 API v2 worker dispatch: error path is user-safe.
- VERIFY-053 API v2 worker dispatch: credits behavior is correct.
- VERIFY-054 API v2 worker dispatch: logs are actionable.
- VERIFY-055 API v2 worker dispatch: docs match behavior.
- VERIFY-056 Worker queue: happy path works.
- VERIFY-057 Worker queue: error path is user-safe.
- VERIFY-058 Worker queue: credits behavior is correct.
- VERIFY-059 Worker queue: logs are actionable.
- VERIFY-060 Worker queue: docs match behavior.
- VERIFY-061 Worker frame generation: happy path works.
- VERIFY-062 Worker frame generation: error path is user-safe.
- VERIFY-063 Worker frame generation: credits behavior is correct.
- VERIFY-064 Worker frame generation: logs are actionable.
- VERIFY-065 Worker frame generation: docs match behavior.
- VERIFY-066 Worker portrait validation: happy path works.
- VERIFY-067 Worker portrait validation: error path is user-safe.
- VERIFY-068 Worker portrait validation: credits behavior is correct.
- VERIFY-069 Worker portrait validation: logs are actionable.
- VERIFY-070 Worker portrait validation: docs match behavior.
- VERIFY-071 Worker R2 frame upload: happy path works.
- VERIFY-072 Worker R2 frame upload: error path is user-safe.
- VERIFY-073 Worker R2 frame upload: credits behavior is correct.
- VERIFY-074 Worker R2 frame upload: logs are actionable.
- VERIFY-075 Worker R2 frame upload: docs match behavior.
- VERIFY-076 Worker video generation: happy path works.
- VERIFY-077 Worker video generation: error path is user-safe.
- VERIFY-078 Worker video generation: credits behavior is correct.
- VERIFY-079 Worker video generation: logs are actionable.
- VERIFY-080 Worker video generation: docs match behavior.
- VERIFY-081 Worker trimming: happy path works.
- VERIFY-082 Worker trimming: error path is user-safe.
- VERIFY-083 Worker trimming: credits behavior is correct.
- VERIFY-084 Worker trimming: logs are actionable.
- VERIFY-085 Worker trimming: docs match behavior.
- VERIFY-086 Worker subtitles: happy path works.
- VERIFY-087 Worker subtitles: error path is user-safe.
- VERIFY-088 Worker subtitles: credits behavior is correct.
- VERIFY-089 Worker subtitles: logs are actionable.
- VERIFY-090 Worker subtitles: docs match behavior.
- VERIFY-091 Worker final upload: happy path works.
- VERIFY-092 Worker final upload: error path is user-safe.
- VERIFY-093 Worker final upload: credits behavior is correct.
- VERIFY-094 Worker final upload: logs are actionable.
- VERIFY-095 Worker final upload: docs match behavior.
- VERIFY-096 Callback/webhook: happy path works.
- VERIFY-097 Callback/webhook: error path is user-safe.
- VERIFY-098 Callback/webhook: credits behavior is correct.
- VERIFY-099 Callback/webhook: logs are actionable.
- VERIFY-100 Callback/webhook: docs match behavior.
- VERIFY-101 Gallery status: happy path works.
- VERIFY-102 Gallery status: error path is user-safe.
- VERIFY-103 Gallery status: credits behavior is correct.
- VERIFY-104 Gallery status: logs are actionable.
- VERIFY-105 Gallery status: docs match behavior.
- VERIFY-106 CLI product-acting: happy path works.
- VERIFY-107 CLI product-acting: error path is user-safe.
- VERIFY-108 CLI product-acting: credits behavior is correct.
- VERIFY-109 CLI product-acting: logs are actionable.
- VERIFY-110 CLI product-acting: docs match behavior.
- VERIFY-111 SDK Product Acting: happy path works.
- VERIFY-112 SDK Product Acting: error path is user-safe.
- VERIFY-113 SDK Product Acting: credits behavior is correct.
- VERIFY-114 SDK Product Acting: logs are actionable.
- VERIFY-115 SDK Product Acting: docs match behavior.
- VERIFY-116 MCP Product Acting: happy path works.
- VERIFY-117 MCP Product Acting: error path is user-safe.
- VERIFY-118 MCP Product Acting: credits behavior is correct.
- VERIFY-119 MCP Product Acting: logs are actionable.
- VERIFY-120 MCP Product Acting: docs match behavior.
- VERIFY-121 Skill docs: happy path works.
- VERIFY-122 Skill docs: error path is user-safe.
- VERIFY-123 Skill docs: credits behavior is correct.
- VERIFY-124 Skill docs: logs are actionable.
- VERIFY-125 Skill docs: docs match behavior.
- VERIFY-126 Public API docs: happy path works.
- VERIFY-127 Public API docs: error path is user-safe.
- VERIFY-128 Public API docs: credits behavior is correct.
- VERIFY-129 Public API docs: logs are actionable.
- VERIFY-130 Public API docs: docs match behavior.
- VERIFY-131 Homepage header: happy path works.
- VERIFY-132 Homepage header: error path is user-safe.
- VERIFY-133 Homepage header: credits behavior is correct.
- VERIFY-134 Homepage header: logs are actionable.
- VERIFY-135 Homepage header: docs match behavior.
- VERIFY-136 Mobile header: happy path works.
- VERIFY-137 Mobile header: error path is user-safe.
- VERIFY-138 Mobile header: credits behavior is correct.
- VERIFY-139 Mobile header: logs are actionable.
- VERIFY-140 Mobile header: docs match behavior.
- VERIFY-141 Homepage carousel: happy path works.
- VERIFY-142 Homepage carousel: error path is user-safe.
- VERIFY-143 Homepage carousel: credits behavior is correct.
- VERIFY-144 Homepage carousel: logs are actionable.
- VERIFY-145 Homepage carousel: docs match behavior.
- VERIFY-146 Media proxy: happy path works.
- VERIFY-147 Media proxy: error path is user-safe.
- VERIFY-148 Media proxy: credits behavior is correct.
- VERIFY-149 Media proxy: logs are actionable.
- VERIFY-150 Media proxy: docs match behavior.
- VERIFY-151 Showcase page: happy path works.
- VERIFY-152 Showcase page: error path is user-safe.
- VERIFY-153 Showcase page: credits behavior is correct.
- VERIFY-154 Showcase page: logs are actionable.
- VERIFY-155 Showcase page: docs match behavior.
- VERIFY-156 Actor public page: happy path works.
- VERIFY-157 Actor public page: error path is user-safe.
- VERIFY-158 Actor public page: credits behavior is correct.
- VERIFY-159 Actor public page: logs are actionable.
- VERIFY-160 Actor public page: docs match behavior.
- VERIFY-161 Sitemap: happy path works.
- VERIFY-162 Sitemap: error path is user-safe.
- VERIFY-163 Sitemap: credits behavior is correct.
- VERIFY-164 Sitemap: logs are actionable.
- VERIFY-165 Sitemap: docs match behavior.
- VERIFY-166 Vercel build: happy path works.
- VERIFY-167 Vercel build: error path is user-safe.
- VERIFY-168 Vercel build: credits behavior is correct.
- VERIFY-169 Vercel build: logs are actionable.
- VERIFY-170 Vercel build: docs match behavior.
- VERIFY-171 Railway API deploy: happy path works.
- VERIFY-172 Railway API deploy: error path is user-safe.
- VERIFY-173 Railway API deploy: credits behavior is correct.
- VERIFY-174 Railway API deploy: logs are actionable.
- VERIFY-175 Railway API deploy: docs match behavior.
- VERIFY-176 Railway worker deploy: happy path works.
- VERIFY-177 Railway worker deploy: error path is user-safe.
- VERIFY-178 Railway worker deploy: credits behavior is correct.
- VERIFY-179 Railway worker deploy: logs are actionable.
- VERIFY-180 Railway worker deploy: docs match behavior.
- VERIFY-181 Secret rotation: happy path works.
- VERIFY-182 Secret rotation: error path is user-safe.
- VERIFY-183 Secret rotation: credits behavior is correct.
- VERIFY-184 Secret rotation: logs are actionable.
- VERIFY-185 Secret rotation: docs match behavior.
- VERIFY-186 Public GitRoom sync: happy path works.
- VERIFY-187 Public GitRoom sync: error path is user-safe.
- VERIFY-188 Public GitRoom sync: credits behavior is correct.
- VERIFY-189 Public GitRoom sync: logs are actionable.
- VERIFY-190 Public GitRoom sync: docs match behavior.
- VERIFY-191 Browser performance: happy path works.
- VERIFY-192 Browser performance: error path is user-safe.
- VERIFY-193 Browser performance: credits behavior is correct.
- VERIFY-194 Browser performance: logs are actionable.
- VERIFY-195 Browser performance: docs match behavior.
- VERIFY-196 Video quality: happy path works.
- VERIFY-197 Video quality: error path is user-safe.
- VERIFY-198 Video quality: credits behavior is correct.
- VERIFY-199 Video quality: logs are actionable.
- VERIFY-200 Video quality: docs match behavior.

## 29. Detailed QA Checklist

- QA-001 Production homepage loads without JavaScript console errors.
- QA-002 Production homepage does not expose Railway API URL in visible text.
- QA-003 Production homepage does not expose direct R2 URLs in visible video src before lazy load.
- QA-004 Production homepage still uses same-origin `/api/media` for showcase videos.
- QA-005 Production homepage poster images have acceptable visual quality.
- QA-006 Production homepage visible videos have full production quality.
- QA-007 Production homepage MP4 requests are lazy, not eager for every carousel item.
- QA-008 Production homepage lower Show Your App section lazy-loads video.
- QA-009 Desktop header grouped nav appears at wide viewport.
- QA-010 Mobile header hamburger appears below XL breakpoint.
- QA-011 Mobile menu opens and closes.
- QA-012 Mobile menu link click closes menu.
- QA-013 GitHub link opens public GitRoom repo.
- QA-014 Actors link opens `/ai-actors`.
- QA-015 Actor library loads actors.
- QA-016 Actor profile page loads for a known actor slug.
- QA-017 Create page opens for logged-in dashboard user.
- QA-018 Create page redirects unauthenticated user appropriately.
- QA-019 Product step blocks next without uploaded image.
- QA-020 Actor step blocks next without selected actor.
- QA-021 Script step blocks submit without script or product description.
- QA-022 Upload rejects unsupported MIME types.
- QA-023 Upload rejects files over 50 MB.
- QA-024 Upload clears file input after completion.
- QA-025 Actor search filters by name.
- QA-026 Actor search filters by slug.
- QA-027 Actor search filters by gender.
- QA-028 Actor search filters by age.
- QA-029 Actor search filters by nationality.
- QA-030 Variant picker loads variants for selected actor.
- QA-031 Variant picker resets variant when actor changes.
- QA-032 Submit payload includes selected actor variant id when selected.
- QA-033 Submit payload omits optional empty fields.
- QA-034 API rejects missing auth.
- QA-035 API rejects too-long script.
- QA-036 API rejects inactive actor.
- QA-037 API rejects wrong actor variant.
- QA-038 API returns no-charge error when worker health fails.
- QA-039 API refunds credits when dispatch fails.
- QA-040 Worker rejects missing secret.
- QA-041 Worker rejects missing required fields.
- QA-042 Worker queues second job for same user.
- QA-043 Worker completes queued job after first finishes.
- QA-044 Worker uploads product frame.
- QA-045 Worker uploads final MP4.
- QA-046 Worker callback marks job completed.
- QA-047 Worker callback marks job failed on fatal error.
- QA-048 Final video plays in gallery.
- QA-049 Final video has synced subtitles when enabled.
- QA-050 Final video has no subtitles when disabled.
- QA-051 CLI `product-acting --help` shows examples.
- QA-052 CLI validates missing script/about.
- QA-053 CLI validates duration.
- QA-054 CLI validates template.
- QA-055 CLI validates acting style.
- QA-056 CLI validates word count.
- QA-057 CLI quiet mode prints expected value.
- QA-058 CLI JSON mode prints valid JSON.
- QA-059 CLI sync mode waits and prints output URL.
- QA-060 SDK submit returns job id.
- QA-061 SDK create returns video URL.
- QA-062 SDK timeout error includes job id.
- QA-063 MCP tool schema includes required fields.
- QA-064 MCP tool reports failed generation as isError.
- QA-065 Docs examples use `api.agent-media.ai`.
- QA-066 OpenAPI server URL uses `api.agent-media.ai`.
- QA-067 Skill uses `api.agent-media.ai`.
- QA-068 README uses canonical commands.
- QA-069 PyPI/package docs match CLI flags.
- QA-070 NPM package includes update command.
- QA-071 Vercel production alias points to latest ready deployment.
- QA-072 Railway API v2 health includes product_acting_ugc in generators.
- QA-073 Railway worker health returns media-worker-v2.
- QA-074 Range request to media proxy returns 206.
- QA-075 Full request to media proxy returns 200.
- QA-076 R2 public URL is not required in client code.
- QA-077 No service-role secrets are in repository.
- QA-078 No OpenAI keys are in repository.
- QA-079 No worker secret is in repository.

## 30. Backlog and Next Plan

- BACKLOG-001 [Now] Rotate exposed secrets and redeploy API/worker with matching secrets.
- BACKLOG-002 [Now] Fix stale `https://agent.media` examples in `docs/api-reference.md`.
- BACKLOG-003 [Now] Verify public GitRoom repo and sync public docs/skill without destructive force.
- BACKLOG-004 [Now] Run one clean Product Acting generation after secret rotation.
- BACKLOG-005 [Now] Run one CLI Product Acting generation with `--sync`.
- BACKLOG-006 [Now] Run one MCP Product Acting generation from a clean Claude Code setup.
- BACKLOG-007 [Next] Add Playwright/browser smoke test for homepage posters/lazy video.
- BACKLOG-008 [Next] Add API v2 integration test for Product Acting preflight and dispatch.
- BACKLOG-009 [Next] Add worker unit test around prompt sanitization and portrait validation.
- BACKLOG-010 [Next] Add transcript/subtitle alignment debug artifact export.
- BACKLOG-011 [Next] Create media derivative pipeline: poster, 360p, 540p, original.
- BACKLOG-012 [Next] Add `<source>` variants or CDN manifest for preview vs original.
- BACKLOG-013 [Next] Persist worker queue state or move queue to DB/Redis.
- BACKLOG-014 [Next] Tune abandoned recovery threshold or gate by updated_at/provider heartbeat.
- BACKLOG-015 [Next] Consolidate Product Acting constants in schema package.
- BACKLOG-016 [Next] Expose actor gender filters in dashboard actor picker.
- BACKLOG-017 [Next] Reduce actor picker duplicated name/slug text.
- BACKLOG-018 [Next] Add responsive screenshot tests for create page.
- BACKLOG-019 [Next] Clean gallery processing page metadata display.
- BACKLOG-020 [Next] Review all public pages for direct R2/Railway leakage.
- BACKLOG-021 [Later] Implement provider error code normalization.
- BACKLOG-022 [Later] Implement script-guided word alignment for subtitles.
- BACKLOG-023 [Later] Create admin job replay/retry tool.
- BACKLOG-024 [Later] Create support dashboard for job logs and refund state.
- BACKLOG-025 [Later] Add webhook delivery retry visibility.

## 31. Appendix A - Product Acting Templates

- TEMPLATE-01 `product-in-hand` — Creator holds or presents the product near camera.
- TEMPLATE-02 `mirror-selfie` — Mirror-style selfie framing with product visible.
- TEMPLATE-03 `bathroom-reaction` — Bright indoor vanity/desk reaction; must stay brand-safe and clothed.
- TEMPLATE-04 `kitchen-counter` — Casual home demo near counter.
- TEMPLATE-05 `car-selfie` — Parked-car creator framing in daylight.
- TEMPLATE-06 `couch-review` — Warm home review from couch setting.
- TEMPLATE-07 `expert-interview` — Authority/interview style with product visible.
- TEMPLATE-08 `product-closeup` — Product prominent foreground with actor behind/reacting.

## 32. Appendix B - Acting Styles

- STYLE-01 `raw-selfie` — Natural, casual, imperfect phone-shot delivery.
- STYLE-02 `shocked` — Wide-eyed shocked reaction, expressive but believable.
- STYLE-03 `angry` — Concerned direct reaction hook.
- STYLE-04 `excited` — High-energy discovery reaction.
- STYLE-05 `dramatic` — Big family-friendly testimonial reaction.
- STYLE-06 `weird-hook` — Unexpected non-suggestive pattern interrupt.
- STYLE-07 `casual-demo` — Calm practical demonstration.
- STYLE-08 `honest-review` — Skeptical but fair credible review posture.

## 33. Appendix C - Generated Line-Item Operational Checklist

- OPS-001 web-dashboard: confirm source file path is known.
- OPS-002 web-dashboard: confirm owner service is known.
- OPS-003 web-dashboard: confirm production URL or deployment target is known.
- OPS-004 web-dashboard: confirm required environment variables are documented.
- OPS-005 web-dashboard: confirm auth boundary is documented.
- OPS-006 web-dashboard: confirm request payload contract is documented.
- OPS-007 web-dashboard: confirm success response is documented.
- OPS-008 web-dashboard: confirm failure response is documented.
- OPS-009 web-dashboard: confirm credit behavior is documented.
- OPS-010 web-dashboard: confirm logs to inspect are documented.
- OPS-011 web-dashboard: confirm local verification command is documented.
- OPS-012 web-dashboard: confirm production verification command is documented.
- OPS-013 web-dashboard: confirm rollback path is documented.
- OPS-014 web-dashboard: confirm open risks are documented.
- OPS-015 web-dashboard: confirm next action is documented.
- OPS-016 web-public: confirm source file path is known.
- OPS-017 web-public: confirm owner service is known.
- OPS-018 web-public: confirm production URL or deployment target is known.
- OPS-019 web-public: confirm required environment variables are documented.
- OPS-020 web-public: confirm auth boundary is documented.
- OPS-021 web-public: confirm request payload contract is documented.
- OPS-022 web-public: confirm success response is documented.
- OPS-023 web-public: confirm failure response is documented.
- OPS-024 web-public: confirm credit behavior is documented.
- OPS-025 web-public: confirm logs to inspect are documented.
- OPS-026 web-public: confirm local verification command is documented.
- OPS-027 web-public: confirm production verification command is documented.
- OPS-028 web-public: confirm rollback path is documented.
- OPS-029 web-public: confirm open risks are documented.
- OPS-030 web-public: confirm next action is documented.
- OPS-031 api-v2: confirm source file path is known.
- OPS-032 api-v2: confirm owner service is known.
- OPS-033 api-v2: confirm production URL or deployment target is known.
- OPS-034 api-v2: confirm required environment variables are documented.
- OPS-035 api-v2: confirm auth boundary is documented.
- OPS-036 api-v2: confirm request payload contract is documented.
- OPS-037 api-v2: confirm success response is documented.
- OPS-038 api-v2: confirm failure response is documented.
- OPS-039 api-v2: confirm credit behavior is documented.
- OPS-040 api-v2: confirm logs to inspect are documented.
- OPS-041 api-v2: confirm local verification command is documented.
- OPS-042 api-v2: confirm production verification command is documented.
- OPS-043 api-v2: confirm rollback path is documented.
- OPS-044 api-v2: confirm open risks are documented.
- OPS-045 api-v2: confirm next action is documented.
- OPS-046 media-worker-v2: confirm source file path is known.
- OPS-047 media-worker-v2: confirm owner service is known.
- OPS-048 media-worker-v2: confirm production URL or deployment target is known.
- OPS-049 media-worker-v2: confirm required environment variables are documented.
- OPS-050 media-worker-v2: confirm auth boundary is documented.
- OPS-051 media-worker-v2: confirm request payload contract is documented.
- OPS-052 media-worker-v2: confirm success response is documented.
- OPS-053 media-worker-v2: confirm failure response is documented.
- OPS-054 media-worker-v2: confirm credit behavior is documented.
- OPS-055 media-worker-v2: confirm logs to inspect are documented.
- OPS-056 media-worker-v2: confirm local verification command is documented.
- OPS-057 media-worker-v2: confirm production verification command is documented.
- OPS-058 media-worker-v2: confirm rollback path is documented.
- OPS-059 media-worker-v2: confirm open risks are documented.
- OPS-060 media-worker-v2: confirm next action is documented.
- OPS-061 supabase: confirm source file path is known.
- OPS-062 supabase: confirm owner service is known.
- OPS-063 supabase: confirm production URL or deployment target is known.
- OPS-064 supabase: confirm required environment variables are documented.
- OPS-065 supabase: confirm auth boundary is documented.
- OPS-066 supabase: confirm request payload contract is documented.
- OPS-067 supabase: confirm success response is documented.
- OPS-068 supabase: confirm failure response is documented.
- OPS-069 supabase: confirm credit behavior is documented.
- OPS-070 supabase: confirm logs to inspect are documented.
- OPS-071 supabase: confirm local verification command is documented.
- OPS-072 supabase: confirm production verification command is documented.
- OPS-073 supabase: confirm rollback path is documented.
- OPS-074 supabase: confirm open risks are documented.
- OPS-075 supabase: confirm next action is documented.
- OPS-076 r2-media: confirm source file path is known.
- OPS-077 r2-media: confirm owner service is known.
- OPS-078 r2-media: confirm production URL or deployment target is known.
- OPS-079 r2-media: confirm required environment variables are documented.
- OPS-080 r2-media: confirm auth boundary is documented.
- OPS-081 r2-media: confirm request payload contract is documented.
- OPS-082 r2-media: confirm success response is documented.
- OPS-083 r2-media: confirm failure response is documented.
- OPS-084 r2-media: confirm credit behavior is documented.
- OPS-085 r2-media: confirm logs to inspect are documented.
- OPS-086 r2-media: confirm local verification command is documented.
- OPS-087 r2-media: confirm production verification command is documented.
- OPS-088 r2-media: confirm rollback path is documented.
- OPS-089 r2-media: confirm open risks are documented.
- OPS-090 r2-media: confirm next action is documented.
- OPS-091 cli: confirm source file path is known.
- OPS-092 cli: confirm owner service is known.
- OPS-093 cli: confirm production URL or deployment target is known.
- OPS-094 cli: confirm required environment variables are documented.
- OPS-095 cli: confirm auth boundary is documented.
- OPS-096 cli: confirm request payload contract is documented.
- OPS-097 cli: confirm success response is documented.
- OPS-098 cli: confirm failure response is documented.
- OPS-099 cli: confirm credit behavior is documented.
- OPS-100 cli: confirm logs to inspect are documented.
- OPS-101 cli: confirm local verification command is documented.
- OPS-102 cli: confirm production verification command is documented.
- OPS-103 cli: confirm rollback path is documented.
- OPS-104 cli: confirm open risks are documented.
- OPS-105 cli: confirm next action is documented.
- OPS-106 sdk-ts: confirm source file path is known.
- OPS-107 sdk-ts: confirm owner service is known.
- OPS-108 sdk-ts: confirm production URL or deployment target is known.
- OPS-109 sdk-ts: confirm required environment variables are documented.
- OPS-110 sdk-ts: confirm auth boundary is documented.
- OPS-111 sdk-ts: confirm request payload contract is documented.
- OPS-112 sdk-ts: confirm success response is documented.
- OPS-113 sdk-ts: confirm failure response is documented.
- OPS-114 sdk-ts: confirm credit behavior is documented.
- OPS-115 sdk-ts: confirm logs to inspect are documented.
- OPS-116 sdk-ts: confirm local verification command is documented.
- OPS-117 sdk-ts: confirm production verification command is documented.
- OPS-118 sdk-ts: confirm rollback path is documented.
- OPS-119 sdk-ts: confirm open risks are documented.
- OPS-120 sdk-ts: confirm next action is documented.
- OPS-121 mcp-server: confirm source file path is known.
- OPS-122 mcp-server: confirm owner service is known.
- OPS-123 mcp-server: confirm production URL or deployment target is known.
- OPS-124 mcp-server: confirm required environment variables are documented.
- OPS-125 mcp-server: confirm auth boundary is documented.
- OPS-126 mcp-server: confirm request payload contract is documented.
- OPS-127 mcp-server: confirm success response is documented.
- OPS-128 mcp-server: confirm failure response is documented.
- OPS-129 mcp-server: confirm credit behavior is documented.
- OPS-130 mcp-server: confirm logs to inspect are documented.
- OPS-131 mcp-server: confirm local verification command is documented.
- OPS-132 mcp-server: confirm production verification command is documented.
- OPS-133 mcp-server: confirm rollback path is documented.
- OPS-134 mcp-server: confirm open risks are documented.
- OPS-135 mcp-server: confirm next action is documented.
- OPS-136 skill-docs: confirm source file path is known.
- OPS-137 skill-docs: confirm owner service is known.
- OPS-138 skill-docs: confirm production URL or deployment target is known.
- OPS-139 skill-docs: confirm required environment variables are documented.
- OPS-140 skill-docs: confirm auth boundary is documented.
- OPS-141 skill-docs: confirm request payload contract is documented.
- OPS-142 skill-docs: confirm success response is documented.
- OPS-143 skill-docs: confirm failure response is documented.
- OPS-144 skill-docs: confirm credit behavior is documented.
- OPS-145 skill-docs: confirm logs to inspect are documented.
- OPS-146 skill-docs: confirm local verification command is documented.
- OPS-147 skill-docs: confirm production verification command is documented.
- OPS-148 skill-docs: confirm rollback path is documented.
- OPS-149 skill-docs: confirm open risks are documented.
- OPS-150 skill-docs: confirm next action is documented.
- OPS-151 public-docs: confirm source file path is known.
- OPS-152 public-docs: confirm owner service is known.
- OPS-153 public-docs: confirm production URL or deployment target is known.
- OPS-154 public-docs: confirm required environment variables are documented.
- OPS-155 public-docs: confirm auth boundary is documented.
- OPS-156 public-docs: confirm request payload contract is documented.
- OPS-157 public-docs: confirm success response is documented.
- OPS-158 public-docs: confirm failure response is documented.
- OPS-159 public-docs: confirm credit behavior is documented.
- OPS-160 public-docs: confirm logs to inspect are documented.
- OPS-161 public-docs: confirm local verification command is documented.
- OPS-162 public-docs: confirm production verification command is documented.
- OPS-163 public-docs: confirm rollback path is documented.
- OPS-164 public-docs: confirm open risks are documented.
- OPS-165 public-docs: confirm next action is documented.
- OPS-166 deployment: confirm source file path is known.
- OPS-167 deployment: confirm owner service is known.
- OPS-168 deployment: confirm production URL or deployment target is known.
- OPS-169 deployment: confirm required environment variables are documented.
- OPS-170 deployment: confirm auth boundary is documented.
- OPS-171 deployment: confirm request payload contract is documented.
- OPS-172 deployment: confirm success response is documented.
- OPS-173 deployment: confirm failure response is documented.
- OPS-174 deployment: confirm credit behavior is documented.
- OPS-175 deployment: confirm logs to inspect are documented.
- OPS-176 deployment: confirm local verification command is documented.
- OPS-177 deployment: confirm production verification command is documented.
- OPS-178 deployment: confirm rollback path is documented.
- OPS-179 deployment: confirm open risks are documented.
- OPS-180 deployment: confirm next action is documented.

## 34. Appendix D - Expanded Route and Contract Checklist

- ROUTE-001 GET /health (api-v2 health): verify auth behavior.
- ROUTE-002 GET /health (api-v2 health): verify request validation.
- ROUTE-003 GET /health (api-v2 health): verify success response.
- ROUTE-004 GET /health (api-v2 health): verify error response.
- ROUTE-005 GET /health (api-v2 health): verify logging.
- ROUTE-006 GET /health (api-v2 health): verify rate limiting or queueing.
- ROUTE-007 GET /health (api-v2 health): verify credit impact.
- ROUTE-008 GET /health (api-v2 health): verify retry behavior.
- ROUTE-009 GET /openapi.json (api-v2 OpenAPI): verify auth behavior.
- ROUTE-010 GET /openapi.json (api-v2 OpenAPI): verify request validation.
- ROUTE-011 GET /openapi.json (api-v2 OpenAPI): verify success response.
- ROUTE-012 GET /openapi.json (api-v2 OpenAPI): verify error response.
- ROUTE-013 GET /openapi.json (api-v2 OpenAPI): verify logging.
- ROUTE-014 GET /openapi.json (api-v2 OpenAPI): verify rate limiting or queueing.
- ROUTE-015 GET /openapi.json (api-v2 OpenAPI): verify credit impact.
- ROUTE-016 GET /openapi.json (api-v2 OpenAPI): verify retry behavior.
- ROUTE-017 POST /v1/generate/ugc_video (API UGC generation): verify auth behavior.
- ROUTE-018 POST /v1/generate/ugc_video (API UGC generation): verify request validation.
- ROUTE-019 POST /v1/generate/ugc_video (API UGC generation): verify success response.
- ROUTE-020 POST /v1/generate/ugc_video (API UGC generation): verify error response.
- ROUTE-021 POST /v1/generate/ugc_video (API UGC generation): verify logging.
- ROUTE-022 POST /v1/generate/ugc_video (API UGC generation): verify rate limiting or queueing.
- ROUTE-023 POST /v1/generate/ugc_video (API UGC generation): verify credit impact.
- ROUTE-024 POST /v1/generate/ugc_video (API UGC generation): verify retry behavior.
- ROUTE-025 POST /v1/generate/show_your_app (API Show Your App generation): verify auth behavior.
- ROUTE-026 POST /v1/generate/show_your_app (API Show Your App generation): verify request validation.
- ROUTE-027 POST /v1/generate/show_your_app (API Show Your App generation): verify success response.
- ROUTE-028 POST /v1/generate/show_your_app (API Show Your App generation): verify error response.
- ROUTE-029 POST /v1/generate/show_your_app (API Show Your App generation): verify logging.
- ROUTE-030 POST /v1/generate/show_your_app (API Show Your App generation): verify rate limiting or queueing.
- ROUTE-031 POST /v1/generate/show_your_app (API Show Your App generation): verify credit impact.
- ROUTE-032 POST /v1/generate/show_your_app (API Show Your App generation): verify retry behavior.
- ROUTE-033 POST /v1/generate/product_acting_ugc (API Product Acting generation): verify auth behavior.
- ROUTE-034 POST /v1/generate/product_acting_ugc (API Product Acting generation): verify request validation.
- ROUTE-035 POST /v1/generate/product_acting_ugc (API Product Acting generation): verify success response.
- ROUTE-036 POST /v1/generate/product_acting_ugc (API Product Acting generation): verify error response.
- ROUTE-037 POST /v1/generate/product_acting_ugc (API Product Acting generation): verify logging.
- ROUTE-038 POST /v1/generate/product_acting_ugc (API Product Acting generation): verify rate limiting or queueing.
- ROUTE-039 POST /v1/generate/product_acting_ugc (API Product Acting generation): verify credit impact.
- ROUTE-040 POST /v1/generate/product_acting_ugc (API Product Acting generation): verify retry behavior.
- ROUTE-041 POST /v1/generate/subtitle (API subtitle generation): verify auth behavior.
- ROUTE-042 POST /v1/generate/subtitle (API subtitle generation): verify request validation.
- ROUTE-043 POST /v1/generate/subtitle (API subtitle generation): verify success response.
- ROUTE-044 POST /v1/generate/subtitle (API subtitle generation): verify error response.
- ROUTE-045 POST /v1/generate/subtitle (API subtitle generation): verify logging.
- ROUTE-046 POST /v1/generate/subtitle (API subtitle generation): verify rate limiting or queueing.
- ROUTE-047 POST /v1/generate/subtitle (API subtitle generation): verify credit impact.
- ROUTE-048 POST /v1/generate/subtitle (API subtitle generation): verify retry behavior.
- ROUTE-049 GET /v1/actors (API actor list): verify auth behavior.
- ROUTE-050 GET /v1/actors (API actor list): verify request validation.
- ROUTE-051 GET /v1/actors (API actor list): verify success response.
- ROUTE-052 GET /v1/actors (API actor list): verify error response.
- ROUTE-053 GET /v1/actors (API actor list): verify logging.
- ROUTE-054 GET /v1/actors (API actor list): verify rate limiting or queueing.
- ROUTE-055 GET /v1/actors (API actor list): verify credit impact.
- ROUTE-056 GET /v1/actors (API actor list): verify retry behavior.
- ROUTE-057 GET /v1/videos/{jobId} (API job status): verify auth behavior.
- ROUTE-058 GET /v1/videos/{jobId} (API job status): verify request validation.
- ROUTE-059 GET /v1/videos/{jobId} (API job status): verify success response.
- ROUTE-060 GET /v1/videos/{jobId} (API job status): verify error response.
- ROUTE-061 GET /v1/videos/{jobId} (API job status): verify logging.
- ROUTE-062 GET /v1/videos/{jobId} (API job status): verify rate limiting or queueing.
- ROUTE-063 GET /v1/videos/{jobId} (API job status): verify credit impact.
- ROUTE-064 GET /v1/videos/{jobId} (API job status): verify retry behavior.
- ROUTE-065 POST /product-acting (worker Product Acting): verify auth behavior.
- ROUTE-066 POST /product-acting (worker Product Acting): verify request validation.
- ROUTE-067 POST /product-acting (worker Product Acting): verify success response.
- ROUTE-068 POST /product-acting (worker Product Acting): verify error response.
- ROUTE-069 POST /product-acting (worker Product Acting): verify logging.
- ROUTE-070 POST /product-acting (worker Product Acting): verify rate limiting or queueing.
- ROUTE-071 POST /product-acting (worker Product Acting): verify credit impact.
- ROUTE-072 POST /product-acting (worker Product Acting): verify retry behavior.
- ROUTE-073 POST /show-your-app (worker Show Your App): verify auth behavior.
- ROUTE-074 POST /show-your-app (worker Show Your App): verify request validation.
- ROUTE-075 POST /show-your-app (worker Show Your App): verify success response.
- ROUTE-076 POST /show-your-app (worker Show Your App): verify error response.
- ROUTE-077 POST /show-your-app (worker Show Your App): verify logging.
- ROUTE-078 POST /show-your-app (worker Show Your App): verify rate limiting or queueing.
- ROUTE-079 POST /show-your-app (worker Show Your App): verify credit impact.
- ROUTE-080 POST /show-your-app (worker Show Your App): verify retry behavior.
- ROUTE-081 POST /ugc (worker UGC): verify auth behavior.
- ROUTE-082 POST /ugc (worker UGC): verify request validation.
- ROUTE-083 POST /ugc (worker UGC): verify success response.
- ROUTE-084 POST /ugc (worker UGC): verify error response.
- ROUTE-085 POST /ugc (worker UGC): verify logging.
- ROUTE-086 POST /ugc (worker UGC): verify rate limiting or queueing.
- ROUTE-087 POST /ugc (worker UGC): verify credit impact.
- ROUTE-088 POST /ugc (worker UGC): verify retry behavior.
- ROUTE-089 POST /subtitle (worker subtitle): verify auth behavior.
- ROUTE-090 POST /subtitle (worker subtitle): verify request validation.
- ROUTE-091 POST /subtitle (worker subtitle): verify success response.
- ROUTE-092 POST /subtitle (worker subtitle): verify error response.
- ROUTE-093 POST /subtitle (worker subtitle): verify logging.
- ROUTE-094 POST /subtitle (worker subtitle): verify rate limiting or queueing.
- ROUTE-095 POST /subtitle (worker subtitle): verify credit impact.
- ROUTE-096 POST /subtitle (worker subtitle): verify retry behavior.
- ROUTE-097 GET /queue (worker queue): verify auth behavior.
- ROUTE-098 GET /queue (worker queue): verify request validation.
- ROUTE-099 GET /queue (worker queue): verify success response.
- ROUTE-100 GET /queue (worker queue): verify error response.
- ROUTE-101 GET /queue (worker queue): verify logging.
- ROUTE-102 GET /queue (worker queue): verify rate limiting or queueing.
- ROUTE-103 GET /queue (worker queue): verify credit impact.
- ROUTE-104 GET /queue (worker queue): verify retry behavior.
- ROUTE-105 GET /api/media/[...path] (web media proxy): verify auth behavior.
- ROUTE-106 GET /api/media/[...path] (web media proxy): verify request validation.
- ROUTE-107 GET /api/media/[...path] (web media proxy): verify success response.
- ROUTE-108 GET /api/media/[...path] (web media proxy): verify error response.
- ROUTE-109 GET /api/media/[...path] (web media proxy): verify logging.
- ROUTE-110 GET /api/media/[...path] (web media proxy): verify rate limiting or queueing.
- ROUTE-111 GET /api/media/[...path] (web media proxy): verify credit impact.
- ROUTE-112 GET /api/media/[...path] (web media proxy): verify retry behavior.
- ROUTE-113 POST /api/v1/product-acting (web Product Acting proxy): verify auth behavior.
- ROUTE-114 POST /api/v1/product-acting (web Product Acting proxy): verify request validation.
- ROUTE-115 POST /api/v1/product-acting (web Product Acting proxy): verify success response.
- ROUTE-116 POST /api/v1/product-acting (web Product Acting proxy): verify error response.
- ROUTE-117 POST /api/v1/product-acting (web Product Acting proxy): verify logging.
- ROUTE-118 POST /api/v1/product-acting (web Product Acting proxy): verify rate limiting or queueing.
- ROUTE-119 POST /api/v1/product-acting (web Product Acting proxy): verify credit impact.
- ROUTE-120 POST /api/v1/product-acting (web Product Acting proxy): verify retry behavior.
- ROUTE-121 POST /api/v1/show-your-app (web Show Your App proxy): verify auth behavior.
- ROUTE-122 POST /api/v1/show-your-app (web Show Your App proxy): verify request validation.
- ROUTE-123 POST /api/v1/show-your-app (web Show Your App proxy): verify success response.
- ROUTE-124 POST /api/v1/show-your-app (web Show Your App proxy): verify error response.
- ROUTE-125 POST /api/v1/show-your-app (web Show Your App proxy): verify logging.
- ROUTE-126 POST /api/v1/show-your-app (web Show Your App proxy): verify rate limiting or queueing.
- ROUTE-127 POST /api/v1/show-your-app (web Show Your App proxy): verify credit impact.
- ROUTE-128 POST /api/v1/show-your-app (web Show Your App proxy): verify retry behavior.

## 35. Appendix E - Production Release Gate Checklist

- GATE-001 [preflight] working tree is clean or intentional.
- GATE-002 [preflight] secrets are not in diff.
- GATE-003 [preflight] target branch is correct.
- GATE-004 [preflight] remote is correct.
- GATE-005 [preflight] public repo sync impact understood.
- GATE-006 [preflight] env changes are listed.
- GATE-007 [preflight] rollback target is known.
- GATE-008 [preflight] migration impact is none or documented.
- GATE-009 [preflight] credit/refund behavior is unchanged or tested.
- GATE-010 [preflight] user-facing copy is reviewed.
- GATE-011 [preflight] docs affected are listed.
- GATE-012 [preflight] skill/package affected are listed.
- GATE-013 [preflight] API base URL is canonical.
- GATE-014 [preflight] direct R2 URLs are not introduced.
- GATE-015 [preflight] direct Railway URLs are not introduced.
- GATE-016 [preflight] header/mobile menu are not regressed.
- GATE-017 [preflight] homepage videos retain quality.
- GATE-018 [preflight] lazy loading remains enabled.
- GATE-019 [preflight] poster assets exist.
- GATE-020 [preflight] open issues are updated.
- GATE-021 [build] mobile viewport reviewed.
- GATE-022 [build] desktop viewport reviewed.
- GATE-023 [build] network behavior reviewed.
- GATE-024 [build] media proxy headers reviewed.
- GATE-025 [build] credits estimate reviewed.
- GATE-026 [build] script pacing reviewed.
- GATE-027 [build] actor flow reviewed.
- GATE-028 [build] upload flow reviewed.
- GATE-029 [build] gallery flow reviewed.
- GATE-030 [build] status polling reviewed.
- GATE-031 [build] web typecheck passed.
- GATE-032 [build] web production build passed.
- GATE-033 [build] CLI tests considered.
- GATE-034 [build] schema build considered.
- GATE-035 [build] SDK build considered.
- GATE-036 [build] MCP build considered.
- GATE-037 [build] API v2 build considered.
- GATE-038 [build] worker Docker build considered.
- GATE-039 [build] OpenAPI generated if schema changed.
- GATE-040 [build] api-types generated if schema changed.
- GATE-041 [build] README updated if command changed.
- GATE-042 [build] SKILL updated if workflow changed.
- GATE-043 [build] docs site updated if API changed.
- GATE-044 [build] package version considered.
- GATE-045 [build] npm publish need considered.
- GATE-046 [build] PyPI publish need considered.
- GATE-047 [build] Vercel ignore behavior considered.
- GATE-048 [build] lint warnings reviewed.
- GATE-049 [build] new assets size reviewed.
- GATE-050 [build] public HTML reviewed.
- GATE-051 [deploy] commit message is clear.
- GATE-052 [deploy] commit pushed to origin/main.
- GATE-053 [deploy] Vercel deployment started.
- GATE-054 [deploy] Vercel deployment ready.
- GATE-055 [deploy] agent-media.ai alias points to ready deployment.
- GATE-056 [deploy] Railway API deploy needed only if API changed.
- GATE-057 [deploy] Railway worker deploy needed only if worker changed.
- GATE-058 [deploy] worker health checked.
- GATE-059 [deploy] API health checked.
- GATE-060 [deploy] OpenAPI checked.
- GATE-061 [deploy] media proxy checked.
- GATE-062 [deploy] homepage checked.
- GATE-063 [deploy] create page checked.
- GATE-064 [deploy] gallery checked.
- GATE-065 [deploy] CLI checked.
- GATE-066 [deploy] MCP checked.
- GATE-067 [deploy] SDK checked.
- GATE-068 [deploy] docs checked.
- GATE-069 [deploy] public repo checked.
- GATE-070 [deploy] rollback not needed.
- GATE-071 [deploy] release notes captured.
- GATE-072 [deploy] handover updated.
- GATE-073 [deploy] support risks captured.
- GATE-074 [deploy] screenshots captured if UI changed.
- GATE-075 [deploy] logs clean enough.
- GATE-076 [deploy] commit message is clear.
- GATE-077 [deploy] commit pushed to origin/main.
- GATE-078 [deploy] Vercel deployment started.
- GATE-079 [deploy] Vercel deployment ready.
- GATE-080 [deploy] agent-media.ai alias points to ready deployment.
- GATE-081 [smoke-test] mobile menu opens.
- GATE-082 [smoke-test] actor page loads.
- GATE-083 [smoke-test] docs page loads.
- GATE-084 [smoke-test] API actor list works.
- GATE-085 [smoke-test] API submit rejects invalid auth.
- GATE-086 [smoke-test] worker health OK.
- GATE-087 [smoke-test] media range OK.
- GATE-088 [smoke-test] media full OK.
- GATE-089 [smoke-test] product upload path OK.
- GATE-090 [smoke-test] create gating OK.
- GATE-091 [smoke-test] submit path OK.
- GATE-092 [smoke-test] gallery path OK.
- GATE-093 [smoke-test] credits path OK.
- GATE-094 [smoke-test] refund path OK.
- GATE-095 [smoke-test] subtitles path OK.
- GATE-096 [smoke-test] CLI help OK.
- GATE-097 [smoke-test] CLI actor list OK.
- GATE-098 [smoke-test] MCP schema OK.
- GATE-099 [smoke-test] SDK import OK.
- GATE-100 [smoke-test] skill install docs OK.
- GATE-101 [smoke-test] homepage visible.
- GATE-102 [smoke-test] poster visible.
- GATE-103 [smoke-test] video full quality.
- GATE-104 [smoke-test] no black carousel.
- GATE-105 [smoke-test] desktop nav grouped.
- GATE-106 [post-release] monitor Vercel errors.
- GATE-107 [post-release] monitor Railway API logs.
- GATE-108 [post-release] monitor worker logs.
- GATE-109 [post-release] monitor Supabase callbacks.
- GATE-110 [post-release] monitor credit refunds.
- GATE-111 [post-release] monitor user reports.
- GATE-112 [post-release] watch homepage network.
- GATE-113 [post-release] watch provider timeouts.
- GATE-114 [post-release] watch subtitle sync reports.
- GATE-115 [post-release] watch public docs feedback.
- GATE-116 [post-release] update open issues.
- GATE-117 [post-release] schedule secret rotation verification.
- GATE-118 [post-release] close completed incident tasks.
- GATE-119 [post-release] record deployment URL.
- GATE-120 [post-release] record commit hash.

## 36. Final Notes for the Next Engineer

- Do not trust old screenshots or a previous agent summary without checking code and production.
- The user cares strongly about production UI quality and will notice regressions immediately.
- Avoid shipping low-quality media previews as a performance fix; use lazy loading, posters, and proper derivatives.
- Avoid changing the public header structure without comparing against the grouped header requirement.
- When asked to release, verify alias mapping after Vercel is Ready.
- When asked about docs/skills/npm/PyPI, check all surfaces rather than assuming one source updates all.
- When API examples include a host, it must be `https://api.agent-media.ai` unless explicitly documenting local development.
- When public media appears in website HTML, prefer same-origin `/api/media` or a sanctioned media CDN, not raw R2.
- When worker/API secrets change, update both sides atomically.
- When subtitle sync is reported, debug pipeline timing, not frontend rendering.

