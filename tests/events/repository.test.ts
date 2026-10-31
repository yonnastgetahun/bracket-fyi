import { describe,it,expect,vi } from "vitest";
import {createEventRepository,EventCommandError} from "@/lib/events/repository";
describe("event repository boundary",()=>{
 it.each([null, undefined, 0, -1, 1.5, NaN, Infinity, "1"])("rejects invalid runtime window version %s before RPC", async(version)=>{
  const rpc=vi.fn().mockResolvedValue({data:null,error:null});
  const repo=createEventRepository({rpc});
  await expect(repo.submit("l","own",{windowId:"w",version:version as number,picks:{m:"a"}})).rejects.toThrow("Invalid event command");
  expect(rpc).not.toHaveBeenCalled();
 });
 it("allowlists public pick fields and strips server rows",async()=>{
  const repo=createEventRepository({rpc:vi.fn().mockResolvedValue({data:[{participant_id:"p",slot_id:"m",team_id:"a",magic_token:"synthetic-private"}],error:null})});
  expect(await repo.readPicks("l",null)).toEqual([{participantId:"p",marketId:"m",choice:"a"}]);
 });
 it("does not expose SQL errors or bearer values",async()=>{
  const repo=createEventRepository({rpc:vi.fn().mockResolvedValue({data:null,error:{code:"42501",message:"synthetic bearer secret"}})});
  await expect(repo.submit("l","own",{windowId:"w",version:1,picks:{m:"a"}})).rejects.toThrow("Session is not authorized");
  await expect(repo.readPicks("l",null)).rejects.toBeInstanceOf(EventCommandError);
 });
});
