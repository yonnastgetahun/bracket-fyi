# Parent recovery and integration — 2026-10-28
project: BRACKET-FYI
done when:
- [ ] Local HTTP uses non-owner PostgREST, loopback preview and fake-only transport; nine HTTP and browser journeys pass.
- [ ] NO01/NO02 repair passes deterministic serialized acceptance and independent review.
- [ ] PF-R1/R2/R3 populated transition proof passes through final migration and double forward repair.
evidence: retained disposable database logs, HTTP/browser artifacts, repair and transition reports.

Baseline recovered: clear-cloud database bracket_regression_58f727cc3259 through00010: all36 SQL files,1123 assertions pass. Current unit snapshot980pass12skip predates new repairs. Four independent reviews collected; NO01/NO02 supported by three skeptics; fixture review preserves assertions but identifies PF-R1/R2/R3 proof gaps. No full-scope acceptance.

Ownership: parent sole DB execution owner. Security builder f0fcf7e4 owns new00011 migration/repair and focused regression; transition builder3f5aef90 owns transition harness/fixtures. Both prohibited from DB/Docker calls. Original HTTP worker04c0d114 cancelled while paused because sessions_send unavailable; parent assumes its saved launcher and recovery work without duplicate worker. No shared DB restart/reset, real sends, deployment, merge or purchases.
