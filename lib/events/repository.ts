import type { WindowSubmission } from "./windows";
export interface EventRpcClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{data: unknown; error: {message: string; code?: string} | null}>;
}
export class EventCommandError extends Error {
  constructor(readonly code: "unauthorized" | "conflict" | "invalid" | "unavailable") {
    super(code === "unauthorized" ? "Session is not authorized" : code === "conflict" ? "Event changed; refresh before retrying" : code === "invalid" ? "Invalid event command" : "Event is temporarily unavailable");
  }
}
async function call(client: EventRpcClient, name: string, args: Record<string,unknown>): Promise<unknown> {
  const {data,error} = await client.rpc(name,args);
  if (error) throw new EventCommandError(error.code==="42501" ? "unauthorized" : (error.code==="PT409" || error.code==="40001") ? "conflict" : error.code==="22023" || error.code==="23514" ? "invalid" : "unavailable");
  return data;
}
export function createEventRepository(client: EventRpcClient) {
  return {
    async submit(leagueId:string,participantCredential:string,submission:WindowSubmission) {
      if (!submission || !Number.isSafeInteger(submission.version) || submission.version <= 0 || submission.version > 2147483647) throw new EventCommandError("invalid");
      return call(client,"submit_event_window",{p_league_id:leagueId,p_magic_token:participantCredential,p_window_key:submission.windowId,p_expected_version:submission.version,p_picks:submission.picks});
    },
    advanceWindows(leagueId:string) { return call(client,"advance_event_windows",{p_league_id:leagueId}); },
    freeze(leagueId:string,organizerCredential:string,frozen:boolean) { return call(client,"freeze_event_league",{p_league_id:leagueId,p_organizer_token:organizerCredential,p_frozen:frozen}); },
    async readPicks(leagueId:string,participantCredential:string|null) {
      const data = await call(client,"read_event_picks",{p_league_id:leagueId,p_magic_token:participantCredential});
      if (!Array.isArray(data)) throw new EventCommandError("unavailable");
      return data.map(row=>{
        if (!row || typeof row!=="object" || typeof row.participant_id!=="string" || typeof row.slot_id!=="string" || typeof row.team_id!=="string") throw new EventCommandError("unavailable");
        // Never spread DB objects across the UI boundary.
        return {participantId:row.participant_id as string,marketId:row.slot_id as string,choice:row.team_id as string};
      });
    },
    async join(leagueId:string,invitation:string,displayName:string) {
      const data=await call(client,"join_event_league",{p_league_id:leagueId,p_join_token:invitation,p_display_name:displayName});
      const row=Array.isArray(data)?data[0]:null;
      if (!row || typeof row.participant_id!=="string" || typeof row.magic_token!=="string") throw new EventCommandError("unavailable");
      // Own newly-created recovery credential only; callers set an HttpOnly cookie.
      return {participantId:row.participant_id as string,credential:row.magic_token as string};
    },
  };
}
