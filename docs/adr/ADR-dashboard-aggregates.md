# ADR: Aggregated data pipeline for dashboard invoices

## Context

The dashboard currently loads data via `fetchDashboardData` by issuing three wide `select *` queries against Supabase (`current`, `previous range`, `previous year`). Each query pulls invoice rows plus nested customers, then TypeScript recomputes monthly comparisons and status breakdowns in memory (`O(n·m)`). With wide date ranges Supabase hits timeouts (HTTP 522) because it attempts to stream thousands of rows, even though the UI only needs:

1. Monthly counts for the selected range vs. the same months in the previous year.
2. Status counts grouped into `Pending / Processed / Success`.
3. The latest 20 invoices for the table.

Instrumentation on the existing code (12‑month range, 7 rows in DB) already showed ~1.5 s per Supabase call, 2–3 KB payloads each, and redundant post-processing on the server.

## Options evaluated

| Option | Summary | Pros | Cons | Effort | RLS impact | Maintenance |
| --- | --- | --- | --- | --- | --- | --- |
| **A. SQL aggregate RPC** | Move counts into a dedicated Postgres function returning structured aggregates + limit table query. | One roundtrip, server-side aggregation, easier to tune with indexes, keeps contracts stable. | Requires migration & coordination; RPC must be deployed before code. | Medium (SQL + refactor) | Runs as service role, compatible with existing RLS | Clear single function to evolve; SQL lives with migrations |
| **B. Materialized view** | Precompute monthly / status summaries in a refreshable MV. | Fast reads, predictable payload. | Needs refresh workflow (cron/n8n); stale data risk; overkill for current volume. | High | RLS bypass via service role ok, but extra policies needed for other roles. | Extra ops surface (refresh cadence, invalidation) |
| **C. PostgREST grouped selects** | Use `select=..., count` / `group` queries with tight ranges, no SQL function. | No migration; leverages APIs we already use. | Hard to replicate customer search across multiple queries; increases roundtrips (per month & per status); more brittle string-based queries. | Medium | Works with existing RLS | Harder to extend; duplicated query strings |
| **D. Server cache** | Cache aggregated response per range/user at edge/server. | Shields Supabase from spikes; works regardless of storage. | Adds invalidation complexity; dashboard wants fresh data after uploads; still need efficient first fetch. | Medium/High | Cache layer must respect auth. | Another subsystem to operate |
| **E. New indexes** | Add `created_at` / `(status, created_at)` indexes to back range scans. | Improves any approach that filters by created_at or status. | Write overhead, but negligible. | Low | No change | Minimal upkeep |

## Decision

Adopt **Option A (SQL aggregate RPC)** combined with **Option E (range indexes)**.

* The RPC (`core.dashboard_invoice_aggregates`) encapsulates all month/status math in one call, ensuring we never download whole invoices just to count them. It also centralises the search filter so components keep their current contracts.
* Complementary indexes on `created_at` and `(status, created_at DESC)` stabilise range scans for both the aggregate function and the limited latest invoices query.
* Option C was considered as a fallback but was discarded because reproducing the customer search logic across multiple grouped PostgREST calls would either duplicate code or reintroduce wide selects. Materialized views (Option B) are premature for ~7 rows and introduce refresh complexity.
* A cache (Option D) remains a future enhancement if dashboard access volume increases, but it does not solve the root issue of the initial heavy query.

## Consequences

* Deployment order matters: apply `supabase/migrations/20241019_dashboard_aggregates.sql` before shipping the refactor so the RPC exists when Next.js calls it.
* Dashboard latency expectations: instrumentation targets `<150 ms` end-to-end on wide ranges once the RPC is in place (vs. ~1.5 s per wide query previously). The payload shrinks to a single JSON aggregate (~<1 KB) plus the 20-row table (~2–3 KB at current data volumes).
* Future improvements: if invoice volume grows beyond ~100k, consider refreshing aggregates into a materialized view or adding trigram indexes for the customer search. Those are left as TODOs.
