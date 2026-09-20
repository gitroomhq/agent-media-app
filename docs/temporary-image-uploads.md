# Temporary image uploads

Agents can open an image uploader for a person, collect the resulting references, and pass those references into generation. MCP Apps hosts can show the panel inside the conversation; other agents receive a browser link to the same panel. The initial release accepts still PNG, JPEG, and WebP images, up to 25 MiB and 40 megapixels, with ten images per panel.

Images are available until the panel's explicit expiry, 24 hours after the session is created. They are stored in a separate **private** R2/S3 bucket. An API gateway checks expiry on every read and sends `Cache-Control: private, no-store`; it does not redirect to a longer-lived storage URL. A background sweep deletes expired objects every minute and retains failed deletion records for retry. Bucket lifecycle rules provide a second cleanup mechanism during service downtime. Physical deletion may lag expiry; access through Agent Media ends at expiry regardless of cleanup availability.

## User flow

1. Ask the agent to upload images. It calls `open_upload_panel`.
2. Drop multiple images together or select multiple files (up to ten per panel). The panel shows previews and the expiry time. Interrupted uploads can be retried under the same identity.
3. In a compatible inline host, select **Use images in chat**. In a browser, copy the image links back to the conversation, or tell the agent to call `get_uploads` with the session ID it already has.
4. The agent uses the exact returned `image_url` in `refs`, `first_frame`, or an existing skill's image field. Uploading does not spend generation credits; generation still follows its normal quote/billing flow.

No agent needs a shell or base64 image data. The browser link carries a restricted session capability in its fragment; that capability can upload/read only within that session, not manage the account or generate media. Keep the link private. Image URLs are bearer capabilities: anyone given one can view that image until expiry. Completed generation outputs follow existing output retention; the original temporary inputs are not copied into permanent upload storage by the fixed-skill ingestion helper.

An expired input cannot be reused by a later generation or a saved character expecting a permanent source image. Upload it again or use a generated character sheet. Submit generations while references are still valid; this release does not extend retention for long-running jobs. Removing an image from an external provider's cache is outside this uploader's deletion mechanism.

## Deployment and self-hosting

The feature is off by default so an application release cannot advertise routes before its database and storage are ready.

1. Apply `supabase/migrations/20260919140000_temporary_image_uploads.sql` through the normal migration process.
2. Create a separate R2 bucket with public access **disabled**. Do not attach a public custom domain or enable its `r2.dev` URL. Give the API's existing R2 credentials read/write/delete access to it. Do not reuse the public output bucket.
3. Add an expiry lifecycle rule for the `temporary-images/` prefix (one day) to cover orphaned objects and service downtime. R2 lifecycle deletion is asynchronous; the API enforces the visible expiry independently.
4. Configure the API:

```dotenv
TEMP_UPLOADS_ENABLED=true
R2_TEMP_UPLOAD_BUCKET=agent-media-temporary-inputs
PUBLIC_API_BASE=https://api.example.com
```

Existing `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY` configure storage. `S3_ENDPOINT`, `S3_REGION`, and `S3_FORCE_PATH_STYLE=true` support compatible local/private storage such as MinIO. The private temporary bucket is still required. Keep the normal output bucket public according to the existing deployment contract.

5. Set the **same** `PUBLIC_API_BASE` on `primitive-worker-vnext`. Deploy the updated schema package, API, and primitive worker together. The worker accepts only the exact temporary-image gateway on this configured origin, in addition to the existing R2 image prefix; arbitrary external URLs are not added to its trust list. Leave this base unset only when using the official hosted API domain.
6. Build with `pnpm --filter @agentmedia/schema build` and `pnpm --filter api-v2 build`. The API build bundles the official MCP Apps SDK into the standalone panel; no CDN or third-party runtime scripts are loaded. The stdio proxy now forwards resources as well as tools and needs its updated package build when used with UI-capable stdio clients.
7. Check private bucket access, hosted/local generation reference handling, expiry, and cleanup in staging before enabling customer traffic. Refresh connector tool discovery after enabling the flag.

Uploads go as bounded binary HTTP bodies through the API to private R2. There is no new R2 browser CORS requirement, multipart parser, public upload key, or model-context transfer. The API limits active binary uploads per process; database admission serializes per account and caps active sessions/files across replicas. Image normalization preserves resolution, applies orientation, strips metadata, and converts WebP to PNG. Animated images, SVG, and HEIC are rejected with actionable messages. Existing image moderation configuration remains in effect.

## HTTP contract

| Request | Authorization | Result |
|---|---|---|
| `POST /v1/upload-sessions` | Account Bearer API key or JWT | Session ID, expiry, restricted upload token, browser link, current images. |
| `GET /v1/upload-sessions/:id` | Account Bearer | Ready images on that account; never returns the panel token. |
| `GET /v1/upload-panels/:id` | `Upload <session-token>` | Panel state and ready image references. |
| `PUT /v1/upload-panels/:id/files/:asset-id?filename=photo.png` | `Upload <session-token>` | Binary `application/octet-stream` body; validated image reference. Reuse the UUID for retries of the same file. |
| `GET /v1/uploads/temporary/:asset-id/image?token=…` | Image capability in URL | Validated image bytes until expiry; no redirect, no cache. |
| `GET /upload#session=…&token=…` | Restricted capability in fragment | Standalone upload UI. The fragment is not sent in the HTTP URL or Referer header. |

