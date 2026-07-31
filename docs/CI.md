# Continuous integration

Stage 3.1 provides independent GitHub-hosted verification for the Words repository.
The workflow supplements local review; it does not replace running the
repository checks before requesting review.

## Workflow and triggers

The workflow is [`CI`](../.github/workflows/ci.yml). It runs:

- for pull requests whose base branch is `main`;
- after pushes to `main`;
- when manually dispatched after the workflow exists on GitHub’s default
  branch.

It does not use `pull_request_target`, scheduled execution, external webhooks,
or chained workflows. Pull-request code runs with read-only repository
permission and without persisted Git credentials.

The expected GitHub check names are stable:

- `CI / Quality`
- `CI / Dependency audit`

These names should not be casually changed because they are the recommended
future branch-protection checks.

## Quality job

The `Quality` job runs on `ubuntu-latest`, has a 20-minute timeout, and sets
`CI=true`. It:

1. checks out the repository without persisting credentials;
2. installs Node.js 24 and enables the official npm cache keyed from
   `package-lock.json`;
3. prints the exact hosted Node.js and npm versions;
4. runs `npm ci`;
5. verifies the committed production dictionary, notice, manifest, generated
   distribution data, and client-exclusion boundary without network access;
6. checks formatting;
7. runs ESLint;
8. type-checks every workspace;
9. runs every test;
10. builds the client and verifies server, engine, and game-data boundaries;
11. repeats offline verification against the emitted client bundle, checking
    the package identifier, dictionary checksum, representative sentinels, and
    absence of symbolic links;
12. verifies that the commands left no tracked changes or untracked,
    non-ignored files.

Each verification command has its own step so a failure is visible without
searching through one combined shell command. The long-running development
server is intentionally not started in CI.

## Dependency audit job

The separate `Dependency audit` job runs on `ubuntu-latest` with a 10-minute
timeout. It evaluates the committed lockfile with:

```bash
npm audit --audit-level=high
```

High and critical findings fail the job. Low and moderate findings remain
visible in the log but do not fail this specified threshold. Audit failures are
not ignored or converted into success.

## Reproducibility and action pinning

Hosted jobs use Node.js 24. Dependencies are installed with `npm ci`, so the
committed `package-lock.json` is authoritative and an inconsistent manifest or
lockfile fails instead of being rewritten.

Only official actions from GitHub’s `actions` organization are used. Release
tags were resolved through GitHub and pinned to immutable full commits:

- `actions/checkout` v6.0.2:
  `de0fac2e4500dabe0009e67214ff5f5447ce83dd`
- `actions/setup-node` v6.4.0:
  `48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e`

Human-readable versions remain as comments beside the pins. No third-party
marketplace action or downloaded shell installer is used.

## Permissions and security boundary

The workflow grants only:

```yaml
permissions:
  contents: read
```

It has no secrets, write token, persisted checkout credential, artifact upload,
package publishing, release, deployment, or external-service step. It cannot
push commits, modify pull requests, approve reviews, or change repository
settings.

`pull_request_target` is deliberately excluded. That event can combine
privileged base-repository context with untrusted pull-request input. The
ordinary `pull_request` event provides the code-under-review execution needed
here with the explicit read-only permission.

The workflow necessarily executes the repository’s existing package scripts
from the proposed revision. Those scripts therefore remain part of code review;
CI does not grant them write credentials or secrets.

## Concurrency

The concurrency group combines the workflow name with the pull-request number,
falling back to the Git ref for pushes and manual dispatches. A newer run in
the same group cancels its older in-progress run. Different pull requests and
different refs do not cancel one another.

## Running and investigating CI

After the workflow is merged into the default branch, a maintainer can start a
manual run from the GitHub Actions page by selecting **CI** and **Run
workflow**. The equivalent authenticated command is:

```bash
gh workflow run ci.yml --ref main
```

For a pull request:

```bash
gh pr checks <PR_NUMBER>
gh run list --branch <BRANCH>
gh run view <RUN_ID>
gh run view <RUN_ID> --log-failed
```

GitHub’s run page also links each failed step to its complete log. Fix the
underlying workflow or repository problem and push a normal follow-up commit;
do not bypass, ignore, or hide the failure.

## Branch protection

Stage 3.1 does not modify branch protection, repository rulesets, Actions
permissions, merge settings, or administrator bypass settings. After this
workflow is merged and both names have appeared successfully on a real pull
request or `main` run, a separate reviewed settings task should require:

- `CI / Quality`
- `CI / Dependency audit`

Waiting for real successful check names avoids configuring a required context
that GitHub has never observed.

## Known limitations

- Hosted runners and the npm registry are external availability dependencies.
- The audit evaluates the current npm advisory service and can change as new
  advisories are published.
- `ubuntu-latest` is a GitHub-managed image label; logged tool versions help
  diagnose image changes.
- This workflow does not run the long-lived development servers, perform
  browser end-to-end testing, publish artifacts, deploy software, build
  containers, or change repository settings.
- Stage 4A data verification does not rebuild ESDB in CI. The pinned source
  reproduction command remains an explicit reviewed maintenance operation.
- Browser end-to-end gameplay, physical QR scanning, and production deployment
  remain outside hosted CI. Component tests and the production build cover the
  local SVG renderer.
