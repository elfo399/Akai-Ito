#!/bin/sh
# Shared by legacy archives, Memory Vault and Jenkins. Functions only; no nested lock.
backup_dependencies() {
    for dependency in python3 tar gzip sha256sum flock realpath stat mktemp du df awk ln; do
        command -v "$dependency" >/dev/null || { printf 'Prerequisito backup assente: %s\n' "$dependency" >&2; return 1; }
    done
}
backup_lock() {
    [ -d "$1" ] && [ "$1" != / ] && [ ! -L "$1/.deploy.lock" ] || return 1
    command -v flock >/dev/null || return 1
    exec 9>"$1/.deploy.lock"
    flock -n 9 || { printf 'Volume occupato da backup/deploy.\n' >&2; return 75; }
}

backup_capture() {
    # $1 immutable app image; $2 discovered named volume; $3 archive; $4 helper name.
    # Caller has acquired .deploy.lock and stopped every application writer.
    case "$2" in ''|*[!a-zA-Z0-9_.-]*) return 1;; esac
    docker run --rm --name "$4" --label "akai.backup.helper=$4" --read-only --network none --log-driver none \
        --cap-drop ALL --security-opt no-new-privileges:true --user 1000:1000 \
        --mount "type=volume,source=$2,target=/app/data,readonly" --entrypoint tar \
        "$1" -cf - -C /app/data . > "$3"
    [ -s "$3" ]
}

backup_archive() (
    # Legacy tar.gz and pre-deploy backup share capture + validation. No retention.
    set -eu
    umask 077
    image=$1; volume=$2; archive=$3; helper=$4; files_tool=$5
    [ ! -e "$archive" ] && [ ! -e "$archive.sha256" ] || return 1
    parent=$(cd "$(dirname "$archive")" && pwd -P)
    work=$(mktemp -d "$parent/.archive-XXXXXXXXXX")
    # shellcheck disable=SC2317
    cleanup_archive() {
        rc=$?
        trap - EXIT HUP INT TERM
        case "$work" in "$parent"/.archive-*) rm -rf --one-file-system -- "$work";; esac
        exit "$rc"
    }
    trap cleanup_archive EXIT
    trap 'exit 130' INT
    trap 'exit 143' TERM HUP
    bytes=$(docker run --rm --network none --log-driver none --read-only --cap-drop ALL --user 1000:1000 --mount "type=volume,source=$volume,target=/app/data,readonly" --entrypoint du "$image" -sk /app/data | awk '{print $1}')
    free=$(df -Pk "$parent" | awk 'END {print $4}')
    [ "$free" -gt "$((bytes * 3 + 16384))" ] || return 1
    backup_capture "$image" "$volume" "$work/data.tar" "$helper"
    python3 "$files_tool" extract "$work/data.tar" "$work/data"
    python3 "$files_tool" inspect "$work/data" >/dev/null
    name=$(basename "$archive")
    gzip -c "$work/data.tar" > "$work/$name"
    gzip -t "$work/$name"
    (cd "$work" && sha256sum "$name" > "$name.sha256")
    ln "$work/$name" "$archive"
    if ! ln "$work/$name.sha256" "$archive.sha256"; then rm -- "$archive"; return 1; fi
    printf 'Archivio verificato: %s\n' "$archive"
)
