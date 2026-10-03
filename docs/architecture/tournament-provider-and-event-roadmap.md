# Tournament Provider and Event Roadmap

**Research date:** 2026-10-02
**Status:** Sequence approved at G0 on 2026-10-03 — provider access, terms, spend, and event-specific launch remain gated
**Research method:** Current primary-source documentation and official event calendars; prior terminal research and BoyzWC2026 were used as historical evidence. No live provider endpoint was called during this phase.

## Recommendation summary

- Use football-data.org for the first adapter and UEFA Champions League 2026/27 shadow/beta, subject to current account/coverage verification.
- Use BALLDONTLIE NFL as the likely second adapter to prove the seam outside soccer, subject to a read-only provider check and terms approval.
- Treat BALLDONTLIE as the leading documented candidate for MLB, NFL, NBA, and college sports at different paid tiers; do not assume one sport's data quality from another.
- Keep TheSportsDB as a low-cost secondary sports candidate, but its terms require a paid subscription for a published app.
- Treat SportsDataIO as an enterprise-quality candidate that is blocked on a commercial agreement for production use; its trial data is not valid beta evidence.
- Treat Oscarbase as a promising Oscars adapter candidate, with Academy sources as manual truth, but block live reliance until licensing, continuity, and update-timing questions are answered.
- Do not use undocumented ESPN endpoints in production without explicit owner/legal risk acceptance.
- Resolve whether “Oscars 2026” is a historical replay or whether the upcoming live target is the 99th Oscars in 2027.

## Status and confidence definitions

| Label | Meaning |
|---|---|
| Ready for adapter work | Documentation and architecture fit are sufficient for local implementation; live use still requires G2 |
| Candidate | Plausible provider; real coverage/quality/terms need verification |
| Blocked | A known licensing, access, pricing, or scope decision prevents implementation/launch |
| High confidence | Primary documentation plus prior real implementation evidence |
| Medium confidence | Primary documentation is clear but no current real-payload verification |
| Low confidence | Terms, coverage, continuity, or unofficial access remain material unknowns |

Provider readiness is not event readiness. Every event needs edition-specific IDs, schedule, mappings, fixtures, manual fallback, beta, and acceptance.

## Provider evidence and constraints

