import { describe, expect, it } from 'vitest';

import { createServerConfig } from './config.js';

describe('server configuration', () => {
  it('derives a neutral local public origin from the configured port', () => {
    expect(createServerConfig({}).publicBaseUrl).toBe('http://localhost:6532');
    expect(createServerConfig({ PORT: '7000' }).publicBaseUrl).toBe(
      'http://localhost:7000',
    );
  });

  it('uses the explicit deployment public origin unchanged', () => {
    expect(
      createServerConfig({
        PORT: '7000',
        PUBLIC_BASE_URL: 'https://deployment.example.invalid',
      }).publicBaseUrl,
    ).toBe('https://deployment.example.invalid');
  });
});
