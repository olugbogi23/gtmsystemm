# Supabase Schema Changelog

This document records every schema change in chronological order — what changed, why, and what it enables. Useful for understanding the evolution of the system without reading all migration files.

---

## Migration 0001 — grant_service_role (Stage 1)

**File:** `0001_grant_service_role.sql`

**What changed:** Granted `service_role` the ability to read, insert, update, and delete on all tables. This is the one-time permissions grant that lets application code access the database.

**Why:** Supabase by default restricts the service_role key to tables it has explicit grants for. This migration ensures the service_role can access everything.

**Tables affected:** All tables (blanket grant)

---

## Migration 0002 — icp_onboarding (Stage 1)

**File:** `0002_icp_onboarding.sql`

**What changed:**
- Dropped the old `icp_onboarding` table (previous version used `business_slug` text key instead of FK)
- Created `clients` table (one row per company being served)
- Created `icp_onboarding` table (12 Q&A rows per client, linked by FK)
- Seeded Gramscode as the first client

**Why:** The old schema used text slugs to link data. The new schema uses proper UUID foreign keys, enabling proper cascade deletes and relational integrity.

**New tables:** `clients`, `icp_onboarding`

**Key design decisions:**
- `clients.slug` is unique (lookup key throughout the codebase)
- `icp_onboarding` has `UNIQUE(client_id, question_key)` — answers can be upserted
- 12 fixed onboarding questions seeded for Gramscode

---

## Migration 0003 — lead_magnets (Stage 2)

**File:** `0003_lead_magnets.sql`

**What changed:** Created `lead_magnets` table — stores brainstormed lead magnet ideas per client.

**Why:** The `/lead-magnet-brainstorm` skill needed a place to store and compare its output. Previously results were only in markdown files.

**New tables:** `lead_magnets`

**Key design decisions:**
- `archetype_key` maps to 10 fixed archetypes (free_audit, data_report, etc.)
- `rank` 1-3 marks the top picks
- `status` (draft → selected → rejected) tracks which magnet was chosen
- Only ONE selected per client (enforced by `selectLeadMagnet()` helper)

---

## Migration 0004 — campaign_stages (Stage 3)

**File:** `0004_campaign_stages.sql`

**What changed:** Created `campaign_strategies` and `campaign_plans` tables.

**Why:** After onboarding and lead magnet, the campaign strategy brainstorm and kickoff plan needed persistent storage. Previously these lived only in profiles/ markdown files.

**New tables:** `campaign_strategies`, `campaign_plans`

**Key design decisions:**
- `campaign_strategies`: 15-25 ideas per client; `rank` + `status` used for approval
- `is_no_ai` and `is_front_end_offer` flags encode campaign type classification
- `campaign_plans`: one active draft per client at a time (enforced by `upsertCampaignPlan()`)
- `infrastructure_status` jsonb stores warmup/setup progress

---

## Migration 0005 — copy_and_quality (Stage 4-5)

**File:** `0005_copy_and_quality.sql`

**What changed:** Created `email_sequences`, `email_sequence_steps`, and `list_quality_scores` tables.

**Why:** Campaign copywriting output needed storage. List quality scorecard needed storage.

**New tables:** `email_sequences`, `email_sequence_steps`, `list_quality_scores`

**Key design decisions:**
- `email_sequences` parent / `email_sequence_steps` child relationship (1:many)
- `UNIQUE(sequence_id, step)` prevents duplicate step numbers
- `variants` jsonb stores A/B email copy (label, subject, body per variant)
- `list_quality_scores`: 8 scoring dimensions + overall grade + `pre_send_checklist` jsonb

---

## Migration 0006 — workflow_gaps (Stage 4)

**File:** `0006_workflow_gaps.sql`

**What changed:**
- Added `value_prop_type` column to `email_sequences`
- Added `script_framework`, `has_personalization`, `spintax_body` columns to `email_sequence_steps`
- Added `clay_imported_at`, `clay_table_url`, `enrichment_status` columns to `lists`
- Created `campaign_reviews` table

**Why:** Gap analysis between the schema and the Campaign Creation Workflow PDF revealed missing fields. The `campaign_reviews` table was needed to track client sign-off before launch.

**New tables:** `campaign_reviews`

**New columns:**
- `email_sequences.value_prop_type` — which of the 4 value prop types is being tested
- `email_sequence_steps.script_framework` — writing framework used (case_study, pain_point, etc.)
- `email_sequence_steps.has_personalization` — whether AI variables are used in this step
- `email_sequence_steps.spintax_body` — Smartlead-ready spintax version of the body
- `lists.clay_imported_at` — timestamp of Clay import
- `lists.enrichment_status` — pipeline stage: pending → clay_imported → enriched → verified → ready

