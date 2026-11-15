#!/bin/sh
# Restore legacy archives only to a new named volume.
set -eu
umask 077
root=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd -P)
. "$root/scripts/backup-common.sh"
backup_dependencies
archive=${1:?Uso: sh scripts/restore.sh archivio.tar.gz nuovo-volume}
volume=${2:?Indica un nome volume nuovo}
case "$volume" in *[!a-zA-Z0-9_.-]*|'') exit 1;; esac
backup_lock "${BACKUP_DEPLOY_DIR:-$(pwd -P)}"
docker volume inspect "$volume" >/dev/null 2>&1 && { printf 'Il volume esiste già.\n' >&2; exit 1; }
[ ! -L "$archive" ] || exit 1
archive=$(realpath -e "$archive")
python3 "$root/scripts/vault-files.py" checksum "$archive"
parent=${BACKUP_RESTORE_WORK_DIR:-$(dirname "$archive")}
parent=$(realpath -e "$parent")
case "$parent/" in "$root/apps/web/"*|"$root/data/"*) printf 'Directory temporanea non sicura.\n' >&2; exit 1;; esac
work=$(mktemp -d "$parent/.restore-XXXXXXXXXX")
cleanup() { rc=$?; trap - EXIT HUP INT TERM; case "$work" in "$parent"/.restore-*) rm -rf --one-file-system -- "$work";; esac; exit "$rc"; }
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP
python3 "$root/scripts/vault-files.py" extract "$archive" "$work/data" 2
python3 "$root/scripts/vault-files.py" inspect "$work/data" > "$work/report.json"
image=${BACKUP_APP_IMAGE:-${APP_IMAGE:-}}
if [ -z "$image" ]; then
    current=$(docker compose ps -aq app)
    if [ -z "$current" ] || [ "$(printf '%s\n' "$current" | wc -l)" -ne 1 ]; then printf 'Impostare BACKUP_APP_IMAGE alla versione compatibile.\n' >&2; exit 1; fi
    image=$(docker inspect -f '{{.Image}}' "$current")
fi
docker image inspect "$image" >/dev/null
id=$(cat /proc/sys/kernel/random/uuid)
docker volume create --label "akai.vault.owner=$id" --label "akai.vault.project=${COMPOSE_PROJECT_NAME:-legacy}" "$volume" >/dev/null
[ "$(docker volume inspect "$volume" -f '{{index .Labels "akai.vault.owner"}}')" = "$id" ] || exit 1
needed=$(du -sk "$work/data" | awk '{print $1}')
available=$(docker run --rm --read-only --network none --cap-drop ALL --user 1000:1000 --mount "type=volume,source=$volume,target=/app/data,readonly" --entrypoint df "$image" -Pk /app/data | awk 'END {print $4}')
[ "$available" -gt "$((needed + 16384))" ] || { printf 'Spazio insufficiente sul volume nuovo.\n' >&2; exit 1; }
tar -cf "$work/data.tar" -C "$work/data" .
docker run --rm -i --read-only --network none --log-driver none --cap-drop ALL --cap-add CHOWN --cap-add DAC_OVERRIDE --cap-add FOWNER --security-opt no-new-privileges:true --user 0:0 --mount "type=volume,source=$volume,target=/app/data" --entrypoint sh "$image" -c 'tar --no-same-owner -xf - -C /app/data && chown -R 1000:1000 /app/data' < "$work/data.tar"
docker run --rm --read-only --network none --log-driver none --cap-drop ALL --security-opt no-new-privileges:true --user 1000:1000 --mount "type=volume,source=$volume,target=/app/data" --entrypoint node "$image" apps/api/dist/cli.js verify
printf 'Ripristino verificato nel NUOVO volume %s. Nessun collegamento automatico alla produzione.\n' "$volume"
