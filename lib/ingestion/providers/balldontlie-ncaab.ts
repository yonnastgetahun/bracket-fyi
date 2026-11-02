import { BdlFamilyAdapter } from "@/lib/ingestion/providers/balldontlie-family";
import type { BdlFetch } from "@/lib/ingestion/providers/balldontlie";

export class BdlNcaabAdapter extends BdlFamilyAdapter {
  constructor(dependencies: { fetch: BdlFetch }) { super("ncaab", dependencies); }
}