---

## Migration 0007 — ai_cost_tracking (Stage 5)

**File:** `0007_ai_cost_tracking.sql`

**What changed:** Added `input_tokens`, `output_tokens`, and `client_id` columns to `enrichment_runs`.

**Why:** Stage 5 added the pricing engine. Without token counts and client attribution, there's no way to track AI spend per client.

**New columns on `enrichment_runs`:**
- `input_tokens` — prompt token count from provider usage object
- `output_tokens` — completion token count
- `client_id` — FK to clients; enables per-client cost roll-up

---

## Migration 0008 — ai_observability (Stage 5)

**File:** `0008_ai_observability.sql`

**What changed:** Added full observability columns to `enrichment_runs` — gateway, task_type, latency, cost, errors, cache, and escalation chain FK.

**Why:** The escalation system (try cheap model first, escalate if low confidence) needed columns to record the chain of attempts. Operational monitoring needed latency and cost data.

**New columns on `enrichment_runs`:**
- `gateway` — which API gateway was used (anthropic-direct or openrouter)
- `task_type` — what type of AI work this was (icp_qualification, personalization, etc.)
- `latency_ms` — wall-clock response time
- `cost_usd` — computed dollar cost for this call
- `error_message` — failure reason (null on success)
- `cache_hit` — reserved for future caching (always null now)
- `escalated_from_run_id` — self-referential FK to the cheaper attempt this escalated from

---

## Migration 0009 — operation_identity (Stage 10)

**File:** `0009_operation_identity.sql`

**What changed:**
- Added `idempotency_key` column to `jobs`
- Added partial unique index on `jobs` for (job_type, idempotency_key)
- Added `job_id` column to `enrichment_runs` (FK to jobs)
- Added `attempt_number` column to `enrichment_runs`
- Added partial unique index on `enrichment_runs` for (company_id, job_id, task_type, attempt_number)

**Why:** Stage 10 introduced the `claimJob()` pattern — atomic find-or-create for background jobs. Without an idempotency key, concurrent Trigger.dev invocations could create duplicate jobs for the same operation.

**New columns:**
- `jobs.idempotency_key` — stable identifier for dedup
- `enrichment_runs.job_id` — links AI calls back to the background job
- `enrichment_runs.attempt_number` — 0-based index in escalation chain

---

## Migration 0010 — escalated_status (Stage 10)

**File:** `0010_escalated_status.sql`

**What changed:** Added `escalated` to the `enrichment_runs.status` check constraint.

**Why:** The escalation system needs to mark a run as `escalated` (tried but confidence too low; a more expensive model will retry). The existing constraint only allowed `pending | running | completed | failed`.

**Changed constraint on `enrichment_runs`:**
```
status IN ('pending', 'running', 'completed', 'failed', 'escalated')
```

---

## Migration 0011 — signals (Stage 10/11)

**File:** `0011_signals.sql`

**What changed:** Created the `signals` table — the core table of the GTM Signal Engine.

**Why:** Stage 10 built the signal ingestion infrastructure. Signals represent buying intent events (job postings, funding rounds, executive hires, etc.) that indicate why to contact a company now, not next quarter.

**New tables:** `signals`

**Key design decisions:**
- `(client_id, company_id)` scoping for full tenant isolation
- 3-tier dedup system via `dedup_key` column + partial unique index
- `signal_strength` (0-100) is type-based, stored at ingestion; freshness score is computed at query time
- `confidence` (0.0-1.0) reflects how certain the event categorization is
- `occurred_at` vs `detected_at` vs `expires_at` — three distinct timestamps for different purposes
- TTLs vary by signal type: job_posting=14d, funding_round=90d, executive_hire=30d
- **Note:** RLS not explicitly enabled in this migration (see 25-SUPABASE-SECURITY.md FINDING 1)

---

## Migration 0012 — account_intelligence (Stage 12)

**File:** `0012_account_intelligence.sql`

**What changed:** Created the `account_intelligence` table — the derived-intelligence layer that stores one scored row per (client, company) pair.

**Why:** Signals are raw events. `account_intelligence` is the answer to "how good is this account right now?" — a single score that summarizes all active signals for a company under a given client. Without it, every query that needed to rank accounts would have to re-aggregate all signals from scratch.

**New table:** `account_intelligence`

