# Security Policy

## Reporting a vulnerability

Please **do not open a public issue** for security vulnerabilities.

Email **yuvalsuede@gmail.com** with:

- A description of the issue and where it lives (endpoint, package, file)
- Steps to reproduce (a curl transcript or minimal script is ideal)
- The impact you believe it has

You will get an acknowledgement within 72 hours. Please give us a reasonable
window to ship a fix before any public disclosure.

## Scope

- The code in this repository (API, workers, CLI, SDKs, MCP server, web app)
- The hosted service at `api.agent-media.ai` — **read-only testing only**;
  never run tests that spend credits, access other users' data, or degrade
  service for others.

## Out of scope

- Denial-of-service / volumetric attacks against the hosted service
- Social engineering, phishing, or attacks on third-party providers
- Findings that require a compromised user device

## Hardening notes for self-hosters

- All config is injected at runtime — never commit `.env` files or keys.
- The Supabase `service_role` key bypasses Row Level Security. Treat it as a
  root credential: server-side only, never in client bundles or git.
- `ma_` API keys are stored hashed (SHA-256) and can be revoked by flipping
  `is_active` in the `api_keys` table.
