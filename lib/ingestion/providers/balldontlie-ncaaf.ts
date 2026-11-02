import { BdlFamilyAdapter } from "@/lib/ingestion/providers/balldontlie-family";
import type { BdlFetch } from "@/lib/ingestion/providers/balldontlie";

export class BdlNcaafAdapter extends BdlFamilyAdapter {
  constructor(dependencies: { fetch: BdlFetch }) { super("ncaaf", dependencies); }
}
