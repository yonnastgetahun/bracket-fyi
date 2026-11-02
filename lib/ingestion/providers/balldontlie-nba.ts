import { BdlFamilyAdapter } from "@/lib/ingestion/providers/balldontlie-family";
import type { BdlFetch } from "@/lib/ingestion/providers/balldontlie";

export class BdlNbaAdapter extends BdlFamilyAdapter {
  constructor(dependencies: { fetch: BdlFetch }) { super("nba", dependencies); }
}
