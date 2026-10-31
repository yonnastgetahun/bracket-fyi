# W2-A prediction-window persistence packet
Owner: integration owner. Requirements P1/P2/P7/P11, E1/E5; independent of typed-outcome migration content.

- Write boundary: migration `20261027000002_prediction_windows.sql`, forward-repair document/SQL, DB test28, new event repository module. Do not modify legacy read/auth/UI files while P1 builder owns them.
- Add protected template format configuration and league window/state rows; keep legacy tables/read semantics unchanged. New-format writes exclusively scoped RPCs.
- Submission authorizes exact league+participant token before private selection; locks league then window; database UTC cutoff governs, no browser clock. Complete eligible per-window picks and graph/config version required; atomic no partial writes on conflict.
- First cutoff prevents join; later windows do not reopen prior picks. Missing schedule/pairings keeps window unopened; new participants after first cutoff rejected. Freeze blocks only submissions, not result corrections.
- Reads reveal only locked-window picks unless credential matches submitter. Safe allowlisted fields only; no bearer values.
- Existing picks IDs retained; new rows use immutable logical market IDs. No format conversion/backfill in this packet. Window/scoring basis changes increment durable reconciliation generation; worker integration later cannot claim complete until evaluated basis matches.
- Done when pgTAP positive/negative cutoff, version, tenant, freeze, missing-schedule and privacy scenarios pass against local disposable DB; independent review pending before acceptance.
- Compatibility: new formats explicitly unsupported by legacy reader gate until typed app integration; no new-format public activation.
