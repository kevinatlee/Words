# Automated workflows

`ci.yml` provides read-only pull-request checks for formatting, linting, type
checking, tests, builds, dependency audit, repository cleanliness, and a
production container build-and-smoke test. On a successful push to `main`, a
separate guarded job re-smokes the exact SHA image before publishing it and
`latest` to GHCR with the ephemeral GitHub token. Pull requests never
authenticate to or publish packages.

See [`docs/CI.md`](../../docs/CI.md) for triggers, permissions, pinned actions,
check names, exact-image tags, and branch-protection guidance.
