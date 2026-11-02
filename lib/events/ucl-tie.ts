/** Exact two-leg feasible signs: no away-goal rule, and either qualifier is
 * possible at aggregate parity (extra time/penalties). Missing membership is
 * unknown, never an invented tie association. Scores are regulation-only. */
export interface TieLeg { home:string; away:string; score:readonly [number,number]|null }
export interface UclTie { teamA:string; teamB:string; firstLeg:TieLeg|null; secondLeg:TieLeg|null; qualifier:string|null }
type Domain = {choice:string; minimum:number; maximum:number};
function domains(leg:TieLeg,a:string,b:string):Domain[] {
 if (new Set([leg.home,leg.away]).size!==2 || ![a,b].includes(leg.home) || ![a,b].includes(leg.away)) throw new Error("Tie membership mismatch");
 if (leg.score) {
  if (leg.score.some(score=>!Number.isSafeInteger(score)||score<0)) throw new Error("Invalid regulation score");
  const raw=leg.score[0]-leg.score[1];
  const difference=leg.home===a?raw:-raw;
  return [{choice:raw===0?"draw":raw>0?leg.home:leg.away,minimum:difference,maximum:difference}];
 }
 return [{choice:a,minimum:1,maximum:Infinity},{choice:"draw",minimum:0,maximum:0},{choice:b,minimum:-Infinity,maximum:-1}];
}
export function uclTieWorlds(tie:UclTie):Array<Record<string,string[]>>|null {
 if (!tie.teamA||!tie.teamB||tie.teamA===tie.teamB || (tie.qualifier!==null && ![tie.teamA,tie.teamB].includes(tie.qualifier))) throw new Error("Invalid tie participants");
 if (!tie.firstLeg || !tie.secondLeg) return null;
 const worlds:Array<Record<string,string[]>>=[];
 for(const first of domains(tie.firstLeg,tie.teamA,tie.teamB)) for(const second of domains(tie.secondLeg,tie.teamA,tie.teamB)) {
  const minimum=first.minimum+second.minimum,maximum=first.maximum+second.maximum;
  // Intervals always have well-defined endpoints: minimums never +Infinity,
  // maximums never -Infinity. Aggregate zero permits either decider winner.
  for(const qualifier of [tie.teamA,tie.teamB]) {
   if (tie.qualifier!==null && tie.qualifier!==qualifier) continue;
   if ((qualifier===tie.teamA && maximum>=0)||(qualifier===tie.teamB && minimum<=0)) {
    worlds.push({leg1:[first.choice],leg2:[second.choice],qualifier:[qualifier]});
   }
  }
 }
 return worlds;
}
