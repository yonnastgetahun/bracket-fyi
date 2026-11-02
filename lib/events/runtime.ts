import type { EventRpcClient } from "./repository";
import { createQuarantineRepository } from "../ingestion/quarantine/repository";
import { createSeriesRepository } from "./series-repository";
import { createProviderAttemptControls } from "./operator-controls";
import { createIngestionOrchestrator } from "../ingestion/orchestrator/orchestrator";
import type { OrchestratorDependencies } from "../ingestion/orchestrator/ports";
import { createLifecycleRepository } from "./lifecycle-repository";
import { reconcileEventLifecycleSweep } from "./lifecycle";
import { createNotificationRepository } from "./notifications-repository";
import { createFakeNotificationTransport, createNotificationWorker } from "./notifications";
import { produceRuntimeNotifications, runtimeSignalsSchema } from "./runtime-producers";

/** Trusted factory: callers cannot replace the SQL admission port with a permissive stub.
 * Existing generic orchestrator has no other production composition root.
 * Infrastructure client must be scoped by the server/job host, never a browser client.
 */
export function createEventIngestionRuntime(client:EventRpcClient,dependencies:Omit<OrchestratorDependencies,"attemptControls"|"quarantine">) {
 return createIngestionOrchestrator({...dependencies,attemptControls:createProviderAttemptControls(client),quarantine:createQuarantineRepository(client)});
}
export interface EventTickOptions {
 seriesAfter?:string|null;after?:string|null;batchSize?:number;maxBatches?:number;
 notificationLimit?:number;signals?:readonly unknown[];now?:Date;
}
function bound(value:number,min:number,max:number) {
 if(!Number.isSafeInteger(value)||value<min||value>max) throw new Error("Invalid runtime bound");
 return value;
}
/** One bounded pass. No timer, provider network, control mutation or real transport.
 * DB admission remains authoritative even when stopped changes during this pass.
 * A process restart constructs a fresh worker incarnation; no permit resume API.
 */
export function createEventRuntime(client:EventRpcClient) {
 const series=createSeriesRepository(client);
 const lifecycle=createLifecycleRepository(client);
 const notifications=createNotificationRepository(client);
 const transport=createFakeNotificationTransport();
 const worker=createNotificationWorker(notifications,transport);
 return {
  async tick(options:EventTickOptions={}) {
   const batchSize=bound(options.batchSize??100,1,500);
   const maxBatches=bound(options.maxBatches??1,1,100);
   const notificationLimit=bound(options.notificationLimit??100,1,500);
   const signals=runtimeSignalsSchema.parse(options.signals??[]);
   const now=options.now??new Date();
   if(!Number.isFinite(now.getTime())) throw new Error("Invalid runtime clock");
   const before=transport.calls.length;
   const derived=await series.sweep(options.seriesAfter??null,batchSize);
   const sweep=await reconcileEventLifecycleSweep(lifecycle,{after:options.after,batchSize,maxBatches});
   const produced=await produceRuntimeNotifications({read:lifecycle.read,emit:notifications.emit},signals,now);
   const delivered=await worker.run(notificationLimit);
   return {derived,sweep,produced,notifications:delivered,fakeCalls:transport.calls.length-before};
  },
 };
}
