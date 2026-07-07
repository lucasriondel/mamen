# mamen

## Dev server logs

`bun dev` (root, `turbo dev`) runs both dev servers. Each tees its output to a gitignored log file at repo root:

- `logs/server.log` — API/server (`@mamen/server`, bun --watch)
- `logs/web.log` — web frontend (`@mamen/web`, vite)

Before debugging a running-app issue: read the relevant log file first instead of starting a new server instance. Check if a server is already running (`lsof -i :<port>`) before spawning one.
