# Retained browser evidence preservation
project: BRACKET-FYI; approved Phase 2; documentation-only
Done when:
- [x] Successful full-window, legacy, recovery and PWA results retained in a sanitized durable bundle.
- [x] Bundle checked against originals; historical execution distinguished from final candidate proof.
Evidence: [durable bundle](browser-acceptance-retained-evidence.json), with original relative paths and SHA-256s.

Inspected retained original results and allowlisted output fields. Full-window assertions: distinct covered markets equal expected counts, window counts equal expected counts, and both statuses passed. UCL: 211 scored markets/13 windows. WWC: 64/7. Legacy: 15 checkpoints. Own recovery: 16. PWA: 5. All four original hashes rechecked after bundle write; JSON readback equals projected data. No raw logs, cookies, fixture credentials, screenshots or private downloaded attachments copied.

No runtime rerun or final-candidate source identity is implied. Historical full-window interim maxima explicitly remain unverified; this is not the missing 12-checkpoint numeric proof. PWA is desktop Chromium coverage, not physical-device acceptance. Legacy notification checks use fake transport.

changed: sanitized durable historical browser results and provenance.
matters: acceptance artifacts no longer exist only under ignored tmp paths.
checks: four original SHA-256s, report pass states, full-window unique market/window counts, exact JSON roundtrip.
risk: historical runs are not a final-head rerun or source fingerprint certificate.
verdict: accept evidence preservation only.
