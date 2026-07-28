import { pathToFileURL } from 'node:url';

import { createWordsServer } from './server.js';

export { createWordsServer } from './server.js';

const entryPath = process.argv[1];

if (entryPath && import.meta.url === pathToFileURL(entryPath).href) {
  const server = createWordsServer();
  const port = await server.start();

  console.log(`Words server listening on http://localhost:${port}`);

  const shutDown = async () => {
    await server.stop();
    process.exit(0);
  };

  process.once('SIGINT', () => void shutDown());
  process.once('SIGTERM', () => void shutDown());
}
