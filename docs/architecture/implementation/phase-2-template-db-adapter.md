# Phase 2 template database adapter

## Contract and binary acceptance criteria (written before implementation)

Implement a bounded `TemplateSeedRepository` backed by an injected Supabase-compatible client. No environment lookup, client construction, network setup, catalog/seeder/schema changes, activation, or publication.

- `ensureTemplate(key,label)` derives a valid deterministic UUID from a fixed namespace and exact catalog key; queries only that ID. It must not locate/reuse rows by matching names. It inserts only explicitly allowlisted template columns (`id`, `name`, `type`, `topology`, `team_registry`, `schedule`, `scoring_defaults`, `results_provider`) with null/default-safe draft values and type `pickem` only for nomination catalogs, otherwise `bracket`.
- Existing row is accepted only when exact deterministic ID, name and type agree with request and expected seed values; any collision/drift fails closed. Insert errors trigger exact-ID read-back to recover lost acknowledgement; unrelated errors are safely propagated when read-back proves no accepted row.
- Config list returns every version for the template with complete identity, seal state and manifest. Config insertion is plain insert, never upsert, and writes only template_id/version/sealed/manifest with version 1 and unsealed catalog manifest supplied by seeder.
- Focused tests use fake injected transport/client only and cover deterministic UUID, lookup/create, rejection of name-only matches and ID drift, config version preservation, conflicts, and network/lost-ack behavior.
- Deliverables are limited to this adapter, focused tests, and this document. No real DB/network/env access or commit. This packet is an adapter implementation only; it does not claim full P10 completion.
