# Recovery Checklist

Use this before any deploy or live generation.

## Repo

- [ ] `git status --short --branch` reviewed.
- [ ] Branch is known.
- [ ] Diff contains only intended files.
- [ ] No unrelated prompt/provider/queue changes.
- [ ] Tests passed.
- [ ] Build/typecheck passed.

## Production Env

Verify before deploy:

```bash
railway variables --service api-v2
railway variables --service media-worker-v2
```

Critical values to inspect:

- `USE_DURABLE_QUEUE`
- `ORCHESTRATOR_ENGINE`
- `SELFIE_DISPATCH_ENGINE`
- `WORKER_V2_URL`
- `VIDEO_PROVIDER`
- `VNEXT_PRIMITIVE_WORKER_URL`
- `VNEXT_PRIMITIVE_WORKER_SECRET`

## Production Health

Verify after deploy:

```bash
curl https://api.agent-media.ai/health
curl https://media-worker-v2-production.up.railway.app/health
```

Expected:

- API returns `status: ok`.
- worker returns `status: ok`.
- worker has no unexpected active/queued jobs.

## vNext Primitive Safety

Before enabling a primitive:

- [ ] fresh worker deployed,
- [ ] fresh DB tables migrated,
- [ ] fresh storage prefix configured,
- [ ] primitive worker secret configured,
- [ ] SSRF validation exists in API and worker,
- [ ] credit accounting exists,
- [ ] provider timeout exists,
- [ ] provider task id stored,
- [ ] rollback is documented.

## Live Generation Gate

Do not run live generation unless all are true:

- [ ] user approved exact command/API call,
- [ ] provider named,
- [ ] primitive/skill named,
- [ ] output artifacts named,
- [ ] expected cost/spend risk acknowledged by operator,
- [ ] cancellation/rollback path known.
