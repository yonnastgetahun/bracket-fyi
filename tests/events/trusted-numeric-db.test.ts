import { describe,it,expect } from "vitest";
import { runNumericPersistence } from "./trusted-numeric-persistence";
describe.runIf(process.env.RUN_TRUSTED_NUMERIC_DB==="1")("actual trusted numeric SQL persistence",()=>{
 it("round-trips Play-In corrections, coupled UCL, WWC 48/64, elimination/forfeit and unknown",async()=>{
  const result=await runNumericPersistence(process.env);
  expect(result.sqlExecuted).toBe(true);
  expect(result.checkpointHookExecuted).toBe(false);
  expect(result.checks).toHaveLength(12);
 },600000);
});
