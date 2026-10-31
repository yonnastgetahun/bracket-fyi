# P10 draft template seeder

`seedEventTemplates(repository)` walks the nine canonical definitions in `lib/events/catalog.ts` and ensures a stable template row keyed by the edition key, then inserts version 1 into `event_template_configs`. This is deliberately an injected repository seam: `ensureTemplate(key,label)`, `listConfigs(templateId)`, and insert-only `insertConfig(config)`. The returned result identifies each key, template row, version, and whether it was inserted or already present.

The manifest is the catalog definition itself. It carries draft availability, manual mode, and unavailable automation; it contains no real future entrants or dates. Each inserted config is unsealed. Exact replay is idempotent. Drift, a sealed version, or a different-version collision fails closed; no existing config is updated or deleted. If insert acknowledgement is lost, exact read-back permits safe retry. The repository adapter must preserve the unique `(template_id, version)` constraint and must not implement `insertConfig` as upsert.

The migration makes config identity `(template_id, version)` and rejects update/delete of sealed configs. Config writes are service-role-only; callers must therefore place the adapter behind the existing trusted server boundary. This module performs no activation, database connection, provider request, or public exposure.

## Next integration step

Implement an explicitly invoked server-only adapter that resolves existing `templates` rows by the stable catalog key, inserts draft template rows as needed, and uses insert/read-back semantics for `event_template_configs`. Invoke it only from a controlled local/admin bootstrap path; keep publication and sealing as separate reviewed operations. Integration acceptance still needs adapter/database tests and the broader P10/P11 journey evidence; this packet is not full product acceptance.
