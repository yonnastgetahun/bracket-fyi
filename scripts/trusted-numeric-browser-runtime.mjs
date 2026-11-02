// Sole runtime-owner wrapper: ephemeral browser, existing isolated HTTP app/DB.
import {spawn} from 'node:child_process';
import puppeteer from 'puppeteer-core';
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-first-run']});
try {
 const endpoint=new URL(browser.wsEndpoint());
 const code=await new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,['--import','./scripts/event-runtime-register.mjs','scripts/verify-trusted-numeric.mjs','browser'],{stdio:'inherit',env:{...process.env,BRACKET_NUMERIC_BROWSER_URL:'http://127.0.0.1:'+endpoint.port}});
  child.on('error',reject);child.on('exit',code=>resolve(code??1));
 });
 process.exitCode=code;
} finally {await browser.close();}
