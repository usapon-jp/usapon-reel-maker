import {JobProcessor} from './processor';

const processor = new JobProcessor();
await processor.initialize();

let stopping = false;
process.once('SIGINT', () => {
  stopping = true;
});
process.once('SIGTERM', () => {
  stopping = true;
});

console.log('うさぽん リールメーカー worker ready');
while (!stopping) {
  const processed = await processor.processNext();
  if (!processed) await new Promise((resolve) => setTimeout(resolve, 700));
}

processor.database.close();
