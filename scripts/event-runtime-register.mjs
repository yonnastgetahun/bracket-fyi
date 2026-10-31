// Node 22.15+ synchronous hooks for this repository's TS aliases, job entry only.
import { registerHooks } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import ts from "typescript";
import { fileURLToPath } from "node:url";
const root=new URL("../",import.meta.url);
registerHooks({
 load(url,context,nextLoad){
  if(url.startsWith(root.href) && url.endsWith(".ts")){
   const source=ts.transpileModule(readFileSync(new URL(url),"utf8"),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
   return {format:"module",source,shortCircuit:true};
  }
  return nextLoad(url,context);
 },
 resolve(specifier,context,nextResolve){
  let url;
  if(specifier.startsWith("@/")) url=new URL(specifier.slice(2),root);
  else if(specifier.startsWith(".") && context.parentURL?.startsWith(root.href))
   url=new URL(specifier,context.parentURL);
  if(url && !/\.[a-z]+$/i.test(url.pathname) && existsSync(fileURLToPath(url)+".ts"))
   return nextResolve(url.href+".ts",context);
  return nextResolve(specifier,context);
 },
});
