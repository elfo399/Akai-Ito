#!/usr/bin/env bash
# Linux operator CLI. Never sources the application .env and never runs migrations.
set -Eeuo pipefail
umask 077
ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
# shellcheck source=backup-common.sh
. "$ROOT/scripts/backup-common.sh"
FILES="$ROOT/scripts/vault-files.py"
CONFIG=${MEMORY_VAULT_CONFIG:-/etc/akai-ito/backup.env}
OP=${1:-status}; shift || true
CHILD=''; HELPER=''; STAGE=''; ATTEMPT=false; LOCKED=false; PHASE=configuration; SNAPSHOT=''; SOURCE_BYTES=0; ADDED_BYTES=0
RUN_ID=$(cat /proc/sys/kernel/random/uuid)
STARTED=$(date -u +%Y-%m-%dT%H:%M:%S.%NZ)

fail() { PHASE=$1; printf '{"event":"memory_vault_error","phase":"%s"}\n' "$PHASE" >&2; exit 1; }
private_file() {
    [[ -f "$1" && ! -L "$1" ]] || return 1
    local mode owner
    mode=$(stat -c %a -- "$1"); owner=$(stat -c %u -- "$1")
    (( (8#$mode & 077) == 0 )) && [[ "$owner" == "$EUID" || "$owner" == 0 ]]
}
private_dir() {
    [[ -d "$1" && ! -L "$1" && -w "$1" ]] || return 1
    local mode
    mode=$(stat -c %a -- "$1")
    (( (8#$mode & 077) == 0 ))
}
path_ok() { [[ "$1" == /* && "$1" != / && "$1" != *[$'\n\r\t,']* ]]; }
for cmd in python3 jq flock docker realpath stat df mountpoint findmnt restic; do command -v "$cmd" >/dev/null || fail missing_dependency; done
private_file "$CONFIG" || fail unsafe_configuration
# Trusted operator configuration, not user input; keep it outside Git, mode 600.
# shellcheck disable=SC1090
. "$CONFIG"
[[ -z ${RESTIC_PASSWORD:-} && -z ${RESTIC_PASSWORD_COMMAND:-} ]] || fail password_file_required
unset RESTIC_PASSWORD RESTIC_PASSWORD_COMMAND RESTIC_REPOSITORY_FILE
: "${BACKUP_DEPLOY_DIR:?Configure BACKUP_DEPLOY_DIR}" "${BACKUP_TARGET_DIR:?Configure BACKUP_TARGET_DIR}" "${RESTIC_PASSWORD_FILE:?Configure RESTIC_PASSWORD_FILE}"
PROJECT=${COMPOSE_PROJECT_NAME:-akai-ito}
[[ "$PROJECT" =~ ^[a-z0-9][a-z0-9_-]+$ ]] || fail invalid_project
if ! path_ok "$BACKUP_DEPLOY_DIR" || [[ ! -d "$BACKUP_DEPLOY_DIR" ]]; then fail invalid_deploy_directory; fi
BACKUP_DEPLOY_DIR=$(realpath -e -- "$BACKUP_DEPLOY_DIR")
path_ok "$BACKUP_TARGET_DIR" || fail invalid_target
STATE=${BACKUP_STATE_DIR:-$BACKUP_DEPLOY_DIR/.memory-vault}
path_ok "$STATE" || fail invalid_state
[[ ! -L "$STATE" ]] || fail unsafe_state
mkdir -p -- "$STATE/attempts" "$STATE/logs"
STATE=$(realpath -e -- "$STATE")
if ! private_dir "$STATE" || ! private_dir "$STATE/attempts" || ! private_dir "$STATE/logs"; then fail unsafe_state; fi
case "$STATE/" in "$ROOT/apps/web/"*|"$ROOT/data/"*) fail public_or_live_state;; esac
LOG="$STATE/logs/$RUN_ID.log"
JOURNAL="$STATE/restart-required.json"

record() {
    jq -nc --arg id "$RUN_ID" --arg start "$STARTED" --arg finish "$(date -u +%FT%TZ)" \
        --arg operation "$OP" --arg kind "${KIND:-manual}" --arg result "$1" --arg phase "$PHASE" \
        --arg snapshot "$SNAPSHOT" --arg image "${IMAGE:-}" --arg repository "${REPO_ID:-}" --argjson size "$SOURCE_BYTES" --argjson added "$ADDED_BYTES" \
        '{id:$id,startedAt:$start,finishedAt:$finish,operation:$operation,kind:$kind,result:$result,phase:$phase,snapshotId:$snapshot,appImage:$image,repositoryId:$repository,dataBytes:$size,addedBytes:$added}' \
        | python3 "$FILES" state "$STATE/attempts" "$RUN_ID"
}
job() {
    "$@" <&0 9>&- & CHILD=$!
    local result=0
    wait "$CHILD" || result=$?
    CHILD=''
    return "$result"
}
wait_healthy() {
    local i status
    for ((i=0;i<${BACKUP_HEALTH_TIMEOUT:-180};i++)); do
        status=$(docker inspect -f '{{.State.Running}} {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$1") || return 1
        case "$status" in 'true healthy'|'true none') return 0;; 'false '*|'true unhealthy') return 1;; esac
        sleep 1
    done
    return 1
}
recover() {
    [[ -e "$JOURNAL" || -L "$JOURNAL" ]] || return 0
    private_file "$JOURNAL" || return 1
    local container volume image actual
    container=$(jq -er '.container' "$JOURNAL"); volume=$(jq -er '.volume' "$JOURNAL"); image=$(jq -er '.image' "$JOURNAL")
    [[ "$container" =~ ^[a-f0-9]{64}$ && "$volume" =~ ^[a-zA-Z0-9_.-]+$ && "$image" =~ ^sha256:[a-f0-9]{64}$ ]] || return 1
    actual=$(docker inspect "$container") || return 1
    jq -e --arg p "$PROJECT" --arg v "$volume" --arg i "$image" \
        'length==1 and .[0].Image==$i and .[0].Config.Labels["com.docker.compose.project"]==$p and .[0].Config.Labels["com.docker.compose.service"]=="app" and any(.[0].Mounts[]; .Destination=="/app/data" and .Type=="volume" and .Name==$v)' \
        <<< "$actual" >/dev/null || return 1
    docker start "$container" >>"$LOG" 2>&1 || return 1
    wait_healthy "$container" || return 1
    rm -- "$JOURNAL"
}
cleanup() {
    local result=$?
    trap - EXIT INT TERM HUP
    set +e
    if [[ -n "$CHILD" ]]; then kill -TERM "$CHILD" 2>/dev/null || true; wait "$CHILD" 2>/dev/null || true; fi
    if [[ -n "$HELPER" && "$(docker inspect -f '{{index .Config.Labels "akai.backup.helper"}}' "$HELPER" 2>/dev/null || true)" == "$HELPER" ]]; then docker rm -f "$HELPER" >>"$LOG" 2>&1 || true; fi
    if [[ "$LOCKED" == true && -e "$JOURNAL" ]]; then recover || { result=1; PHASE=restart_failed; }; fi
    if [[ -n "$STAGE" && -f "$STAGE/.vault-owner" && "$(cat "$STAGE/.vault-owner")" == "$RUN_ID" ]]; then
        # Only our mktemp child, on the same canonical private target.
        case "$(realpath -e -- "$STAGE")" in "$TARGET"/.staging/vault-*) rm -rf --one-file-system -- "$STAGE" || { result=1; PHASE=stage_cleanup_failed; };; esac
    fi
    if [[ "$ATTEMPT" == true ]]; then
        if (( result == 0 )); then record success || result=1; else record failed || true; fi
    fi
    if (( result != 0 )); then
        printf '{"event":"memory_vault_failed","id":"%s","phase":"%s","exitCode":%s}\n' "$RUN_ID" "$PHASE" "$result" >&2
        # Integration contract only. No notification transport is configured.
        if [[ -n ${BACKUP_FAILURE_HOOK:-} ]] && private_file "$BACKUP_FAILURE_HOOK" && [[ -x "$BACKUP_FAILURE_HOOK" ]]; then
            VAULT_RUN_ID=$RUN_ID VAULT_OPERATION=$OP VAULT_EXIT_CODE=$result "$BACKUP_FAILURE_HOOK" >>"$LOG" 2>&1 || true
        fi
    fi
    exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP
if [[ "$OP" == status ]]; then python3 "$FILES" status "$STATE"; exit 0; fi
ATTEMPT=true
record running
PHASE=lock
backup_lock "$BACKUP_DEPLOY_DIR" || exit $?
LOCKED=true
PHASE=recover
recover || fail restart_failed
if [[ "$OP" == recover ]]; then ATTEMPT=false; printf '{"recovered":true}\n'; exit 0; fi
if [[ "$OP" == status ]]; then ATTEMPT=false; python3 "$FILES" status "$STATE"; exit 0; fi

PHASE=target
[[ -d "$BACKUP_TARGET_DIR" && ! -L "$BACKUP_TARGET_DIR" ]] || fail target_unavailable
TARGET=$(realpath -e -- "$BACKUP_TARGET_DIR")
private_dir "$TARGET" || fail target_permissions
case "$STATE/" in "$TARGET/"*) fail state_must_be_local_and_separate;; esac
case "$TARGET/" in "$ROOT/"*|"$STATE/"*) fail target_inside_source_or_state;; esac
REQUIRE_MOUNT=${BACKUP_REQUIRE_MOUNT:-true}
[[ "$REQUIRE_MOUNT" == true || "$REQUIRE_MOUNT" == false ]] || fail invalid_mount_policy
if [[ "$REQUIRE_MOUNT" == true ]]; then
    : "${BACKUP_MOUNT_POINT:?Configure actual external mount point}"
    if ! path_ok "$BACKUP_MOUNT_POINT" || ! mountpoint -q -- "$BACKUP_MOUNT_POINT"; then fail mount_missing; fi
    MOUNT=$(realpath -e -- "$BACKUP_MOUNT_POINT")
    [[ "$TARGET/" == "$MOUNT/"* ]] || fail target_outside_mount
    [[ "$(findmnt -n -o TARGET -T "$TARGET")" == "$MOUNT" ]] || fail unexpected_mount
    if [[ -n ${BACKUP_EXPECTED_SOURCE:-} ]]; then
        [[ "$(findmnt -n -o SOURCE -T "$TARGET")" == "$BACKUP_EXPECTED_SOURCE" ]] || fail wrong_mount_source
    fi
elif [[ ${BACKUP_TEST_MODE:-false} != true ]]; then fail external_mount_required; fi
for setting in BACKUP_KEEP_DAILY BACKUP_KEEP_WEEKLY BACKUP_KEEP_MONTHLY BACKUP_MIN_FREE_MB BACKUP_HEALTH_TIMEOUT; do
    value=${!setting:-}; [[ -z "$value" || "$value" =~ ^[0-9]{1,7}$ ]] || fail invalid_numeric_configuration
    [[ -z "$value" ]] || printf -v "$setting" '%d' "$((10#$value))"
done
for setting in BACKUP_AUTO_RETENTION BACKUP_VERIFY_READ_DATA BACKUP_KEEP_TEST_VOLUME BACKUP_TEST_MODE; do
    value=${!setting:-false}; [[ "$value" == true || "$value" == false ]] || fail invalid_boolean_configuration
done
(( ${BACKUP_HEALTH_TIMEOUT:-180} > 0 )) || fail invalid_health_timeout
if ! private_file "$RESTIC_PASSWORD_FILE" || [[ ! -s "$RESTIC_PASSWORD_FILE" ]]; then fail unsafe_password_file; fi
RESTIC_PASSWORD_FILE=$(realpath -e -- "$RESTIC_PASSWORD_FILE")
case "$RESTIC_PASSWORD_FILE" in "$TARGET"/*|"$ROOT"/*) fail password_must_be_separate;; esac
RESTIC_REPOSITORY=${RESTIC_REPOSITORY:-$TARGET/repository}
path_ok "$RESTIC_REPOSITORY" || fail invalid_repository
REPOSITORY=$(realpath -m -- "$RESTIC_REPOSITORY")
[[ "$REPOSITORY" == "$TARGET/"* && "$REPOSITORY" != "$TARGET/.staging"* && "$REPOSITORY" != "$TARGET/.cache"* ]] || fail repository_outside_target
[[ ! -L "$TARGET/.cache" ]] || fail unsafe_cache
if [[ -e "$TARGET/.cache" ]] && ! private_dir "$TARGET/.cache"; then fail unsafe_cache; fi
# Keep repository caches off the SD as well; only small state/journals stay local.
export RESTIC_REPOSITORY="$REPOSITORY" RESTIC_PASSWORD_FILE RESTIC_CACHE_DIR="$TARGET/.cache" TZ=UTC
MARKER="$TARGET/.memory-vault-repository.json"
TAG=akai-ito-memory-vault-v1
PROJECT_TAG="akai-project:$PROJECT"
restic_cmd() { job restic --quiet "$@" 2>>"$LOG"; }
repository_check() {
    private_file "$MARKER" || fail repository_not_initialized
    local id
    id=$(restic_cmd cat config | jq -er '.id') || fail repository_unavailable
    REPO_ID=$id
    jq -e --arg id "$id" --arg p "$PROJECT" '.format==1 and .repositoryId==$id and .project==$p' "$MARKER" >/dev/null || fail repository_mismatch
}
check_repo() {
    PHASE=repository_integrity
    if [[ ${BACKUP_VERIFY_READ_DATA:-true} == true ]]; then restic_cmd check --read-data >>"$LOG"; else restic_cmd check >>"$LOG"; fi
}
list_snapshots() { restic_cmd snapshots --json --tag "$TAG,$PROJECT_TAG,vault-verified"; }
inventory_update() {
    list_snapshots | jq --arg at "$(date -u +%FT%TZ)" '{checkedAt:$at,count:length,snapshots:map({id,time,tags,hostname})}' > "$STATE/inventory.$RUN_ID.tmp"
    mv -T -- "$STATE/inventory.$RUN_ID.tmp" "$STATE/inventory.json"
}
space_for() {
    local required=$1 available reserve
    available=$(df -Pk -- "$TARGET" | awk 'END {print $4}')
    reserve=$((${BACKUP_MIN_FREE_MB:-1024} * 1024 * 1024))
    (( available * 1024 >= required + reserve )) || fail insufficient_space
}
new_stage() {
    [[ ! -L "$TARGET/.staging" ]] || fail unsafe_staging
    mkdir -p -- "$TARGET/.staging"
    private_dir "$TARGET/.staging" || fail unsafe_staging
    STAGE=$(mktemp -d "$TARGET/.staging/vault-XXXXXXXXXX")
    printf '%s' "$RUN_ID" > "$STAGE/.vault-owner"
}
select_snapshot() {
    local requested=${1:-latest} selected
    [[ "$requested" == latest || "$requested" =~ ^[a-f0-9]{8,64}$ ]] || fail invalid_snapshot
    selected=$(list_snapshots | jq -er --arg id "$requested" 'if $id=="latest" then sort_by(.time)|last|.id else map(select(.id|startswith($id)))|if length==1 then .[0].id else error("ambiguous snapshot") end end') || fail snapshot_not_found
    [[ "$selected" =~ ^[a-f0-9]{64}$ ]] || fail snapshot_not_found
    SNAPSHOT=$selected
}
restore_payload() {
    local size
    # Encrypted manifest only: estimate before restoring a potentially large diary.
    restic_cmd dump "$SNAPSHOT" /manifest.json > "$STAGE/snapshot-manifest.json"
    size=$(jq -er 'select(.format=="akai-ito-memory-vault/v1")|.dataBytes|select(type=="number" and .>=0)' "$STAGE/snapshot-manifest.json") || fail invalid_manifest
    if [[ "$OP" == verify ]]; then space_for "$((size * 2))"; else space_for "$((size * 5))"; fi
    PHASE=snapshot_restore
    restic_cmd restore "$SNAPSHOT" --target "$STAGE/restored" >>"$LOG"
    PHASE=snapshot_files
    python3 "$FILES" verify "$STAGE/restored" > "$STAGE/report.json" 2>>"$LOG"
    SOURCE_BYTES=$size
}
restore_volume() {
    local volume=$1 label=$RUN_ID image actual
    [[ "$volume" =~ ^akai-[a-zA-Z0-9][a-zA-Z0-9_.-]+$ ]] || fail invalid_restore_volume
    docker volume inspect "$volume" >/dev/null 2>&1 && fail restore_volume_exists
    image=${BACKUP_APP_IMAGE:-$(jq -er '.appImage' "$STAGE/restored/manifest.json")}
    docker image inspect "$image" > /dev/null || fail restore_image_missing
    # Recheck under the per-host lock; our unique label guards against accidental reuse.
    docker volume create --label "akai.vault.owner=$label" --label "akai.vault.project=$PROJECT" --label 'akai.vault.role=restore' "$volume" >>"$LOG"
    actual=$(docker volume inspect "$volume" -f '{{index .Labels "akai.vault.owner"}}')
    [[ "$actual" == "$label" ]] || fail restore_volume_race
    # The default local Docker volume may be on a DIFFERENT disk from staging.
    volume_free=$(docker run --rm --read-only --network none --cap-drop ALL --user 1000:1000 \
        --mount "type=volume,source=$volume,target=/app/data,readonly" --entrypoint df "$image" -Pk /app/data | awk 'END {print $4}')
    if [[ ! "$volume_free" =~ ^[0-9]+$ ]] || (( volume_free * 1024 < SOURCE_BYTES + ${BACKUP_MIN_FREE_MB:-1024} * 1024 * 1024 )); then fail restore_volume_space; fi
    PHASE=volume_restore
    tar -cf "$STAGE/restore.tar" -C "$STAGE/restored/data" .
    job docker run --rm -i --network none --log-driver none --cap-drop ALL --cap-add CHOWN --cap-add DAC_OVERRIDE --cap-add FOWNER \
        --security-opt no-new-privileges:true --read-only --user 0:0 \
        --mount "type=volume,source=$volume,target=/app/data" --entrypoint sh "$image" \
        -c 'tar --no-same-owner -xf - -C /app/data && chown -R 1000:1000 /app/data' < "$STAGE/restore.tar" >>"$LOG" 2>&1
    PHASE=application_verify
    job docker run --rm --network none --log-driver none --read-only --cap-drop ALL --security-opt no-new-privileges:true \
        --user 1000:1000 --mount "type=volume,source=$volume,target=/app/data" --entrypoint node "$image" \
        apps/api/dist/cli.js verify > "$STAGE/application-report.json" 2>>"$LOG"
    jq -e '.healthy==true and .missing==0' "$STAGE/application-report.json" >/dev/null
    # Re-read the actual restored volume, independently of the staging copy.
    PHASE=restored_volume_comparison
    HELPER="akai-vault-read-$RUN_ID"
    job backup_capture "$image" "$volume" "$STAGE/restored-volume.tar" "$HELPER"
    HELPER=''
    mkdir "$STAGE/readback"
    python3 "$FILES" extract "$STAGE/restored-volume.tar" "$STAGE/readback/data" 2>>"$LOG"
    cp -- "$STAGE/restored/manifest.json" "$STAGE/readback/manifest.json"
    python3 "$FILES" verify "$STAGE/readback" > "$STAGE/readback.json" 2>>"$LOG"
    printf '{"healthy":true,"snapshotId":"%s","restoredVolume":"%s","productionChanged":false}\n' "$SNAPSHOT" "$volume"
    if [[ "$OP" == test-restore && ${BACKUP_KEEP_TEST_VOLUME:-false} != true ]]; then
        [[ "$(docker volume inspect "$volume" -f '{{index .Labels "akai.vault.owner"}}')" == "$label" ]] || fail cleanup_owner_mismatch
        docker volume rm "$volume" >>"$LOG"
    fi
}
retention() {
    local apply=$1
    PHASE=retention
    local args=(forget --tag "$TAG,$PROJECT_TAG,vault-verified" --group-by host --keep-last 1 \
        --keep-daily "${BACKUP_KEEP_DAILY:-7}" --keep-weekly "${BACKUP_KEEP_WEEKLY:-4}" --keep-monthly "${BACKUP_KEEP_MONTHLY:-6}")
    if [[ "$apply" == true ]]; then
        { restic_cmd "${args[@]}"; restic_cmd prune; restic_cmd check; } >>"$LOG"
    else restic_cmd "${args[@]}" --dry-run --json; fi
}

case "$OP" in
    init)
        PHASE=initialize
        [[ ! -e "$REPOSITORY" && ! -L "$REPOSITORY" && ! -e "$MARKER" ]] || fail repository_already_exists
        space_for 0
        restic_cmd init >>"$LOG"
        repo_id=$(restic_cmd cat config | jq -er .id)
        jq -nc --arg id "$repo_id" --arg project "$PROJECT" '{format:1,repositoryId:$id,project:$project}' > "$MARKER"
        printf '{"initialized":true}\n';;
    list) repository_check; inventory_update; cat "$STATE/inventory.json";;
    backup)
        KIND=${1:-manual}; [[ "$KIND" == manual || "$KIND" == scheduled ]] || fail invalid_backup_kind
        PHASE=preflight; repository_check
        container=$(docker ps -aq --filter "label=com.docker.compose.project=$PROJECT" --filter 'label=com.docker.compose.service=app' --filter 'label=com.docker.compose.oneoff=False')
        [[ "$container" =~ ^[a-f0-9]{12,64}$ ]] || fail ambiguous_or_missing_app
        identity=$(docker inspect "$container")
        container=$(jq -er '.[0].Id' <<< "$identity")
        IMAGE=$(jq -er '.[0].Image' <<< "$identity")
        VOLUME=$(jq -er '[.[0].Mounts[]|select(.Destination=="/app/data" and .Type=="volume")]|if length==1 then .[0].Name else error("named volume required") end' <<< "$identity")
        [[ -z ${BACKUP_EXPECTED_VOLUME:-} || "$VOLUME" == "$BACKUP_EXPECTED_VOLUME" ]] || fail unexpected_volume
        live_source=$(jq -er '.[0].Mounts[]|select(.Destination=="/app/data")|.Source' <<< "$identity")
        case "$TARGET/" in "$live_source/"*) fail backup_inside_live_volume;; esac
        case "$STATE/" in "$live_source/"*) fail state_inside_live_volume;; esac
        for writer in $(docker ps -q --filter "volume=$VOLUME"); do
            if [[ "$(docker inspect -f '{{.Id}}' "$writer")" != "$container" ]] && docker inspect "$writer" | jq -e --arg v "$VOLUME" 'any(.[0].Mounts[]; .Name==$v and .RW==true)' >/dev/null; then fail other_volume_writer; fi
        done
        bytes_k=$(docker run --rm --network none --log-driver none --read-only --cap-drop ALL --user 1000:1000 --mount "type=volume,source=$VOLUME,target=/app/data,readonly" --entrypoint du "$IMAGE" -sk /app/data | awk '{print $1}')
        [[ "$bytes_k" =~ ^[0-9]+$ ]] || fail cannot_size_volume
        space_for "$((bytes_k * 1024 * 3))"
        new_stage
        if jq -e '.[0].State.Running' <<< "$identity" >/dev/null; then
            jq -nc --arg c "$container" --arg v "$VOLUME" --arg i "$IMAGE" '{container:$c,volume:$v,image:$i}' > "$STATE/restart.$RUN_ID.tmp"
            mv -T -- "$STATE/restart.$RUN_ID.tmp" "$JOURNAL"
            PHASE=stop_app; job docker stop -t 30 "$container" >>"$LOG" 2>&1
        fi
        PHASE=copy_volume; HELPER="akai-vault-copy-$RUN_ID"
        job backup_capture "$IMAGE" "$VOLUME" "$STAGE/data.tar" "$HELPER"
        HELPER=''
        PHASE=restart_app; recover || fail restart_failed
        PHASE=validate_copy; mkdir "$STAGE/payload"
        python3 "$FILES" extract "$STAGE/data.tar" "$STAGE/payload/data" 2>>"$LOG"
        python3 "$FILES" manifest "$STAGE/payload" "$RUN_ID" "$KIND" "$IMAGE" "$PROJECT" > "$STAGE/metadata.json" 2>>"$LOG"
        SOURCE_BYTES=$(jq -er .dataBytes "$STAGE/metadata.json")
        rm -- "$STAGE/data.tar"
        PHASE=encrypted_snapshot
        previous_dir=$PWD
        cd "$STAGE/payload"
        job restic --quiet backup . --host "$PROJECT" --tag "$TAG" --tag "$PROJECT_TAG" --tag "vault-run:$RUN_ID" --tag "vault-kind:$KIND" --tag vault-pending --json > "$STAGE/backup.json" 2>>"$LOG"
        cd "$previous_dir"
        SNAPSHOT=$(jq -er 'select(.message_type=="summary")|.snapshot_id' "$STAGE/backup.json")
        [[ "$SNAPSHOT" =~ ^[a-f0-9]{8,64}$ ]] || fail incomplete_snapshot
        ADDED_BYTES=$(jq -r 'select(.message_type=="summary")|.data_added // 0' "$STAGE/backup.json")
        check_repo
        PHASE=publish_snapshot
        restic_cmd tag --add vault-verified --remove vault-pending "$SNAPSHOT" >>"$LOG"
        SNAPSHOT=$(list_snapshots | jq -er --arg run "vault-run:$RUN_ID" '[.[]|select(.tags|index($run))]|if length==1 then .[0].id else error("publish failed") end')
        [[ ${BACKUP_AUTO_RETENTION:-false} != true ]] || retention true
        inventory_update
        PHASE=complete
        printf '{"event":"backup_success","id":"%s","snapshotId":"%s","dataBytes":%s}\n' "$RUN_ID" "$SNAPSHOT" "$SOURCE_BYTES";;
    verify|test-restore|restore)
        repository_check; select_snapshot "${1:-latest}"; new_stage
        check_repo; restore_payload
        if [[ "$OP" == verify ]]; then cat "$STAGE/report.json";
        elif [[ "$OP" == restore ]]; then restore_volume "${2:?Provide a NEW akai-* volume name}";
        else restore_volume "akai-vault-test-$RUN_ID"; fi
        PHASE=complete;;
    retention)
        repository_check
        if [[ ${1:-} == --apply ]]; then
            previous=$(python3 "$FILES" status "$STATE")
            jq -e --arg repo "$REPO_ID" '.lastAttempt.result=="success" and .lastSuccess.snapshotId!="" and .lastSuccess.repositoryId==$repo' <<< "$previous" >/dev/null || fail last_backup_not_successful
            check_repo; select_snapshot "$(jq -er .lastSuccess.snapshotId <<< "$previous")"; retention true; inventory_update
        elif [[ ${1:---dry-run} == --dry-run ]]; then retention false;
        else fail invalid_retention_option; fi;;
    *) fail unknown_command;;
esac
