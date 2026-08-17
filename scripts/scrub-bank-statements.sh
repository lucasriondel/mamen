#!/usr/bin/env bash
#
# Scrub the tracked bank statement out of every commit (issue #108).
#
# WHAT LEAKED
#
#   A real Green-Got export — live IBANs, counterparty names, amounts and
#   payment references — was committed at the repo root under the bank's own
#   download filename, and the import fixture at
#   packages/web/src/features/import/__fixtures__/green-got-sample.csv was a
#   byte-identical copy of it. Both are the same git blob:
#
#       428eecabb1b690b415e06f76315fc218314c1481
#
#   Alongside them, `feat: add biome` also committed a dev SQLite database.
#   Its .db and .db-shm blobs hold schema only, but packages/server/mamen.db-wal
#   is 3 MB of uncheckpointed writes carrying the same transactions as the CSV:
#   counterparty names, amounts, dates. It is a trace of the same statement, so
#   it goes with it. Nothing builds from it — it was deleted from the tree in
#   `feat(api): cutover` and .gitignore has covered mamen.db* since.
#
# WHAT THIS DOES
#
#   Two different removals, because the two files deserve different fates:
#
#     --invert-paths           drops the paths entirely, for the root statement
#                              and the three database files. Nothing should ever
#                              live at those paths.
#
#     --strip-blobs-with-ids   drops the leaked *content* wherever it appears,
#                              which is how the fixture path survives: the
#                              synthetic replacement is a different blob, so it
#                              stays, while the copy of the statement that used
#                              to sit there is removed from the commits that
#                              carried it.
#
#   Deleting the file in a new commit would not help — it stays readable in
#   every earlier commit of the published history, which is the whole point.
#
#   The cost, stated plainly: 269 commits keep green-got.test.ts while losing
#   the fixture it reads, so that one test file fails to collect if you check
#   them out. filter-repo could instead *replace* the blob with the synthetic
#   CSV and leave every commit collectable — but the old test asserts against
#   the old rows, so it would fail anyway, one line further down. Deleting says
#   "a file was here and it was removed"; substituting would write the record
#   as though the fixture had always been synthetic, which is not what
#   happened.
#
# HOW TO RUN IT
#
#   git-filter-repo is required and is not vendored here:
#
#       pip install git-filter-repo        # or: brew install git-filter-repo
#
#   Run it against a *fresh clone*, not a working checkout — filter-repo rewrites
#   every ref in the repo and there is no undo:
#
#       git clone git@github.com:lucasriondel/mamen.git mamen-scrub
#       cd mamen-scrub
#       ./scripts/scrub-bank-statements.sh --yes
#
#   It verifies itself and prints the push commands; it does not push. That is
#   deliberate. This is a history rewrite on the default branch: every existing
#   clone and every open branch has to be re-based onto the result, and an open
#   PR gets orphaned by it. Confirm the branch list and the open PRs first, and
#   coordinate before pushing.
#
#   --verify on its own checks the criteria and rewrites nothing, which is how
#   you confirm a clone came down clean afterwards.

set -euo pipefail

# ── what is being removed ────────────────────────────────────────────────────

# The leaked blob, shared by the root statement and the fixture that copied it.
LEAKED_BLOB="428eecabb1b690b415e06f76315fc218314c1481"

# Its SHA-256, used to recognise a copy under any name without naming what is
# in it. Matches src/test/bank-statement-scrubbed.test.ts.
LEAKED_SHA256="0f091c60e3d03e94cf640660d883cff8dcd323ad63fdf6c9719bad81caaef871"

# Its size in bytes. Same content means same size, so this narrows the blob scan
# below from every object in the repo to the handful worth hashing.
LEAKED_SIZE=11123

# Paths that must not exist in any commit.
STATEMENT="relevé_de_comptes_du_01.01.2026_au_31.01.2026.csv"
DOOMED_PATHS=(
	"$STATEMENT"
	"packages/server/mamen.db"
	"packages/server/mamen.db-shm"
	"packages/server/mamen.db-wal"
)

# The path that survives, carrying different content.
FIXTURE="packages/web/src/features/import/__fixtures__/green-got-sample.csv"

# ── arguments ────────────────────────────────────────────────────────────────

MODE="rewrite"
case "${1:-}" in
	--yes) MODE="rewrite" ;;
	--verify) MODE="verify" ;;
	*)
		cat >&2 <<-EOF
			usage: $0 --yes | --verify

			  --yes      rewrite this repository's history, then verify
			  --verify   check the criteria only; rewrite nothing

			This rewrites every ref and cannot be undone. Run it on a fresh clone.
			See the header of this file.
		EOF
		exit 2
		;;
esac

cd "$(dirname "$0")/.."

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
fail() { printf '  \033[31mFAIL\033[0m  %s\n' "$*"; FAILED=1; }
pass() { printf '  \033[32mok\033[0m    %s\n' "$*"; }

