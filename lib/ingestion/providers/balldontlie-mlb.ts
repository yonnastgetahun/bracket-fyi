import { BdlFamilyAdapter } from "@/lib/ingestion/providers/balldontlie-family";
import type { BdlFetch } from "@/lib/ingestion/providers/balldontlie";

export class BdlMlbAdapter extends BdlFamilyAdapter {
  constructor(dependencies: { fetch: BdlFetch }) { super("mlb", dependencies); }
}
