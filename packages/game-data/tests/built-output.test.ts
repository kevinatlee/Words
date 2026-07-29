import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

describe('built game-data package', () => {
  it('loads the verified dictionary from JavaScript built output', async () => {
    const { stdout } = await execFileAsync(
      process.execPath,
      ['scripts/build-package.mjs'],
      {
        cwd: new URL('../', import.meta.url),
        encoding: 'utf8',
      },
    );

    expect(stdout).toContain(
      'Built JavaScript loader verified from an unrelated working directory.',
    );
  });
});
