import {JobProcessor} from './processor';
import {CloudJobProcessor} from './cloud-processor';

const processor = new JobProcessor();
await processor.initialize();
const cloudProcessor = CloudJobProcessor.fromEnvironment({
  database: processor.database,
  storage: processor.storage,
  renderer: processor.renderer,
});

let stopping = false;
process.once('SIGINT', () => {
  stopping = true;
});
process.once('SIGTERM', () => {
  stopping = true;
});

console.log(`うさぽん リールメーカー worker ready (${cloudProcessor ? 'local + cloud' : 'local'})`);
while (!stopping) {
  let processed = await processor.processNext();
  if (cloudProcessor) {
    try {
      processed = (await cloudProcessor.processNext()) || processed;
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
    }
  }
  if (!processed) await new Promise((resolve) => setTimeout(resolve, cloudProcessor ? 2500 : 700));
}

processor.database.close();
