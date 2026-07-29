# Copyright 2026 agent-media contributors. Apache-2.0 license.
#
# Makefile - Development convenience targets for agent-media.
#
# Usage:
#   make dev       Start Supabase local + web dev server + CLI watch
#   make test      Run all tests (build + pgTAP + unit)
#   make migrate   Apply Supabase SQL migrations to local database
#   make seed      Run seed.sql to populate models and pricing data
#   make build     Build all packages and apps via Turborepo
#   make lint      Lint all packages and apps
#   make typecheck Run TypeScript type checking across the monorepo
#   make clean     Remove all build artifacts
#   make reset-db  Reset the local Supabase database and re-apply migrations
#   make stripe-listen  Forward Stripe webhooks to local Edge Function
#   make test-billing   Run billing pgTAP tests
#   make test-webhook   Run webhook lifecycle pgTAP tests
#   make webhook-dev    Serve webhook-provider Edge Function locally

.PHONY: dev test migrate seed build lint typecheck clean reset-db \
        dev-supabase dev-web dev-cli stop stripe-listen test-billing \
        test-generation generate-dev test-webhook webhook-dev

# ── Configuration ──────────────────────────────────────────────────────────

SHELL := /bin/bash
PNPM := pnpm
SUPABASE := npx supabase

# ── Development ────────────────────────────────────────────────────────────

## Start all development services (Supabase + web + CLI watch)
dev:
	@echo "Starting agent-media development environment..."
	@$(MAKE) dev-supabase &
	@sleep 5
	@$(MAKE) dev-web &
	@$(MAKE) dev-cli &
	@echo "All services started. Press Ctrl+C to stop."
	@wait

## Start Supabase local development stack
dev-supabase:
	@echo "Starting Supabase local..."
	$(SUPABASE) start

## Start Next.js web development server
dev-web:
	@echo "Starting web dev server..."
	cd apps/web && $(PNPM) dev

## Start CLI in watch mode (rebuild on source changes)
dev-cli:
	@echo "Starting CLI watch..."
	cd apps/cli && $(PNPM) run build --watch 2>/dev/null || $(PNPM) run build

## Stop all Supabase services
stop:
	@echo "Stopping Supabase..."
	$(SUPABASE) stop

# ── Testing ────────────────────────────────────────────────────────────────

## Run all tests: build first, then run test suites
test:
	@echo "Running all tests..."
	$(PNPM) build
	$(PNPM) test
	@echo ""
	@echo "To run pgTAP tests, ensure Supabase is running:"
	@echo "  make migrate"
	@echo "  pg_prove -d postgresql://postgres:postgres@localhost:54322/postgres supabase/tests/*.sql"

## Run billing pgTAP tests (requires Supabase running with migrations applied)
test-billing:
	@echo "Running billing pgTAP tests..."
	pg_prove -d "postgresql://postgres:postgres@localhost:54322/postgres" supabase/tests/billing_test.sql

## Run generation pgTAP tests (requires Supabase running with migrations applied)
test-generation:
	@echo "Running generation pgTAP tests..."
	pg_prove -d "postgresql://postgres:postgres@localhost:54322/postgres" supabase/tests/generation_test.sql

## Run webhook lifecycle pgTAP tests (requires Supabase running with migrations applied)
test-webhook:
	@echo "Running webhook lifecycle pgTAP tests..."
	pg_prove -d "postgresql://postgres:postgres@localhost:54322/postgres" supabase/tests/webhook_lifecycle_test.sql

# ── Stripe ────────────────────────────────────────────────────────────────

## Forward Stripe webhooks to the local Supabase Edge Function
stripe-listen:
	@echo "Forwarding Stripe webhooks to local Edge Function..."
	@echo "Make sure Supabase is running (make dev-supabase)"
	stripe listen --forward-to http://localhost:54321/functions/v1/webhook-stripe

# ── Generation Dev ─────────────────────────────────────────────────────────

## Serve Edge Functions locally and watch for changes (generate + upload-url)
generate-dev:
	@echo "Starting Edge Functions dev server (generate + upload-url)..."
	@echo "Make sure Supabase is running (make dev-supabase)"
	$(SUPABASE) functions serve --env-file supabase/.env.local

# ── Webhook Dev ───────────────────────────────────────────────────────────

## Serve webhook-provider Edge Function locally
webhook-dev:
	@echo "Starting webhook-provider Edge Function dev server..."
	@echo "Make sure Supabase is running (make dev-supabase)"
	$(SUPABASE) functions serve webhook-provider --env-file supabase/.env.local

# ── Database ───────────────────────────────────────────────────────────────

## Apply all Supabase SQL migrations to the local database
migrate:
	@echo "Applying migrations..."
	$(SUPABASE) db push
	@echo "Migrations applied successfully."

## Run seed.sql to insert development data (models, pricing)
seed:
	@echo "Seeding database..."
	$(SUPABASE) db reset --seed-only 2>/dev/null || \
		psql "postgresql://postgres:postgres@localhost:54322/postgres" -f supabase/seed.sql
	@echo "Seed data applied."

## Full database reset: wipe, re-apply migrations, and seed
reset-db:
	@echo "Resetting database..."
	$(SUPABASE) db reset
	@echo "Database reset complete."

# ── Build ──────────────────────────────────────────────────────────────────

## Build all packages and apps via Turborepo
build:
	$(PNPM) build

## Run ESLint across all packages
lint:
	$(PNPM) lint

## Run TypeScript type-checking across the monorepo
typecheck:
	$(PNPM) typecheck

## Remove all build artifacts (dist/, .next/, .turbo/)
clean:
	@echo "Cleaning build artifacts..."
	rm -rf apps/cli/dist
	rm -rf apps/web/.next
	rm -rf apps/docs/.next
	rm -rf packages/types/dist
	rm -rf packages/providers/dist
	rm -rf packages/ui/dist
	rm -rf .turbo
	rm -rf apps/*/.turbo
	rm -rf packages/*/.turbo
	@echo "Clean complete."
