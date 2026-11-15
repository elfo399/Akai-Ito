#!/usr/bin/env bash
# Called only by the UUID-scoped synthetic Docker suite, against a separate test repo.
set -Eeuo pipefail
umask 077
ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
BASE=${1:?QA temporary directory}
[[ "$BASE" == /tmp/akai-vault-qa-* && -d "$BASE" ]] || exit 1
CONFIG=${MEMORY_VAULT_CONFIG:?QA config}
cp "$CONFIG" "$BASE/retention-original.env"
trap 'cp "$BASE/retention-original.env" "$CONFIG"' EXIT
# shellcheck disable=SC1090
. "$CONFIG"
target="$BASE/retention-target"; state="$BASE/retention-state"; seed="$BASE/retention-source"
mkdir "$target" "$state" "$seed"
printf 'synthetic retention fixture\n' > "$seed/entry"
printf '\nBACKUP_TARGET_DIR=%q\nBACKUP_STATE_DIR=%q\n' "$target" "$state" >> "$CONFIG"
export RESTIC_REPOSITORY="$target/repository" RESTIC_PASSWORD_FILE RESTIC_CACHE_DIR="$state/cache" TZ=UTC
vault() { bash "$ROOT/scripts/memory-vault.sh" "$@"; }
vault init > "$BASE/retention-init.json"
PROJECT=$COMPOSE_PROJECT_NAME
tag=akai-ito-memory-vault-v1
ptag="akai-project:$PROJECT"
count=0
pass() { count=$((count+1)); printf 'PASS retention: %s\n' "$1"; }
cd "$seed"
for date in 2026-04-01 2026-05-01 2026-06-01 2026-07-01 2026-08-01 2026-09-01 2026-10-04 2026-10-11 2026-10-18 2026-10-25 2026-11-{01..15}; do
    restic --quiet backup . --time "$date 03:30:00" --host "$PROJECT" --tag "$tag" --tag "$ptag" --tag vault-verified --json >/dev/null
done
# Unmanaged, another project, and incomplete backups must never be forgotten.
restic --quiet backup . --time '2025-01-01 03:30:00' --host "$PROJECT" --tag historical --json >/dev/null
restic --quiet backup . --time '2025-02-01 03:30:00' --host "$PROJECT" --tag "$tag" --tag akai-project:someone-else --tag vault-verified --json >/dev/null
restic --quiet backup . --time '2025-03-01 03:30:00' --host "$PROJECT" --tag "$tag" --tag "$ptag" --tag vault-pending --json >/dev/null
# Deterministic retention clock, independent of the day the suite is run.
mkdir "$BASE/retention-bin"
restic_binary=$(command -v restic)
# shellcheck disable=SC2016
printf '#!/usr/bin/env bash\nfor arg in "$@"; do if [[ "$arg" == backup ]]; then exec %q "$@" --time "2026-11-15 23:30:00"; fi; done\nexec %q "$@"\n' "$restic_binary" "$restic_binary" > "$BASE/retention-bin/restic"
chmod 700 "$BASE/retention-bin/restic"
PATH="$BASE/retention-bin:$PATH" vault backup manual > "$BASE/retention-backup.json"
latest=$(jq -er .snapshotId "$BASE/retention-backup.json")
before=$(restic --quiet snapshots --json | jq length)
vault retention --dry-run > "$BASE/retention-plan.json"
jq -e 'type=="array"' "$BASE/retention-plan.json" >/dev/null
[[ $(restic --quiet snapshots --json | jq length) == "$before" ]]
pass 'dry-run reports the plan without deleting any snapshot'
vault retention --apply
restic --quiet snapshots --json > "$BASE/retained.json"
for day in {09..15}; do jq -e --arg date "2026-11-$day" 'any(.[]; .time|startswith($date))' "$BASE/retained.json" >/dev/null; done
pass 'the latest seven daily dates are kept'
jq -e 'any(.[]; .time|startswith("2026-10-25"))' "$BASE/retained.json" >/dev/null
pass 'weekly representatives survive beyond daily history'
jq -e 'any(.[]; .time|startswith("2026-06-01")) and all(.[]; (.time|startswith("2026-05-01")|not)) and all(.[]; (.time|startswith("2026-04-01")|not))' "$BASE/retained.json" >/dev/null
pass 'six monthly periods are kept and older managed snapshots removed'
jq -e 'any(.[]; .tags|index("historical")) and any(.[]; .tags|index("akai-project:someone-else")) and any(.[]; .tags|index("vault-pending"))' "$BASE/retained.json" >/dev/null
pass 'unmanaged history, other projects and incomplete candidates are untouched'
jq -e --arg id "$latest" 'any(.[]; .id==$id)' "$BASE/retained.json" >/dev/null
pass 'the current verified successful backup survives pruning'
# Even with every configurable period disabled, the mandatory keep-last 1 protects it.
printf '\nBACKUP_KEEP_DAILY=0\nBACKUP_KEEP_WEEKLY=0\nBACKUP_KEEP_MONTHLY=0\n' >> "$CONFIG"
vault retention --apply
[[ $(vault list | jq .count) == 1 ]]
pass 'keep-last 1 prevents deletion of the only valid backup'
jq -nc --argjson checks "$count" '{checks:$checks}' > "$BASE/retention-result.json"
