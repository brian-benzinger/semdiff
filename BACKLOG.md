## CI/CD

Gaps remaining after the least-privilege permissions pass (2026-06-19):

- [ ] Pin third-party GitHub Actions to commit SHAs (`actions/checkout`, `actions/setup-node`, `github/codeql-action/*`) so a tag-move attack cannot inject malicious steps.
- [ ] Add a Dependabot config (`.github/dependabot.yml`) to keep GitHub Actions and npm devDependencies up to date automatically.