Repeated successful file requests return the same stored asset without another write. A reused asset ID with different bytes returns 409; an active attempt returns 409; expired sessions/images return 410; owner/token mismatches return an opaque error. API error reports and transaction traces redact the 64-character capability secrets. Do not log capability URLs, authorization headers, file bytes, or response payloads in proxies/APM. Use session/asset IDs and error codes for diagnostics.

The model sees upload summaries and image references. The panel token is delivered in MCP result `_meta`; the fallback browser link necessarily also contains the restricted session capability. No account API key or R2 credential reaches the panel.

## Compatibility

The integration uses the shared MCP Apps `_meta.ui.resourceUri`, `text/html;profile=mcp-app`, resource discovery, and SDK bridge. `Use images in chat` updates model context and sends a user message only on the person's click. A host that cannot perform those operations falls back to copying links. Actual panel availability depends on the client's MCP Apps support and connector configuration; the browser handoff remains usable by any agent that can call the authenticated HTTP or MCP tools.

Primary specifications: [official OpenAI UI documentation](https://developers.openai.com/plugins/build/chatgpt-ui), [MCP Apps overview](https://apps.extensions.modelcontextprotocol.io/api/documents/overview.html), and [MCP Apps SDK quickstart](https://apps.extensions.modelcontextprotocol.io/api/documents/Quickstart.html).

## Validation

Build first so the panel resource exists, then run:

```sh
pnpm --filter @agentmedia/schema test -- temporary-image.test.ts
pnpm --filter api-v2 exec vitest run src/__tests__/temporary-upload.test.ts src/__tests__/temporary-upload-sql.test.ts src/__tests__/mcp-upload-panel.test.ts src/__tests__/temporary-image-handoff.test.ts src/__tests__/temporary-upload-telemetry.test.ts
```

The tests use real image decoding, real HTTP handlers, a real MCP client/server transport, and the migration executed in an isolated PostgreSQL-compatible PGlite database. R2 is replaced by an in-memory object store and moderation by a test stub, so contributors need no production credentials and spend no generation credits. Database tests cover owner checks, request identity, leases, quotas, expiry, and role privileges. PGlite is a single connection; production replica concurrency still requires a staging PostgreSQL concurrency exercise in addition to these tests.

## How agents learn this workflow

The connector includes the upload workflow in its MCP initialization instructions and in image generation/upload tool descriptions. The stdio proxy forwards those tool descriptions. The generated public skill puts it before the generation loop, and the plugin descriptions, CLI skill, authentication guide, exact optional-tool schemas, and website AI-readable documentation point agents to the same flow. Both website AI context routes and the tools reference explain multiple image selection and 24-hour expiry.

Agents must discover `open_upload_panel` and `get_uploads` before offering them, show the returned browser link when inline UI is unavailable, wait for the user, then retrieve all ready references. Installing or reading a skill is not proof that the connected deployment supports the feature. Existing sessions may need tool rediscovery after deployment; individual clients decide how to present server instructions.

### Clients with a cached tool catalog

If a connected client still lists only the original nine tools, call `upload_image` with `{}` to open the same panel. After the person uploads, call `upload_image` with only the exact `upload_key` returned by that call (`panel:<session UUID>`). This retrieves all ready images using the same owner authorization and expiry rules as `get_uploads`; it does not re-host images. No new argument names or tool names are needed by these older clients. `list_models` also returns these current upload instructions. The dedicated tools remain the preferred interface when available.

Plugin 2.1.0 refreshes the upload-first skill instructions; reconnecting a remote connector is separate from updating an installed skill/plugin. A passing direct MCP test does not establish that a host refreshed its tool catalog or selected the right tool. Release acceptance must include a call through an already-installed client.

## Image inspection and session recovery

`get_uploads({session_id})` and cached `upload_image({upload_key:"panel:<session_id>"})` return MCP native image content, labeled by asset ID and filename, alongside original URLs. Preview generation stays on the authenticated API: the client never has to download from the image host. JPEG previews fit within 512×512 pixels and 256KiB each, at most 10. They are created in memory, not stored as permanent copies, and never replace original generation references. Failed previews are reported separately without discarding usable URLs.

`get_uploads({})` or cached `upload_image({upload_key:"panel:recent"})` lists owned unexpired sessions with filenames, no tokens or image URLs. This is account-wide recovery, not conversation memory: agents must select the session matching the user request and clarify ambiguity. They must inspect available image content instead of guessing the subject from email domains or account metadata.

Owner-authenticated REST endpoints: `GET /v1/upload-sessions` for recovery metadata and `GET /v1/upload-sessions/:sessionId/previews` for image inspection. Panel capability tokens cannot use these endpoints. Preview reads retain hard expiry, no-store headers and a two-request processing capacity bound.
