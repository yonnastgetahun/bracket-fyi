import { expect, it } from "vitest";
import { BdlNbaAdapter } from "@/lib/ingestion/providers/balldontlie-nba";
import { BdlMlbAdapter } from "@/lib/ingestion/providers/balldontlie-mlb";
import { BdlNcaabAdapter } from "@/lib/ingestion/providers/balldontlie-ncaab";
import { BdlNcaafAdapter } from "@/lib/ingestion/providers/balldontlie-ncaaf";
import { families, game, request, response } from "../../events/provider-four-family-fixture";

const adapters = { nba: BdlNbaAdapter, mlb: BdlMlbAdapter, ncaab: BdlNcaabAdapter, ncaaf: BdlNcaafAdapter };
it.each(families)("%s rejects contradictory time-bearing date, not just a different day", async sport => {
 const adapter = new adapters[sport]({fetch: async () => response({...game(sport), date:"2027-01-20T19:00:00Z"})});
 await expect(adapter.pull(request(sport))).rejects.toMatchObject({failure:{code:"invalid_response",details:{reason:"schedule_mismatch"}}});
});
it.each(families)("%s admits equivalent offset timestamp and date-only evidence", async sport => {
 for(const date of ["2027-01-20T10:00:00-08:00", "2027-01-20"]) {
  const adapter = new adapters[sport]({fetch: async () => response({...game(sport),date})});
  expect((await adapter.pull(request(sport))).observations).toHaveLength(2);
 }
});
