import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const repositoryRoot = path.resolve(process.cwd(), '../..');

async function readRepositoryFile(relativePath: string): Promise<string> {
  return readFile(path.join(repositoryRoot, relativePath), 'utf8');
}

describe('manual test-container release channel', () => {
  it('is manually dispatched only and rejects an unconfirmed request before checkout or install work', async () => {
    const workflow = await readRepositoryFile(
      '.github/workflows/publish-test.yml',
    );

    expect(workflow).toMatch(/^on:\n {2}workflow_dispatch:/m);
    expect(workflow).not.toMatch(/^ {2}(pull_request|push|schedule):/m);
    expect(workflow).toContain('PUBLISH_TEST');
    expect(workflow.indexOf('Confirm requested publication')).toBeLessThan(
      workflow.indexOf('Check out requested repository ref'),
    );
    expect(workflow.indexOf('Confirm requested publication')).toBeLessThan(
      workflow.indexOf('npm ci'),
    );
  });

  it('checks out and records one exact resolved 40-character target SHA', async () => {
    const workflow = await readRepositoryFile(
      '.github/workflows/publish-test.yml',
    );

    expect(workflow).toContain('ref: ${{ inputs.target_ref }}');
    expect(workflow).toContain('repository: ${{ github.repository }}');
    expect(workflow).toContain('persist-credentials: false');
    expect(workflow).toContain('TARGET_SHA="$(git rev-parse HEAD)"');
    expect(workflow).toContain('^[0-9a-f]{40}$');
    expect(workflow).toContain('candidate_refs');
    expect(workflow).toContain('must resolve to exactly one branch, tag');
    expect(workflow).toContain('printf \'sha=%s\\n\' "$TARGET_SHA"');
  });

  it('constructs immutable and mutable test tags from the resolved SHA without touching latest', async () => {
    const workflow = await readRepositoryFile(
      '.github/workflows/publish-test.yml',
    );

    expect(workflow).toContain(
      'ghcr.io/kevinatlee/words:test-sha-${{ steps.target.outputs.sha }}',
    );
    expect(workflow).toContain('ghcr.io/kevinatlee/words:test');
    const publicationStep = workflow.slice(
      workflow.indexOf('Publish exact tested test-image tags'),
      workflow.indexOf('Verify remote test-image digests'),
    );
    expect(publicationStep).not.toContain('latest');
    expect(workflow.indexOf('docker push "$IMMUTABLE_IMAGE"')).toBeLessThan(
      workflow.indexOf('docker push "$TEST_IMAGE"'),
    );
  });

  it('cancels stale test publications and verifies both remote test tags share a digest', async () => {
    const workflow = await readRepositoryFile(
      '.github/workflows/publish-test.yml',
    );

    expect(workflow).toContain('group: words-test-publish');
    expect(workflow).toContain('cancel-in-progress: true');
    expect(workflow).toContain('docker buildx imagetools inspect --raw');
    expect(workflow).toContain('test "$immutable_digest" = "$test_digest"');
  });

  it('uses the explicit smoke revision before the ordinary workflow SHA and checks the OCI label', async () => {
    const smokeScript = await readRepositoryFile('scripts/smoke-container.mjs');
    const workflow = await readRepositoryFile(
      '.github/workflows/publish-test.yml',
    );

    expect(smokeScript).toContain(
      "process.env.WORDS_SMOKE_REVISION ?? process.env.GITHUB_SHA ?? 'local-smoke'",
    );
    expect(smokeScript).toContain(
      "image.Config.Labels?.['org.opencontainers.image.revision']",
    );
    expect(workflow).toContain(
      'WORDS_SMOKE_REVISION: ${{ steps.target.outputs.sha }}',
    );
  });

  it('documents separate immutable production and test channels with a generic manual test procedure', async () => {
    const documents = await Promise.all(
      [
        'README.md',
        'docs/CI.md',
        'docs/DEPLOYMENT.md',
        '.github/workflows/README.md',
      ].map(readRepositoryFile),
    );
    const documentation = documents.join('\n');

    expect(documentation).toContain('<registry image>:sha-<full-main-sha>');
    expect(documentation).toContain(
      '<registry image>:test-sha-<full-target-sha>',
    );
    expect(documentation).not.toContain('ghcr.io/kevinatlee/words');
    expect(documentation).toContain('PUBLISH_TEST');
    expect(documentation).toContain('Test container installation');
  });
});
