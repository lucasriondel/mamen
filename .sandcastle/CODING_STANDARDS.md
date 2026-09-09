# Coding Standards

## React / file structure

- Prefer multiple small files over one large file.
- One React component per file.
- Break large components into smaller composable subcomponents when it makes sense — the `return` of a component should not be huge. If JSX is getting long, extract logical sections into named child components.

## Dev servers / logs

- When setting up or designing a dev server (API, web, worker, etc.), pipe its stdout/stderr through `tee` into a log file (e.g. `logs/<service>.log`), gitignored, at repo root. This lets agents read server output directly without attaching to or owning the running process.
- Before debugging an issue: check whether a dev server is already running (e.g. `lsof -i :<port>` or `ps aux | grep <process>`). If one is running, read its log file first instead of starting a new instance or guessing — the answer is often already in the log.

## Style

<!-- Example:
- Use camelCase for variables and functions
- Use PascalCase for classes and types
- Prefer named exports over default exports
-->

## Testing

<!-- Example:
- Every public function must have at least one test
- Use descriptive test names that explain the expected behavior
-->

## Architecture

<!-- Example:
- Keep modules focused on a single responsibility
- Prefer composition over inheritance
-->
