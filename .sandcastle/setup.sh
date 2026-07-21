#!/usr/bin/env bash
set -euo pipefail

# Sandcastle setup: install dependency, build docker image, create the GitHub
# issue label, and register the run scripts.
#
# This script lives in .sandcastle/ inside a host repo. All work must target the
# host repo root (parent of .sandcastle/), not wherever the script was invoked
# from. cd to the root so bun add / package.json injection land there.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

# 1. Install Sandcastle and zod as dev dependencies (creates package.json if absent).
bun add -d @ai-hero/sandcastle zod

# 2. Build the Sandcastle docker image.
bunx @ai-hero/sandcastle docker build-image

# 3. Create the "ready-for-agent" issue label on GitHub (idempotent via --force).
#    The planner phase reads issues carrying this label.
gh label create "ready-for-agent" \
  --description "Issue is ready to be picked up by the Sandcastle plan implement review" \
  --color "ff7300" \
  --force

# 4. Verify the run scripts exist in package.json; create any that are missing.
bun --eval '
  const path = "package.json";
  const pkg = await Bun.file(path).json();
  pkg.scripts ??= {};

  const scripts = {
    "sandcastle:implement": "bun .sandcastle/implement/index.ts",
    "sandcastle:implement-review":
      "bun .sandcastle/implement-review/index.ts",
  };

  let changed = false;
  for (const [name, command] of Object.entries(scripts)) {
    if (pkg.scripts[name] === command) {
      console.log(`Script "${name}" already present.`);
      continue;
    }
    pkg.scripts[name] = command;
    changed = true;
    console.log(`Registered script "${name}".`);
  }

  if (changed) {
    await Bun.write(path, JSON.stringify(pkg, null, 2) + "\n");
  }
'

echo "Sandcastle setup complete."
echo
echo "Next step: configure .sandcastle/.env"
echo "Create a GitHub personal access token here:"
echo "  https://github.com/settings/personal-access-tokens/new"
echo "Grant these permissions: Issues (read & write) + Metadata (read)."
echo "Then add the token to .sandcastle/.env"
