# Contributing

## Development setup

- Install dependencies with `npm install`.
- Run tests with `npm test`.
- Run lint with `npm run lint`.
- Run typecheck with `npm run typecheck`.
- Run the build with `npm run build`.

## Repository conventions

- Use `feat/`, `fix/`, `chore/`, `docs/`, or `test/` branches.
- Keep public ingest, state, WebSocket, overlay, and CLI contracts backward
  compatible.
- Do not edit generated bundles, vendored API files, or session history.
- Update `README.md` for substantial changes and `CHANGELOG.md` for all
  changes.

## Safety

- Parameterize untrusted input and use argument arrays for subprocesses.
- Obtain approval before destructive changes or dependency changes.
- Never weaken, skip, or delete tests to make them pass.
- Never commit secrets, credentials, or private user data.
- Keep pull requests in draft status until explicitly approved.
