import { fileURLToPath, pathToFileURL } from 'node:url';

import { createWordsServer } from './server.js';

const entryPath = process.argv[1];

if (entryPath && import.meta.url === pathToFileURL(entryPath).href) {
  const clientDirectory = fileURLToPath(new URL('../client/', import.meta.url));
  const server = createWordsServer(
    {},
    { staticClientDirectory: clientDirectory },
  );
  const port = await server.start();

  console.log(`Words server listening on http://0.0.0.0:${port}`);

  const shutDown = async () => {
    await server.stop();
    process.exit(0);
  };

  process.once('SIGINT', () => void shutDown());
  process.once('SIGTERM', () => void shutDown());
}
