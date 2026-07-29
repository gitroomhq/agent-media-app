# Contributing to agent-media

Thanks for your interest! agent-media is an agent-native AI UGC video
platform — the server does the craft, the agent only chooses **what** to make.

## License

Apache-2.0. By contributing you agree your contributions are licensed under
the same terms. No CLA, no follow-on obligations.

## Getting started

```bash
pnpm install
pnpm build          # turbo build across the monorepo
pnpm test           # vitest
```

The monorepo layout:

- `services/` — api-v2 (Express control plane), media/primitive/subtitle workers
- `apps/` — web (Next.js), cli, docs
- `packages/` — mcp-server, sdk-ts, sdk-python, schema, types, ui
- `supabase/` — migrations + edge functions
- `public-skill/`, `skills/` — the agent-facing skill pack

## Ground rules

1. **The spine is non-negotiable:** routing and quality live server-side.
   PRs that move craft decisions into clients/prompts will be declined.
2. **Never commit secrets.** `.env*` is gitignored; config is runtime-injected.
3. **Schema is the source of truth.** Docs and examples are generated from
   live schemas — don't hand-edit generated output.
4. Keep PRs focused; one change per PR with a clear description.

## Reporting bugs

Open a GitHub issue with reproduction steps. For security issues, see
[SECURITY.md](SECURITY.md) — do not open a public issue.
