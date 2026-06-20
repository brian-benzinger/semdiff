## CI/CD

Gaps remaining after the least-privilege permissions pass (2026-06-19):

- [x] Pin third-party GitHub Actions to commit SHAs (`actions/checkout`, `actions/setup-node`, `github/codeql-action/*`) so a tag-move attack cannot inject malicious steps.
- [x] Add a Dependabot config (`.github/dependabot.yml`) to keep GitHub Actions and npm devDependencies up to date automatically.

## Security

- [ ] Resolve esbuild low-severity advisory (GHSA-g7r4-m6w7-qqqr): esbuild's dev-server file-read issue cannot be fixed via `npm audit fix` because it is pinned by tsup. Wait for a tsup release that depends on esbuild ≥ 0.29.0, then update tsup.