# ── rewrite ──────────────────────────────────────────────────────────────────

if [ "$MODE" = "rewrite" ]; then
	command -v git-filter-repo >/dev/null 2>&1 || {
		echo "git-filter-repo is not on PATH — see the header of this file." >&2
		exit 1
	}

	[ -z "$(git status --porcelain)" ] || {
		echo "The working tree is dirty. Rewriting history over uncommitted work" >&2
		echo "loses it. Commit or stash first." >&2
		exit 1
	}

	BEFORE="$(git rev-list --all --count)"
	say "Rewriting $BEFORE commits…"

	BLOBS="$(mktemp)"
	trap 'rm -f "$BLOBS"' EXIT
	echo "$LEAKED_BLOB" >"$BLOBS"

	PATH_ARGS=()
	for path in "${DOOMED_PATHS[@]}"; do PATH_ARGS+=(--path "$path"); done

	# One pass. --invert-paths inverts only the --path filters;
	# --strip-blobs-with-ids is a separate blob filter and composes with them,
	# which is what lets the fixture path outlive the blob that was at it.
	git filter-repo --force \
		--invert-paths "${PATH_ARGS[@]}" \
		--strip-blobs-with-ids "$BLOBS"

	AFTER="$(git rev-list --all --count)"
	say "Rewrote $BEFORE commits into $AFTER."

	# filter-repo drops `origin` so a rewrite cannot be pushed by reflex.
	cat <<-EOF

		History is rewritten locally. Nothing has been pushed.

		Before you push: confirm the branch list and the open PRs. A rewrite
		orphans an open PR, and every existing clone has to be re-based onto the
		result (git fetch && git rebase --onto origin/main <old-base> <branch>).

		When you have coordinated:

		    git remote add origin git@github.com:lucasriondel/mamen.git
		    git push --force origin --all
		    git push --force origin --tags

		Then re-verify from a clean clone:

		    git clone git@github.com:lucasriondel/mamen.git /tmp/mamen-check
		    /tmp/mamen-check/scripts/scrub-bank-statements.sh --verify
	EOF
fi

# ── verify ───────────────────────────────────────────────────────────────────

FAILED=0
say "Verifying…"

# Criterion: `git log --all --full-history -- 'relevé_de_comptes*.csv'` returns
# nothing. Checked as the issue writes it, by glob, so a sibling month would be
# caught too.
if [ -z "$(git log --all --full-history --oneline -- 'relev*_de_compte*.csv')" ]; then
	pass "no commit anywhere touches a statement CSV"
else
	fail "a statement CSV is still reachable in history"
fi

# Criterion: the file is absent from the working tree.
if [ -e "$STATEMENT" ]; then
	fail "the statement is still in the working tree"
else
	pass "the statement is absent from the working tree"
fi

# The database files, which carry the same transactions.
for path in "${DOOMED_PATHS[@]:1}"; do
	if [ -z "$(git log --all --full-history --oneline -- "$path")" ]; then
		pass "no commit touches $path"
	else
		fail "$path is still reachable in history"
	fi
done

# The fixture path survives — with different content. A rewrite that took the
# path out with the blob would pass every check above and leave the parser
# untestable, so this is asserted rather than assumed.
if git cat-file -e "HEAD:$FIXTURE" 2>/dev/null; then
	pass "the synthetic fixture survived the rewrite"
else
	fail "the fixture path was removed along with the leaked blob"
fi

# The real check, and the one the criteria only imply: no *reachable object* in
# this repository is the statement, whatever path it sits at. Hashing beats
# matching the blob id — a re-add through a different route is a different blob
# id but the same bytes. Only blobs of the statement's exact size can be it, so
# the scan hashes those rather than all ~5000 objects.
say "Scanning every reachable blob…"

if command -v sha256sum >/dev/null 2>&1; then
	sha256() { sha256sum | cut -d' ' -f1; }
else
	sha256() { shasum -a 256 | cut -d' ' -f1; }
fi

OFFENDERS=""
while read -r object; do
	if [ "$(git cat-file blob "$object" | sha256)" = "$LEAKED_SHA256" ]; then
		OFFENDERS="$OFFENDERS $object"
	fi
done < <(
	git rev-list --objects --all |
		cut -d' ' -f1 |
		git cat-file --batch-check='%(objectname) %(objecttype) %(objectsize)' |
		awk -v size="$LEAKED_SIZE" '$2 == "blob" && $3 == size { print $1 }'
)

if [ -z "$OFFENDERS" ]; then
	pass "no reachable blob is the statement"
else
	fail "the statement survives as:$OFFENDERS"
fi

if [ "$FAILED" -eq 0 ]; then
	say "Clean. $(git rev-list --all --count) commits reachable."
else
	say "Not clean — see the failures above."
	exit 1
fi
