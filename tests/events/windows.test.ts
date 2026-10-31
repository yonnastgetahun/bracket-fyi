import { describe, expect, it } from "vitest";
import { evaluateWindow, canJoin, validateWindowSubmission, publicWindowPicks, tightenCutoff } from "@/lib/events/windows";
describe("window eligibility and privacy contract", () => {
  const window = { id:"round2",state:"open" as const,cutoff:"2027-03-14T09:00:00Z",version:2,marketIds:["a","b"],pairingsReviewed:true };
  it("locks at cutoff and never reopens for postponed schedules", () => {
    expect(evaluateWindow(window,"2027-03-14T08:59:59Z",false)).toBe("open");
    expect(evaluateWindow(window,"2027-03-14T09:00:00Z",false)).toBe("locked");
    expect(tightenCutoff(window,"2027-03-14T10:00:00Z").cutoff).toBe(window.cutoff);
    expect(tightenCutoff(window,"2027-03-14T08:00:00Z").cutoff).toBe("2027-03-14T08:00:00Z");
    expect(evaluateWindow({...window,state:"locked"},"2027-03-13T00:00:00Z",false)).toBe("locked");
  });
  it("keeps missing schedules/pairings unopened and blocks late joins", () => {
    expect(evaluateWindow({...window,cutoff:null},"2027-03-01T00:00:00Z",false)).toBe("unopened");
    expect(evaluateWindow({...window,pairingsReviewed:false},"2027-03-01T00:00:00Z",false)).toBe("unopened");
    expect(canJoin([window],"2027-03-14T09:00:00Z")).toBe(false);
    expect(canJoin([{...window,state:"locked"}],"2027-03-13T00:00:00Z")).toBe(false);
  });
  it("validates complete scoped submissions and preserves open-window embargo", () => {
    const submission={windowId:"round2",version:2,picks:{a:"home",b:"draw"}};
    expect(()=>validateWindowSubmission(window,submission,"2027-03-14T08:00:00Z",false,{a:["home","away"],b:["home","draw","away"]})).not.toThrow();
    expect(()=>validateWindowSubmission(window,{...submission,picks:{a:"home"}},"2027-03-14T08:00:00Z",false,{})).toThrow();
    expect(()=>validateWindowSubmission(window,submission,"2027-03-14T09:00:00Z",false,{})).toThrow();
    expect(()=>validateWindowSubmission(window,submission,"2027-03-14T08:00:00Z",true,{})).toThrow();
    expect(publicWindowPicks([window],submission.picks,"2027-03-14T08:00:00Z")).toEqual({});
    expect(publicWindowPicks([window],submission.picks,"2027-03-14T09:00:00Z")).toEqual(submission.picks);
  });
});
