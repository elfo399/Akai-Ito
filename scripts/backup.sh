#!/bin/sh
# Legacy tar.gz entry point; encrypted snapshots use memory-vault.sh.
set -eu
umask 077
root=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd -P)
. "$root/scripts/backup-common.sh"
backup_dependencies
backup_lock "${BACKUP_DEPLOY_DIR:-$(pwd -P)}"
destination=${1:-backups}
case "$destination" in *[[:cntrl:]]*) exit 1;; esac
mkdir -p "$destination"
backup_dir=$(cd "$destination" && pwd -P)
case "$backup_dir/" in /|"$root/apps/web/"*|"$root/data/"*) printf 'Destinazione non sicura\n' >&2; exit 1;; esac
[ "$(stat -c %a "$backup_dir")" = 700 ] || { printf 'Destinazione privata richiesta (700).\n' >&2; exit 1; }
container=$(docker compose ps -aq app)
[ -n "$container" ] && [ "$(printf '%s\n' "$container" | wc -l)" -eq 1 ] || exit 1
image=$(docker inspect -f '{{.Image}}' "$container")
volume=$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/app/data"}}{{.Name}}{{end}}{{end}}' "$container")
running=$(docker inspect -f '{{.State.Running}}' "$container")
id=$(cat /proc/sys/kernel/random/uuid)
helper="akai-archive-$id"
restart=false
capture_pid=''
cleanup() {
    rc=$?
    trap - EXIT HUP INT TERM
    [ -z "$capture_pid" ] || kill -TERM "$capture_pid" 2>/dev/null || true
    if [ "$(docker inspect -f '{{index .Config.Labels "akai.backup.helper"}}' "$helper" 2>/dev/null || true)" = "$helper" ]; then docker rm -f "$helper" >/dev/null 2>&1 || true; fi
    [ -z "$capture_pid" ] || wait "$capture_pid" 2>/dev/null || true
    if [ "$restart" = true ]; then
        docker start "$container" >/dev/null || rc=1
        n=0
        while [ "$n" -lt 180 ]; do
            status=$(docker inspect -f '{{.State.Running}} {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container") || { rc=1; break; }
            case "$status" in 'true healthy'|'true none') break;; esac
            n=$((n+1)); sleep 1
        done
        [ "$n" -lt 180 ] || rc=1
    fi
    exit "$rc"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP
if [ "$running" = true ]; then restart=true; docker stop -t 30 "$container" >/dev/null; fi
backup_archive "$image" "$volume" "$backup_dir/akai-ito-$(date -u +%Y%m%dT%H%M%SZ)-$id.tar.gz" "$helper" "$root/scripts/vault-files.py" &
capture_pid=$!
wait "$capture_pid"
capture_pid=''
