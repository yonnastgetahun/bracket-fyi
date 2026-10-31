/** psql VERBOSITY=verbose is required. Never expose stderr/commands/credentials. */
export function sqlFailure(error:unknown) {
 const stderr=error && typeof error==="object" && "stderr" in error?String(error.stderr??""):"";
 const code=stderr.match(/ERROR:\s+([A-Z0-9]{5}):/)?.[1]??"XX000";
 return {data:null,error:{code,message:"database command rejected"}};
}