**Key design decisions:**
- One row per `(client_id, company_id)` — enforced by named UNIQUE constraint `account_intelligence_client_company_key`
- `opportunity_score INTEGER NOT NULL` — range 0–100; enforced by CHECK constraint
- `score_inputs JSONB` — full breakdown (signal list, weights applied) for auditability
- `opportunity_score_updated_at` — when the score was last computed (not a recency guarantee)
- Two targeted indexes: `client_id + opportunity_score DESC` for "top accounts" queries; staleness index for "accounts due for rescore"
- RLS enabled but no policies defined (blocked pending auth/tenant-mapping design — see `25-SUPABASE-SECURITY.md`)
- Both FKs (`client_id`, `company_id`) have `ON DELETE CASCADE`

---

## Migration 0013 — account_priority (Stage 14)

**File:** `0013_account_priority.sql`

**What changed:** Added two columns to `account_intelligence` and one index:
- `priority_score NUMERIC NULL` — time-decayed score answering "which accounts should we act on *today*?"
- `prioritized_at TIMESTAMPTZ NULL` — when the priority_score was last calculated
- Index `account_intelligence_priority_idx` — `(client_id, priority_score DESC NULLS LAST) WHERE priority_score IS NOT NULL`

**Why:** `opportunity_score` is time-invariant within a signal's TTL — it tells you how good a fit this account is, not how urgent it is to contact today. As signals age, their urgency decays. `priority_score` applies exponential half-life decay to `opportunity_score` so that accounts with fresh signals rank above accounts with old ones. Without this column, every "who to contact today" query would have to join against `signals.detected_at` and compute decay inline.

**Conceptual distinction:**
```
Raw signal data (signals table)
  ↓ normalizeBatch + upsertSignal + rescoreCompany
opportunity_score (account_intelligence)          ← Stage 12/13, time-invariant
  = ICP fit × signal quality
  ↓ × recency_multiplier = 2^(−days/14)
priority_score (account_intelligence)             ← Stage 14, decays daily
  = "how actionable is this account RIGHT NOW?"
```

**Key design decisions:**
- `priority_score` is NULLABLE — `NULL` means "never prioritized", not zero
- `priority_score = 0` means "prioritized, but no active signals exist"
- `prioritized_at` is the calculation timestamp, NOT a freshness guarantee
- `PRIORITY_RECENCY_HALF_LIFE_DAYS = 14` is `INITIAL_HYPOTHESIS_NOT_VALIDATED` — a named constant, not a hardcoded assumption
- Rank is never stored — it is computed at query time from `ORDER BY priority_score DESC`
- Priority score must be recomputed daily because it changes even when no new signals arrive

**New columns on `account_intelligence`:**
- `priority_score NUMERIC NULL`
- `prioritized_at TIMESTAMPTZ NULL`

---

## Migration 0014 — campaign_operations_foundation (Stage 15)

**File:** `0014_campaign_operations_foundation.sql`

**What changed:**

1. **`campaigns` — three new columns:**
   - `client_id uuid NOT NULL` FK → `clients(id)` ON DELETE CASCADE — tenant isolation, previously missing
   - `campaign_strategy_id uuid NULL` FK → `campaign_strategies(id)` ON DELETE SET NULL — intelligence layer link
   - `list_id uuid NULL` FK → `lists(id)` ON DELETE SET NULL — source contact pool

2. **`campaigns` — UNIQUE(client_id, id)** — required by PostgreSQL as the target of the composite FK from `campaign_leads`; logically redundant with the PK but necessary for composite FK syntax

3. **`campaigns` — trigger `check_campaign_strategy_client()`** BEFORE INSERT OR UPDATE — verifies that when `campaign_strategy_id` is non-null, it belongs to the same client as the campaign. Uses a trigger (not a composite FK) because `ON DELETE SET NULL` on a composite FK would null both columns — including `client_id` which must remain NOT NULL.

4. **`campaign_leads` — `client_id uuid NOT NULL`** FK → `clients(id)` ON DELETE CASCADE

5. **`campaign_leads` — composite FK `(client_id, campaign_id)` → `campaigns(client_id, id)`** ON DELETE CASCADE — prevents campaign_leads.client_id from differing from its campaign's client_id at the database level. Coexists with the existing simple FK `campaign_id → campaigns(id)`.

6. **`contact_suppression` — new table.** Per-client contact suppression records. Active when `expires_at IS NULL` (permanent) or `expires_at > now()` (timed). Expired records (`expires_at <= now()`) are historical only and do NOT block eligibility. RLS enabled; no policies defined yet; service_role bypasses RLS. Partial unique index prevents duplicate permanent suppressions per (client, contact).