| Provider | Documented coverage/use | Documented rate/tier notes | Licensing/operational constraints | Confidence/readiness |
|---|---|---|---|---|
| [football-data.org](https://www.football-data.org/coverage) | Soccer competitions include UEFA Champions League; Women's World Cup appears in the broader competition list, but exact current-edition availability/tier requires account verification | [API policy](https://docs.football-data.org/general/v4/policies.html): registered free clients 10 requests/minute; Standard 30; higher plans 60 | [Terms](https://www.football-data.org/about) require visible attribution and credential protection; availability/accuracy are not guaranteed; data rights after cancellation constrain continued reference | High for adapter pattern because BoyzWC2026 used it; medium until each 2026/27 or 2027 competition is verified |
| [BALLDONTLIE](https://www.balldontlie.io/account/) | NBA, NFL, MLB, EPL on entry offering; separate NCAAF/NCAAB products and tiered endpoints | Account page: free 5 requests/minute; All-Star $9.99/month at 60; GOAT $39.99/month at 600; all-access offering listed at $299.99/month as researched | [Terms](https://www.balldontlie.io/terms.html) allow personal/commercial use and redistribution subject to restrictions, disclaim official affiliation/warranty, and can change; exact caching/branding interpretation requires approval | Medium: strong current docs, no Bracket.fyi live-payload test |
| [BALLDONTLIE NBA](https://docs.balldontlie.io/) | Games, postseason/status filtering, teams; suitable inputs for deriving playoff series | Shares account-wide tier/rate budget; game availability is documented on entry tier | Series/bracket is a Bracket.fyi derivation unless an approved endpoint provides it | Medium; leading NBA candidate |
| [BALLDONTLIE NFL](https://nfl.balldontlie.io/) | NFL games and teams; entry documentation lists game access | Free budget is 5 requests/minute; higher shared tiers available | Verify postseason season labeling, overtime statuses, and schedule corrections with real evidence | Medium; recommended second adapter candidate |
| [BALLDONTLIE MLB](https://mlb.balldontlie.io/) | MLB games with postseason-related filters and real-time-oriented documentation | Free account budget is 5 requests/minute; higher tiers available | Bracket/series aggregation and postponed/doubleheader behavior require local modeling and live verification | Medium; leading MLB candidate |
| [BALLDONTLIE NCAAF](https://ncaaf.balldontlie.io/) | College football games | Games require at least All-Star ($9.99/month as researched) | School aliases, neutral sites, bowls/CFP selection, and edition structure must be supplied/verified | Medium-low pending paid approval |
| [BALLDONTLIE NCAAB](https://ncaab.balldontlie.io/) | College basketball games; dedicated March Madness bracket endpoint is documented at GOAT tier | Games require All-Star; bracket endpoint requires GOAT ($39.99/month as researched) | Must decide between paid bracket feed and deriving bracket from official seeds plus game feed | Medium pending budget and sandbox evidence |
| [TheSportsDB](https://www.thesportsdb.com/docs_pricing.php) | Multi-sport schedules/results; prior terminal research obtained real NBA responses | Free: 30 requests/minute with limited features; Developer: $9/month, 100/minute and two-minute livescores; Business: $20/month, 120/minute as researched | [Terms](https://www.thesportsdb.com/docs_terms_of_use.php): free is for development; published apps require paid tier and attribution; image/trademark rights remain separate | Medium for backup; paid publication requirement is explicit |
| [SportsDataIO](https://sportsdata.io/developers) | NFL, MLB, NBA, college football/basketball and tournament products | Free trial uses scrambled data; Discovery Lab offers delayed real data from $99; production real-time is commercial | [Rights/licensing](https://sportsdata.io/help/data-rights-and-licensing-questions) limit trial/lab and redistribution; production needs sales/licensing approval | High potential data quality, blocked for production until commercial agreement |
| [Oscarbase](https://api.oscarbase.com/) | Ceremonies, nominations, categories, and winners; GET endpoints document no authentication and a 100 requests/minute limit | Free/open-access positioning; no credential required for documented GETs | No clear formal license, SLA, long-term continuity, or real-time ceremony update commitment was found in reviewed docs | Medium for historical/local adapter; low for live dependency until clarified |
| ESPN undocumented endpoints | Prior terminal research found useful NFL/NCAA data shapes | No contractual quota or stability guarantee | No official public developer contract identified; schemas/endpoints can change and redistribution rights are unclear | Low; research-only/not approved for production |

Prices and terms are point-in-time findings, not procurement commitments. Recheck them at G2 and record the accepted version/date.

## Cross-event provider matrix

| Event family | Recommended path | Readiness | Priority | Beta suitability |
|---|---|---|---:|---|
| UEFA Champions League | football-data.org primary; paid soccer provider only if coverage fails | Ready for adapter work, edition check pending | 1 | Best first live provider beta |
| NFL Playoffs | BALLDONTLIE NFL primary candidate; TheSportsDB/SportsDataIO alternatives | Candidate | 2 | Strong second-adapter beta |
| NCAA March Madness 2027 | BALLDONTLIE NCAAB GOAT bracket, or All-Star games plus official bracket seed; SportsDataIO commercial alternative | Blocked on tier/design decision | 3 | High-value beta if decided before Selection Sunday |
| NBA Playoffs | BALLDONTLIE NBA primary; TheSportsDB secondary | Candidate | 4 | Good series-model beta after NFL |
| Women's World Cup 2027 | football-data.org if exact coverage/tier/freshness passes; paid soccer fallback | Candidate | 5 | Good later international beta |
| MLB Playoffs | BALLDONTLIE MLB primary; TheSportsDB secondary; SportsDataIO commercial | Candidate; 2026 launch window too short | 6 | Historical/private model test now; 2027 live beta |
| College Football Playoff | BALLDONTLIE NCAAF All-Star candidate; CollegeFootballData and SportsDataIO require renewed evaluation | Blocked on paid/coverage decision | 7 | Suitable after second adapter, not first |
| Oscars | Oscarbase candidate plus Academy manual truth | Historical 2026; live target unresolved | 8 until scope decision | 2026 replay is low-risk model beta; 2027 live is higher risk |

Priority balances product value, calendar timing, prior proof, model complexity, and access risk. It can change at G0, but an event cannot skip its readiness gates.

## Event roadmaps

### MLB Playoffs

**Edition/calendar:** The [official 2026 MLB postseason schedule](https://www.mlb.com/news/2026-mlb-playoff-and-world-series-schedule) began September 29, 2026; Division Series begins October 3 and the World Series is scheduled for October 23–31. On this plan's date, it is already in progress, leaving insufficient time for a first production ingestion rollout.

**Provider recommendation:** BALLDONTLIE MLB is the primary candidate; TheSportsDB is a paid published-app backup; SportsDataIO is the commercial option. No candidate has current Bracket.fyi live-payload evidence.

**Coverage/data assumptions:** Game schedules, status, teams, inning score/final winner, and postseason filtering are expected from the game feed. Series identity, best-of rules, bracket edges, and clinch state should be canonical Bracket.fyi configuration/derivation unless provider evidence proves a reliable series endpoint.

**Polling:** Six-hour distant/idle checks, 15 minutes near first pitch, 2–5 minutes in play, 5–15 minutes during postgame correction window, and daily after a series clinch until the next series schedule stabilizes. Rain postponements require immediate rescheduling rather than a final/no-result inference.

**Rate/licensing:** A 5 requests/minute free BALLDONTLIE budget is likely adequate for one shared event binding, but edition-level request counts must be modeled. Terms and attribution require G2 review. TheSportsDB requires paid status for publication.

**Normalization/special needs:** Franchise identity and historical aliases; league/conference; home/away; postseason round; parent series and child games; best-of target; wins-to-clinch; postponed/suspended/resumed/doubleheader identifiers; final/void behavior; World Series completion.

**Fallback/override:** Official MLB schedule/results are manual verification. An organizer can override the effective series winner for one league; provider child-game corrections remain in canonical history. Conflicting clinch state quarantines the series.

**Readiness:** Candidate, medium confidence. **Priority:** 6. **Beta:** Use historical/private 2026 fixtures to validate the model, then target 2027 live beta. **Risks/approval:** Real payload quality, postseason filters, suspended-game semantics, use/attribution, and delaying public launch until a full shadow window.

### College Football Playoff

**Edition/calendar:** The [official CFP schedule](https://collegefootballplayoff.com/news/2026/2/3/2627-2728-bowls) places 2026–27 quarterfinals on December 30, 2026 and January 1, 2027, semifinals on January 14–15, and the championship on January 25, 2027. First-round details and final field require edition configuration when officially available.

**Provider recommendation:** BALLDONTLIE NCAAF at All-Star is the leading documented candidate. CollegeFootballData may be evaluated under current terms/pricing; SportsDataIO is a commercial alternative. Undocumented ESPN endpoints are not approved.

**Coverage/data assumptions:** Game feeds are expected; CFP selection, seeding, bracket edges, byes, bowl site metadata, and official field may need official/manual configuration. Do not infer playoff membership solely from a generic postseason flag.

**Polling:** Daily before selection; 6-hour schedule checks after selection; 15-minute pregame, 2–5-minute live, and 5-minute postgame confirmation. Long gaps between rounds should fall back to daily or six-hour checks.

**Rate/licensing:** BALLDONTLIE NCAAF games require a paid tier in reviewed documentation. CollegeFootballData and SportsDataIO require current licensing/pricing review. G2 must select one and authorize spend.

**Normalization/special needs:** School/program aliases, conference, neutral site, seed/ranking, first-round byes, bowl branding separate from round identity, overtime winner, advancement graph, and championship result.

**Fallback/override:** Official CFP bracket/schedule is the structural truth; game results can be entered manually. Provider ambiguity quarantines only the affected game; organizer override stays league-scoped.

**Readiness:** Blocked on provider/tier selection, medium-low confidence. **Priority:** 7. **Beta:** Reasonable after the second-adapter framework, but the December first round leaves limited time if decisions are delayed. **Risks/approval:** Paid access, field/bracket coverage, school alias quality, licensing, and exact 2026–27 first-round schedule.

### NFL Playoffs

**Edition/calendar:** Target the 2026–27 postseason in January–February 2027. Exact kickoff schedule and bracket are configured only from official NFL publication; do not ship placeholder dates as authoritative.

**Provider recommendation:** BALLDONTLIE NFL is the primary candidate and recommended second adapter. TheSportsDB is a paid backup; SportsDataIO is the commercial option.

**Coverage/data assumptions:** Games and team IDs are documented. Verify postseason season labeling, schedule changes, overtime/final statuses, and score corrections against real read-only payloads. Bracket seeding/byes remain canonical event configuration.

**Polling:** Six-hour checks after schedule release; 15-minute pregame; 2–5-minute live; 5-minute postgame confirmation for at least one hour; daily correction check until the next round.

**Rate/licensing:** BALLDONTLIE's documented free budget is 5 requests/minute, likely sufficient for shared polling. Terms and attribution still require G2 acceptance. A published-app TheSportsDB fallback is paid.

**Normalization/special needs:** Franchise/abbreviation aliases, AFC/NFC, seed, Wild Card/Divisional/Conference/Super Bowl rounds, first-round byes, neutral-site final, overtime, postponed/relocated games, and advancement graph. Any year-specific reseeding rule belongs in configuration.

**Fallback/override:** Official NFL schedule/results provide manual verification. Provider final conflicts quarantine; organizers can enter a league override without changing canon.

**Readiness:** Candidate, medium confidence. **Priority:** 2. **Beta:** Strong second-adapter beta if provider verification is completed before playoffs. **Risks/approval:** Real data-quality evidence, season/postseason filters, terms, and support coverage during live games.

### UEFA Champions League

**Edition/calendar:** UEFA's [2026/27 calendar](https://www.uefa.com/uefachampionsleague/news/02a6-20d57cfcd03e-407c22a7f465-1000--2026-27-champions-league-teams-dates-draws-format-final/) schedules knockout play-offs for February 16/17 and 23/24, round of 16 for March 9/10 and 16/17, quarterfinals for April 6/7 and 13/14, semifinals for April 27/28 and May 4/5, and the final for June 5, 2027.

**Provider recommendation:** football-data.org primary. Evaluate a paid soccer provider only if exact competition/stage coverage or freshness fails G2 verification.

**Coverage/data assumptions:** UEFA Champions League is documented in provider coverage and football-data.org match semantics were proven in BoyzWC2026. Exact 2026/27 account-tier access, knockout-stage labels, and freshness must still be verified. Football-data may provide fixtures rather than a complete aggregate bracket, so ties and advancement are canonical derivations.

**Polling:** Six-hour league/schedule checks; 15-minute pregame; 2-minute live target within quota; 5-minute postgame confirmation; daily correction check between legs/rounds. One binding serves every league.

**Rate/licensing:** Free registration permits 10 requests/minute under current policy, ample for one competition if queries are windowed. Visible attribution is required. Provider terms, cancellation/data-retention implications, and plan selection require G2 acceptance.

**Normalization/special needs:** Club aliases and country/organization; league phase versus knockout stage; seeded/unseeded draw metadata if exposed; parent two-leg tie; leg order; aggregate score; current rules without away-goal tiebreak; extra time/penalty winner; single-match final; postponement/abandonment.

**Fallback/override:** UEFA official match centre is manual truth. Unresolved tie mapping or contradictory winner is quarantined. Organizer overrides apply to the scored match/tie selected by the template.

**Readiness:** Ready for adapter work, high architecture confidence and medium edition confidence. **Priority:** 1. **Beta:** Best first live provider beta. **Risks/approval:** Current edition/tier confirmation, exact stage/status mapping, attribution placement, and decision whether picks score individual matches, aggregate ties, or both.

### NBA Playoffs

**Edition/calendar:** The [official 2026–27 NBA schedule announcement](https://www.nba.com/news/2026-27-nba-regular-season-schedule) places the end of the regular season on April 11, 2027; exact play-in/playoff dates and bracket must be added when officially announced.

**Provider recommendation:** BALLDONTLIE NBA primary; TheSportsDB as paid secondary, with prior terminal research showing real NBA responses; SportsDataIO commercial fallback.

**Coverage/data assumptions:** Game, team, postseason filter, and status data are documented. Bracket and best-of-seven series should be canonical configuration/derivation. Decide separately whether the Play-In Tournament belongs to the product template.

**Polling:** Daily approaching Play-In; six-hour schedule polling between games; 15-minute pregame; 2–5-minute live; 5-minute postgame confirmation; daily correction check. Do not poll every league.

**Rate/licensing:** BALLDONTLIE's 5 requests/minute free tier may suffice for one edition, subject to request-volume modeling. TheSportsDB publication requires paid status. G2 accepts terms and selected fallback.

**Normalization/special needs:** Franchise aliases, conference/seeds, Play-In relationship, parent best-of-seven series, child games, wins-to-clinch, home-court sequence, rescheduling, and Finals completion.

**Fallback/override:** NBA official schedule/results for manual verification; series winner may be manually entered. Provider child-game data remains historical when one league overrides its series outcome.

**Readiness:** Candidate, medium confidence. **Priority:** 4. **Beta:** Good series-model beta after NFL or equivalent second adapter. **Risks/approval:** Play-In product scope, series derivation, real payload verification, and attribution/terms.

### NCAA March Madness 2027

**Edition/calendar:** NCAA's [future dates](https://www.ncaa.com/mens-final-four/future-info) list the 2027 First Four for March 16–17 and the Final Four/championship for April 3 and 5. Selection, first/second round, and regional dates should be confirmed from the official 2027 bracket calendar before publication.

**Provider recommendation:** Choose between BALLDONTLIE NCAAB GOAT for its documented March Madness bracket endpoint, or All-Star game data plus an official/manual seeded bracket. SportsDataIO is a commercial alternative. Do not use undocumented ESPN endpoints by default.

**Coverage/data assumptions:** Games require at least All-Star and the dedicated bracket endpoint requires GOAT in current docs. Provider bracket completeness, First Four mapping, region IDs, seed updates, and live correction behavior are unverified.

**Polling:** Daily before Selection Sunday; bracket import immediately after release plus verification; 15-minute pregame, 2–5-minute live, 5-minute postgame confirmation across active windows; daily between rounds. Shared/event-window queries are essential because many games overlap.

**Rate/licensing:** Budget decision: approximately $39.99/month at the researched GOAT price for bracket endpoint, or $9.99/month All-Star plus locally maintained structure. Reconfirm terms and price at G2. SportsDataIO requires commercial approval for production.

**Normalization/special needs:** School aliases, conference, 1–16 seeds, four regions, First Four slot replacement, 64-team advancement graph, neutral sites, overtime, round naming, and championship. Provider team IDs must not be inferred from display names alone.

**Fallback/override:** NCAA official bracket is structural/manual truth. Seed the bracket idempotently; provider supplies games/results. Organizer overrides remain available for every contest.

**Readiness:** Blocked on tier/design decision, medium confidence. **Priority:** 3. **Beta:** High value if the decision and adapter are ready well before Selection Sunday; otherwise publish manual-first and keep automation shadowed. **Risks/approval:** Paid tier, exact bracket endpoint contract, simultaneous-game rate budget, First Four semantics, and March deadline.

### FIFA Women's World Cup 2027

**Edition/calendar:** FIFA's [official schedule announcement](https://www.fifa.com/en/tournaments/womens/womensworldcup/brazil-2027/articles/match-schedule-unveiled) sets the tournament for June 24–July 25, 2027 with 64 matches and 32 teams.

**Provider recommendation:** Reuse football-data.org only if G2 confirms the exact 2027 competition, tier, stage/fixture coverage, and freshness. Keep a paid soccer-data provider as a procurement fallback; select it only after a current terms/coverage comparison.

**Coverage/data assumptions:** Women's World Cup appears in football-data.org's broader competition listing, but listing does not prove that the 2027 edition is present on the intended tier or sufficiently live. Qualification/field updates and the tournament's round-of-32 mapping require official configuration.

**Polling:** Daily during draw/field changes; six-hour schedule checks before tournament; 15-minute pregame, 2-minute live, 5-minute postgame confirmation; daily correction checks. Group-stage table polling is needed only if the product predicts group outcomes; a knockout-only template can begin from the official bracket.

**Rate/licensing:** football-data free policy is 10 requests/minute with attribution. Exact competition access and usage rights require G2 confirmation. Paid fallback pricing/licensing remains unresolved.

**Normalization/special needs:** National-team aliases/country codes, group/stage, 32-team and 64-match format, round-of-32 advancement, group standings/tiebreakers if product-scored, extra time/penalties, third-place match policy, and final.

**Fallback/override:** FIFA official schedule/match centre is manual truth. If provider coverage is absent, ship a manual-first template; do not substitute an unofficial feed silently.

**Readiness:** Candidate, medium-low edition confidence. **Priority:** 5. **Beta:** Good later beta after the football-data adapter is stable. **Risks/approval:** Exact 2027 provider access, group-stage product scope, draw/qualification timing, attribution, and paid fallback budget.

### Oscars 2026 / next live Oscars

**Edition/calendar:** The [98th Academy Awards](https://www.oscars.org/oscars/ceremonies/2026) occurred on March 15, 2026, so “Oscars 2026” is historical as of this plan. The Academy has announced the [99th Oscars](https://press.oscars.org/news/academy-and-abc-announce-show-dates-99th-and-100th-oscarsr) for March 14, 2027, with nominations scheduled for January 21, 2027.

**Owner decision required:** Preserve Oscars 2026 as a clearly labeled historical replay/case-study template, or rename the upcoming roadmap item to Oscars 2027. Do not present the historical ceremony as upcoming.

**Provider recommendation:** Oscarbase is the adapter candidate; Academy ceremony/category pages are canonical manual verification. There is no approved automatic fallback.

**Coverage/data assumptions:** Oscarbase documents ceremonies, nominations, categories, and winners without GET authentication and at 100 requests/minute. Historical coverage can validate normalization. Its real-time winner publication timing, correction behavior, availability, license, and SLA are not established.

**Polling:** Historical replay needs no recurring polling. For a future live ceremony, poll nominations daily around announcement, then stop until ceremony day; poll category winners every 2–5 minutes during the ceremony only if terms and observed update timing support it; continue a bounded post-ceremony correction check.

**Rate/licensing:** Technical quota is generous, but lack of clear formal terms/SLA is the dominant blocker. G2 requires owner/legal acceptance or provider clarification before live reliance. Academy content/trademarks must be presented carefully.

**Normalization/special needs:** Ceremony/edition, award category stable identity and aliases, category order, nominee as person/film/song/work, credited people versus winning work, multiple recipients, nominations, winner status, withdrawn/renamed categories, and corrections. A ceremony is an event/stage; each scored category is a contest.

**Fallback/override:** Academy official winner pages plus organizer manual entry. During a live ceremony, unknown/late provider state remains pending rather than guessed. League override can correct one category without changing shared canon.

**Readiness:** Historical 2026 adapter is a candidate at medium confidence; live 2027 is blocked at low confidence pending terms/reliability. **Priority:** 8 until scope decision. **Beta:** Historical replay is a valuable low-risk proof that the common model is not sports-only; live beta requires a manual operator and kill switch. **Risks/approval:** Year/scope, licensing, service continuity, update latency, multi-recipient modeling, and brand usage.

## Calendar template selection criteria

Score each proposed template on:

1. Official dates and structure are stable enough to configure.
2. Provider coverage is documented and verified for the exact edition/tier.
3. Terms, attribution, caching, storage, and redistribution are approved.
4. Data model already supports its contest and advancement semantics.
5. Manual fallback and official verification source are practical.
6. There is adequate shadow/beta time before the first scored contest.
7. Provider quota and infrastructure plan support the polling window.
8. Product value and likely organizer demand justify operational burden.
9. Required mappings can be reviewed without risky fuzzy automation.
10. A named operator and beta group are available.

UCL scores highest for the first provider adapter because it combines prior provider proof with lead time. NFL is favored for the second seam. March Madness is high-value but blocked by a deliberate data-tier/design decision. MLB 2026 fails the lead-time criterion.

## Provider selection and fallback policy

- One provider is authoritative per event binding at a time.
- A fallback provider starts in shadow and is not blended automatically.
- Promotion requires identity parity, result parity, terms approval, and an audited operator action.
- Official event sources are verification/manual truth, not scraped APIs unless an approved contract permits it.
- Provider failure changes freshness/health, not winners.
- Manual organizer overrides never rewrite canonical provider history.
- Paid provider approval records account owner, budget, renewal/cancellation date, credential owner, accepted terms date, and attribution requirement.

## Unresolved decisions and approvals

| Decision | Recommendation | Gate |
|---|---|---|
| First adapter/event | football-data.org + UCL 2026/27 | G0, then G2 |
| Second adapter/event | BALLDONTLIE NFL + NFL Playoffs | G0, then G2 |
| NCAA data strategy | GOAT bracket endpoint if verified, otherwise All-Star games + official/manual bracket | G0 budget direction, G2 purchase |
| Oscars target | Historical 2026 replay plus rename live roadmap to Oscars 2027 | G0 |
| MLB target | Model with 2026 fixtures; target 2027 live beta | G0 |
| Supabase runtime | Use an explicitly non-pausing beta/live environment with verified Cron/Edge capacity | G0 direction, G3/G4 execution |
| Paid budget | Set monthly ceiling before selecting college or commercial fallback providers | G0/G2 |
| Legal/terms owner | Name the person authorized to accept provider terms and attribution obligations | G0 |
| UCL scoring unit | Prefer aggregate ties for advancement picks; decide whether individual legs also score | G0 product decision |
| NBA Play-In | Exclude from playoff bracket unless explicitly designed as a qualifying stage | G0 product decision |
| Women's World Cup scope | Start knockout-only unless group-stage picks are separately approved | G0 product decision |

## Research limitations

- Pricing, limits, terms, coverage, and event calendars can change; all are revalidated at G2.
- Documentation demonstrates claimed capabilities, not actual freshness, correctness, uptime, or payload stability.
- Prior terminal calls are historical evidence, not current provider acceptance.
- No current provider API was called, no account was created, no credential was handled, and no provider was contacted in this planning phase.
- No recommendation grants rights to team, league, event, nominee, poster, logo, or photographic assets.

## Historical evidence retained

- BoyzWC2026 local implementation: football-data.org ingestion, alias mapping, authoritative winner semantics, five-minute live/six-hour idle polling, manual override freeze, and real tournament score parity.
- July 2026 terminal records: Oscarbase, TheSportsDB, BALLDONTLIE, SportsDataIO, ESPN endpoint, shared-template, and production smoke-test research.
- Current repository: manually seeded templates and organizer result entry, with no committed live provider adapter or scheduler.

Historical findings are preserved as context; current primary documentation above controls readiness decisions.
