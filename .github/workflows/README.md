# Automated workflows

`ci.yml` provides read-only pull-request checks for formatting, linting, type
checking, tests, builds, dependency audit, repository cleanliness, and a
production container build-and-smoke test. On a successful push to `main`, a
separate guarded job re-smokes the exact SHA image before publishing it and
`latest` to GHCR with the ephemeral GitHub token. Pull requests never
authenticate to or publish packages.

`publish-test.yml` is a separate manual-only workflow. It validates a confirmed
repository branch, tag, or full SHA, then publishes only the exact tested
`test-sha-<full-target-sha>` and `test` tags. It never updates `latest`, and its
dedicated concurrency group cancels stale candidate publications.

See [`docs/CI.md`](../../docs/CI.md) for triggers, permissions, pinned actions,
check names, exact-image tags, test-channel procedure, and branch-protection
guidance.
