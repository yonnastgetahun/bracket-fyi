import {describe,it,expect} from "vitest";
import {uclTieWorlds} from "@/lib/events/ucl-tie";
import {scoreParticipant} from "@/lib/events/outcomes";
describe("UCL exact joint regulation and qualifier feasibility",()=>{
 it("after a 2-0 first leg, a second-leg draw cannot qualify B",()=>{
  const worlds=uclTieWorlds({teamA:"a",teamB:"b",firstLeg:{home:"a",away:"b",score:[2,0]},secondLeg:{home:"b",away:"a",score:null},qualifier:null});
  expect(worlds).not.toBeNull();
  expect(worlds!.some(w=>w.leg2.includes("draw")&&w.qualifier.includes("b"))).toBe(false);
  const score=scoreParticipant([
   {id:"leg1",locked:true,weight:1,result:{kind:"winner",entrant:"a"}},
   {id:"leg2",locked:true,weight:1,result:{kind:"unresolved"}},
   {id:"qualifier",locked:true,weight:1,result:{kind:"unresolved"}},
  ],{leg1:"b",leg2:"draw",qualifier:"b"},[{marketIds:["leg1","leg2","qualifier"],worlds}]);
  expect(score).toMatchObject({earned:0,maximum:1,wrong:1});
 });
 it("a tied aggregate supports either extra-time/shootout qualifier",()=>{
  const worlds=uclTieWorlds({teamA:"a",teamB:"b",firstLeg:{home:"a",away:"b",score:[2,0]},secondLeg:{home:"b",away:"a",score:[2,0]},qualifier:null});
  expect(worlds!.map(w=>w.qualifier[0]).sort()).toEqual(["a","b"]);
 });
 it("fixed aggregate and incompatible declared qualifier hold, missing trusted membership unverified",()=>{
  expect(uclTieWorlds({teamA:"a",teamB:"b",firstLeg:{home:"a",away:"b",score:[2,0]},secondLeg:{home:"b",away:"a",score:[1,0]},qualifier:"b"})).toEqual([]);
  expect(uclTieWorlds({teamA:"a",teamB:"b",firstLeg:null,secondLeg:null,qualifier:null})).toBeNull();
 });
});