**Why:** Campaigns previously had no `client_id` column — any campaign could be read without client scoping (FINDING 4 in 25-SUPABASE-SECURITY.md). Stage 15 closes this gap and adds the contact suppression safety gate needed before campaign enrollment logic is built.

**Tables affected:** `campaigns` (3 new columns + unique constraint + trigger + 3 indexes), `campaign_leads` (1 new column + 1 new FK + 2 indexes), `contact_suppression` (new table with RLS + 3 indexes)

**Migration idempotency:** All column additions use `IF NOT EXISTS`. The two named constraints use DO blocks with `pg_constraint` existence checks. Trigger uses `CREATE OR REPLACE FUNCTION` + `DROP TRIGGER IF EXISTS`. Table creation uses `CREATE TABLE IF NOT EXISTS`. Safe to re-run.

**Key design decisions:**
- `platform` DEFAULT 'plusvibe' confirmed from live schema — do not hardcode 'smartlead'
- `campaign_leads.status` DEFAULT 'ready' confirmed from live schema — NOT 'queued' (prior documentation was wrong)
- `lists` intentionally left without `client_id` — lists are shared infrastructure; client ownership lives on `campaigns`
- `contacts` confirmed to have NO `list_id` column — contacts link to lists via `list_members` only (prior documentation was wrong)
- Future global DNC override will be a SEPARATE table — no schema change to `contact_suppression` needed

---

## Migration 0015 — signals_rls (Stage 16)

**File:** `0015_signals_rls.sql`

**What changed:** Enabled Row Level Security on the `signals` table.

**Why:** Supabase flagged `signals` as a critical security issue — it was the ONLY table with `rowsecurity=false`. All 20 other tables have RLS enabled. This migration closes the gap so that all 21 tables share the same baseline protection.

**Tables affected:** `signals` (no schema change, only security posture change)

**Key design decisions:**
- No policies added — service_role bypasses RLS unconditionally; all existing queries work unchanged
- The anon/publishable key now correctly cannot access signals without an explicit policy
- Future policy: once authenticated user flows are added, a `USING (client_id = auth.jwt()->'app_metadata'->>'client_id')` policy should be added for tenant isolation
- This migration is idempotent — re-running it on a table where RLS is already enabled is a no-op in PostgreSQL

---

## Tables Created Outside Migrations

The following tables appear to exist in the live database but have no migration files in this repository. They were likely created via the Supabase Dashboard.

| Table | Evidence | Notes |
|-------|----------|-------|
| `campaigns` | Referenced by `campaign_reviews.campaign_id` FK and `jobs.campaign_id` FK | Smartlead campaign records |
| `campaign_leads` | Referenced in campaign workflow documentation | Contacts enrolled in campaigns |
| `email_verifications` | Referenced in migration 0006 comments | Email verification results |
| `contacts` | `src/db/companies.ts` references it; no migration file | Contact records from Prospeo |
| `companies` | `src/db/companies.ts`; no migration file | Target company records |
| `lists` | `src/db/companies.ts`; altered in migration 0006 | List metadata |
| `list_members` | `src/db/companies.ts`; no migration file | List→company/contact junction |

These tables are documented in the individual table files (04-COMPANIES.md through 08-LIST-MEMBERS.md) based on TypeScript interface inspection.

---

## Schema Evolution Summary

| Migration | Key Addition | Enables |
|-----------|-------------|---------|
| 0001 | Service role grants | Database access |
| 0002 | clients + icp_onboarding | Multi-client onboarding |
| 0003 | lead_magnets | Lead magnet brainstorm storage |
| 0004 | campaign_strategies + campaign_plans | Campaign planning storage |
| 0005 | email_sequences + steps + scores | Copywriting + list scoring |
| 0006 | campaign_reviews + extra columns | Client review workflow |
| 0007 | AI cost tracking columns | Per-client AI spend tracking |
| 0008 | AI observability + escalation chain | Multi-tier AI with monitoring |
| 0009 | Idempotency keys + job linkage | Atomic job claiming + resume |
| 0010 | escalated status | Explicit escalation state |
| 0011 | signals | GTM Signal Engine |
| 0012 | account_intelligence | Opportunity score per (client, company) |
| 0013 | priority_score + prioritized_at on account_intelligence | Time-decayed account prioritization |
| 0014 | campaigns.client_id + composite FK + contact_suppression | Campaign tenant isolation + suppression gate |
| 0015 | signals RLS enabled | Baseline protection aligned with all other tables |
