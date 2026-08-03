import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const exemptPrefixes = [
  'packages/game-data/',
  'LICENSE',
  'THIRD_PARTY_NOTICES.md',
  'docs/DICTIONARY_EVALUATION.md',
  'docs/GAME_DATA.md',
];

const checks = [
  ['absolute web URL', /https?:\/\/\S+/g],
  ['IP address', /\b(?:\d{1,3}\.){3}\d{1,3}\b/g],
  ['email address', /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi],
  ['absolute user-home path', /(?:\/Users\/|\/home\/|[A-Z]:\\Users\\)[^\s`]*/g],
  ['embedded URL credentials', /https?:\/\/[^\s/@:]+:[^\s/@]+@/g],
  ['specific registry reference', /\b(?:ghcr\.io|docker\.io)\/[^\s`]+/g],
  [
    'deployment hostname',
    /\b[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.(?:app|ca|cloud|co|com|dev|invalid|io|local|me|net|org|site|tech|uk|us|xyz)\b/g,
  ],
];

export function findPrivacyIssues(path, text) {
  const issues = [];
  text.split(/\r?\n/).forEach((line, index) => {
    for (const [category, pattern] of checks) {
      pattern.lastIndex = 0;
      const inspectedLine =
        category === 'deployment hostname'
          ? line.replaceAll(/socket\.io/gi, '')
          : line;
      if (pattern.test(inspectedLine)) {
        issues.push({ category, path, line: index + 1 });
      }
    }
  });
  return issues;
}

function publicSurface(path) {
  if (exemptPrefixes.some((prefix) => path.startsWith(prefix))) return false;
  return (
    path === '.env.example' ||
    path === 'AGENTS.md' ||
    path === 'README.md' ||
    path.endsWith('/README.md') ||
    (path.startsWith('docs/') && path.endsWith('.md'))
  );
}

function selfTest() {
  const fixtures = [
    [
      'absolute URL',
      'Deploy at https://private.example.invalid',
      'absolute web URL',
    ],
    ['private IP', 'Bind to 192.168.1.20', 'IP address'],
    [
      'home path',
      'Run from /Users/operator/project',
      'absolute user-home path',
    ],
    [
      'hostname',
      'Route private.example.test.io to the service',
      'deployment hostname',
    ],
  ];
  for (const [path, text, expected] of fixtures) {
    if (
      !findPrivacyIssues(path, text).some(
        (issue) => issue.category === expected,
      )
    ) {
      throw new Error(`Privacy fixture failed: ${path}`);
    }
  }
  if (publicSurface('THIRD_PARTY_NOTICES.md')) {
    throw new Error('Legal notice exemption failed.');
  }
  if (publicSurface('packages/game-data/NOTICE.md')) {
    throw new Error('Provenance exemption failed.');
  }
}

selfTest();
const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean)
  .filter(publicSurface);
const issues = tracked.flatMap((path) =>
  findPrivacyIssues(path, readFileSync(path, 'utf8')),
);
if (issues.length > 0) {
  issues.forEach((issue) =>
    console.error(
      `${issue.category}: ${issue.path}:${String(issue.line)} — replace with neutral public documentation.`,
    ),
  );
  process.exitCode = 1;
} else {
  console.log(
    `Public documentation privacy check passed for ${String(tracked.length)} files.`,
  );
}
