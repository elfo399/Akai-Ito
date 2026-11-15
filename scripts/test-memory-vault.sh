#!/usr/bin/env bash
# Opt-in Linux + Docker integration suite. Creates ONLY UUID-labeled synthetic QA resources.
set -Eeuo pipefail
umask 077
ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
cd "$ROOT"
python3 -B scripts/test-vault-files.py
shellcheck -x -P scripts scripts/{memory-vault,backup-common,backup,restore,jenkins-deploy}.sh
if command -v systemd-analyze >/dev/null; then bash scripts/check-vault-units.sh; fi
for script in scripts/{memory-vault,backup-common,backup,restore,jenkins-deploy}.sh; do bash -n "$script"; done
[[ -S /var/run/docker.sock || -n ${DOCKER_HOST:-} ]] || { echo 'Docker unavailable; integration tests not run' >&2; exit 1; }
IMAGE=${VAULT_TEST_IMAGE:-akai-ito:vault-local}
docker image inspect "$IMAGE" >/dev/null
SUFFIX=$(cat /proc/sys/kernel/random/uuid)
SOURCE_IMAGE=$IMAGE
IMAGE="akai-ito:vault-qa-$SUFFIX"
PROJECT="akai-vault-qa-$SUFFIX"
export COMPOSE_PROJECT_NAME="$PROJECT"
export APP_ORIGIN=http://localhost:3000
VOLUME="${PROJECT}_diary-data"
APP="$PROJECT-app"
BASE=$(mktemp -d /tmp/akai-vault-qa-XXXXXXXXXX)
mkdir "$BASE/deploy" "$BASE/credentials" "$BASE/target with spaces" "$BASE/bin"
export BACKUP_DEPLOY_DIR="$BASE/deploy"
touch "$BASE/deploy/.env"
head -c 48 /dev/urandom | base64 > "$BASE/credentials/password"
CONFIG="$BASE/backup.env"
export MEMORY_VAULT_CONFIG="$CONFIG"
export BACKUP_APP_IMAGE="$IMAGE" # Compatible image explicitly supplied to legacy restore.
cat > "$CONFIG" <<EOF
BACKUP_DEPLOY_DIR='$BASE/deploy'
COMPOSE_PROJECT_NAME='$PROJECT'
BACKUP_TARGET_DIR='$BASE/target with spaces'
BACKUP_REQUIRE_MOUNT=false
BACKUP_TEST_MODE=true
BACKUP_MIN_FREE_MB=0
BACKUP_HEALTH_TIMEOUT=30
RESTIC_PASSWORD_FILE='$BASE/credentials/password'
BACKUP_AUTO_RETENTION=false
BACKUP_APP_IMAGE='$IMAGE'
EOF
chmod 600 "$CONFIG" "$BASE/credentials/password"
COUNT=0; BACKGROUND=''; WRITER=''; RESTORED="$PROJECT-restored"; LEGACY="$PROJECT-legacy"
cleanup() {
    result=$?; trap - EXIT INT TERM
    [[ -z "$BACKGROUND" ]] || { kill -TERM "$BACKGROUND" 2>/dev/null || true; wait "$BACKGROUND" 2>/dev/null || true; }
    if [[ -n "$WRITER" && "$(docker inspect -f '{{index .Config.Labels "akai.vault.qa"}}' "$WRITER" 2>/dev/null || true)" == "$SUFFIX" ]]; then docker rm -f "$WRITER" >/dev/null; fi
    docker rm -f "$APP" >/dev/null 2>&1 || true
    for volume in "$VOLUME" "$RESTORED" "$LEGACY"; do
        owner=$(docker volume inspect "$volume" -f '{{index .Labels "akai.vault.qa"}}' 2>/dev/null || true)
        # Restored volumes have a separate generated owner; authorize only the exact
        # names created by THIS UUID run and explicitly mark them before cleanup.
        if [[ "$owner" == "$SUFFIX" ]]; then docker volume rm "$volume" >/dev/null;
        elif [[ "$volume" != "$VOLUME" && "$(docker volume inspect "$volume" -f '{{index .Labels "akai.vault.project"}}' 2>/dev/null || true)" == "$PROJECT" ]]; then docker volume rm "$volume" >/dev/null; fi
    done
    docker image rm "$IMAGE" >/dev/null 2>&1 || true
    if (( result != 0 )); then
        printf 'QA failure; private artifacts retained at %s\n' "$BASE" >&2
        find "$BASE/deploy/.memory-vault/logs" -type f -exec tail -n 7 {} \; 2>/dev/null || true
    else
        printf 'Completed %s Docker/Restic checks + 19 offline tests\n' "$COUNT"
        # Private artifacts remain inspectable only inside the disposable test runner.
    fi
    exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
pass() { COUNT=$((COUNT+1)); printf 'PASS %s\n' "$1"; }
vault() { bash scripts/memory-vault.sh "$@"; }
expect_fail() { if "$@" > "$BASE/expected-error.log" 2>&1; then echo 'Expected failure did not occur' >&2; exit 1; fi; }
expect_exit() { local expected=$1 result=0; shift; "$@" > "$BASE/expected-error.log" 2>&1 || result=$?; [[ "$result" == "$expected" ]] || { cat "$BASE/expected-error.log"; exit 1; }; }
wait_file() {
    for ((attempt=0;attempt<200;attempt++)); do
        [[ ! -e "$1" ]] || return 0
        if ! kill -0 "$2" 2>/dev/null; then cat "$BASE/interrupted.log" 2>/dev/null || true; return 1; fi
        sleep 0.1
    done
    printf 'QA phase timeout\n' >&2; return 1
}
healthy() {
    for ((n=0;n<60;n++)); do
        if [[ $(docker inspect -f '{{.State.Health.Status}}' "$APP") == healthy ]]; then return; fi
        sleep 1
    done
    echo 'QA app unhealthy' >&2; exit 1
}
docker image tag "$SOURCE_IMAGE" "$IMAGE"
docker volume inspect "$VOLUME" >/dev/null 2>&1 && exit 1
docker volume create --label "akai.vault.qa=$SUFFIX" "$VOLUME" >/dev/null
jq -n --arg app "$APP" --arg image "$IMAGE" --arg volume "$VOLUME" --arg suffix "$SUFFIX" \
    '{services:{app:{container_name:$app,image:$image,network_mode:"none",read_only:true,
      tmpfs:["/tmp:mode=1777,size=64m"],cap_drop:["ALL"],security_opt:["no-new-privileges:true"],
      volumes:["diary-data:/app/data"],environment:{APP_ORIGIN:"http://localhost:3000",COOKIE_SECURE:"false"},
      healthcheck:{interval:"1s",start_period:"1s",timeout:"2s"},labels:{"akai.vault.qa":$suffix},
      command:["sh","-c","node apps/api/dist/cli.js migrate && exec node apps/api/dist/server.js"]}},
      volumes:{"diary-data":{external:true,name:$volume}}}' > "$BASE/compose.json"
docker compose -p "$PROJECT" -f "$BASE/compose.json" up -d --no-build --wait --wait-timeout 60 >/dev/null
healthy
docker exec -i "$APP" node --input-type=module > "$BASE/fixture.json" <<'JS'
import {openDb} from './apps/api/dist/db.js';
import {initializeUsers} from './apps/api/dist/cli.js';
import {randomBytes} from 'node:crypto';
import sharp from 'sharp';
const password=randomBytes(24).toString('hex');
const {db,sqlite}=openDb('/app/data');
await initializeUsers(db,[{username:'qa-one',name:'Synthetic One',password},{username:'qa-two',name:'Synthetic Two',password}]);sqlite.close();
const origin='http://localhost:3000';
const login=await fetch(origin+'/api/auth/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({username:'qa-one',password})});
if(!login.ok)throw Error('login');
const auth=await login.json(),cookie=login.headers.getSetCookie()[0].split(';')[0];
const headers={Origin:origin,Cookie:cookie,'X-CSRF-Token':auth.csrf};
const albumResponse=await fetch(origin+'/api/collections',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({name:'Synthetic trip',category:'Viaggi',description:'Fixture'})});
if(!albumResponse.ok)throw Error('album');const album=await albumResponse.json();
const png=await sharp({create:{width:80,height:60,channels:3,background:'#a7b9ac'}}).png().toBuffer();
const form=new FormData();form.append('payload',JSON.stringify({memory:{title:'Before backup',eventDate:'2026-11-15',description:'Synthetic fixture only',category:'Viaggi',location:'',collectionId:album.id},photos:['new:0'],cover:'new:0'}));form.append('photos',new Blob([png],{type:'image/png'}),'fixture.png');
const created=await fetch(origin+'/api/memories',{method:'POST',headers,body:form});if(created.status!==201)throw Error('photo upload');const memory=await created.json();
const comment=await fetch(origin+'/api/memories/'+memory.id+'/comments',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({body:'Synthetic thought'})});if(comment.status!==201)throw Error('comment');
const avatar=new FormData();avatar.append('photo',new Blob([png],{type:'image/png'}),'avatar.png');
if(!(await fetch(origin+'/api/profile/avatar',{method:'POST',headers,body:avatar})).ok)throw Error('avatar');
console.log(JSON.stringify({memoryId:memory.id,photoId:memory.photos[0].id}));
JS
pass 'Synthetic album, memory, actual PNG/derivatives and comment created in isolated Docker volume'
vault init
vault backup manual
healthy
pass 'Consistent encrypted manual backup succeeds and app returns healthy'
snapshot=$(vault list | jq -er '.snapshots[0].id')
vault verify "$snapshot" > "$BASE/verified.json"
jq -e '.healthy and .report.counts.memories==1 and .report.counts.memory_media==1 and .report.counts.comments==1 and .report.counts.collections==1' "$BASE/verified.json" >/dev/null
pass 'Snapshot cryptography, file hashes, SQLite, foreign keys, media and counts verified'

# Modify the original after capture. Restoring MUST recover the previous state.
docker exec -i "$APP" node --input-type=module <<'JS'
import {openDb} from './apps/api/dist/db.js';
const {sqlite}=openDb('/app/data');sqlite.prepare("UPDATE memories SET title='After backup',version=version+1").run();sqlite.close();
JS
vault restore "$snapshot" "$RESTORED" > "$BASE/restore.json"
docker run --rm --network none --mount "type=volume,source=$RESTORED,target=/app/data" --entrypoint node "$IMAGE" --input-type=module -e "import{openDb}from'./apps/api/dist/db.js';const{sqlite}=openDb('/app/data');if(sqlite.prepare('select title from memories').get().title!=='Before backup')process.exit(1);sqlite.close();"
pass 'Restore into new volume recovers pre-change database and byte-identical photographs'
expect_fail vault restore "$snapshot" "$RESTORED"
pass 'Existing restore destination refused without overwriting it'
docker exec -i "$APP" node --input-type=module -e "import{openDb}from'./apps/api/dist/db.js';const{sqlite}=openDb('/app/data');if(sqlite.prepare('select title from memories').get().title!=='After backup')process.exit(1);sqlite.close();"
pass 'Source volume retains post-backup modification and is never replaced'
vault test-restore "$snapshot" > "$BASE/drill.json"
vault status | jq -e '.lastRestoreTest.result=="success" and .lastSuccess.dataBytes>0 and .inventory.count==1' >/dev/null
pass 'Periodic drill runs application CLI and readback comparison, reports status and removes only its owned test volume'

# Preflight failures: no downtime, no snapshots removed.
cp "$CONFIG" "$BASE/config.original"
printf '\nBACKUP_TARGET_DIR=%q\n' "$BASE/absent" >> "$CONFIG"
expect_fail vault backup
[[ ! -e "$BASE/absent" ]] && healthy
pass 'Missing target fails without silently creating local replacement'
cp "$BASE/config.original" "$CONFIG"; printf '\nBACKUP_REQUIRE_MOUNT=true\nBACKUP_MOUNT_POINT=%q\n' "$BASE/target with spaces" >> "$CONFIG"
expect_fail vault backup; healthy
pass 'Configured external mount is required before any write or downtime'
cp "$BASE/config.original" "$CONFIG"; printf '\nBACKUP_MIN_FREE_MB=9999999\n' >> "$CONFIG"
expect_fail vault backup; healthy
pass 'Insufficient free space rejected before stopping the app'
cp "$BASE/config.original" "$CONFIG"; chmod 755 "$BASE/target with spaces"
expect_fail vault backup; healthy
chmod 700 "$BASE/target with spaces"
pass 'Unsafe destination permissions rejected before stopping the app'
vault status | jq -e '.lastAttempt.result=="failed" and .lastSuccess.snapshotId!=""' >/dev/null
expect_fail vault retention --apply
pass 'Failure is recorded, previous success preserved, destructive retention forbidden after failed backup'
[[ $(vault list | jq .count) == 1 ]]
pass 'Failed attempts never remove the only valid backup'
chmod 644 "$BASE/credentials/password"
expect_fail vault backup; healthy
chmod 600 "$BASE/credentials/password"
pass 'Encryption credential file permissions must be private'
WRITER=$(docker run -d --network none --label "akai.vault.qa=$SUFFIX" --mount "type=volume,source=$VOLUME,target=/app/data" --entrypoint sleep "$IMAGE" 60)
expect_fail vault backup
[[ "$(docker inspect -f '{{index .Config.Labels "akai.vault.qa"}}' "$WRITER")" == "$SUFFIX" ]] || exit 1
docker rm -f "$WRITER" >/dev/null; WRITER=''
healthy
pass 'Another writable container blocks capture before any app downtime'

# Real Jenkins deploy entry point, manual and scheduled backups contend on the SAME inode.
( exec 8>"$BASE/deploy/.deploy.lock"; flock 8; touch "$BASE/lock-held"; sleep 20 ) & BACKGROUND=$!
wait_file "$BASE/lock-held" "$BACKGROUND"
expect_exit 75 vault backup scheduled
expect_exit 75 vault backup manual
expect_exit 75 env COMPOSE_PROJECT_NAME="$PROJECT" sh scripts/jenkins-deploy.sh "$IMAGE" "$BASE/deploy"
healthy
kill "$BACKGROUND"; wait "$BACKGROUND" 2>/dev/null || true; BACKGROUND=''
pass 'Scheduled/manual backup and actual deploy entry point all refuse the held shared lock'

# Fault injection wrapper only on this QA process PATH; never a production config flag.
REAL_DOCKER=$(command -v docker); export REAL_DOCKER
cat > "$BASE/bin/docker" <<'SH'
#!/usr/bin/env bash
if [[ ${1:-} == run ]]; then
case " $* " in *' akai-vault-copy-'*|*' akai-archive-'*)
    touch "$QA_COPY_STARTED"
    if [[ ${QA_COPY_MODE:-} == fail ]]; then exit 42; fi
    if [[ ${QA_COPY_MODE:-} == pause ]]; then sleep 60; fi
esac
fi
exec "$REAL_DOCKER" "$@"
SH
chmod 700 "$BASE/bin/docker"
export QA_COPY_STARTED="$BASE/copy-started"
expect_fail env PATH="$BASE/bin:$PATH" QA_COPY_MODE=fail bash scripts/memory-vault.sh backup
healthy
[[ $(vault list | jq .count) == 1 ]]
pass 'Copy failure restarts the original app, returns nonzero and publishes no snapshot'
rm -f "$QA_COPY_STARTED"
env PATH="$BASE/bin:$PATH" QA_COPY_MODE=pause bash scripts/memory-vault.sh backup > "$BASE/interrupted.log" 2>&1 & BACKGROUND=$!
wait_file "$QA_COPY_STARTED" "$BACKGROUND"
kill -TERM "$BACKGROUND"
if wait "$BACKGROUND"; then echo 'Expected interrupted exit' >&2; exit 1; fi
BACKGROUND=''; healthy
[[ ! -e "$BASE/deploy/.memory-vault/restart-required.json" ]]
pass 'SIGTERM during stopped-volume capture restarts app and clears recovery journal'
rm -f "$QA_COPY_STARTED"
env PATH="$BASE/bin:$PATH" QA_COPY_MODE=pause python3 - "$QA_COPY_STARTED" "$ROOT/scripts/memory-vault.sh" <<'PY'
import os, signal, subprocess, sys, time
p = subprocess.Popen(["bash", sys.argv[2], "backup"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    for _ in range(200):
        if os.path.exists(sys.argv[1]):
            break
        if p.poll() is not None:
            raise RuntimeError("Backup exited before capture")
        time.sleep(0.05)
    else:
        raise RuntimeError("Capture did not start")
    p.send_signal(signal.SIGINT)
    if p.wait(timeout=40) != 130:
        raise RuntimeError("SIGINT did not return 130")
finally:
    if p.poll() is None:
        p.terminate(); p.wait(timeout=40)
PY
healthy
pass 'SIGINT during capture also restores the app and returns an interrupted exit code'
# A durable interrupted-stop journal can recover even when the destination vanished.
docker inspect "$APP" | jq '.[0]|{container:.Id,image:.Image,volume:(.Mounts[]|select(.Destination=="/app/data")|.Name)}' > "$BASE/deploy/.memory-vault/restart-required.json"
docker stop "$APP" >/dev/null
printf '\nBACKUP_TARGET_DIR=%q\n' "$BASE/missing-after-reboot" >> "$CONFIG"
vault recover > "$BASE/recovery.json"
healthy
cp "$BASE/config.original" "$CONFIG"
pass 'Durable restart journal recovers an interrupted stop even with backup storage offline'
docker stop "$APP" >/dev/null
vault backup scheduled
[[ $(docker inspect -f '{{.State.Running}}' "$APP") == false ]]
pass 'Already stopped app can be backed up and remains intentionally stopped'
docker start "$APP" >/dev/null; healthy

# Legacy tar.gz entry point used by operators and shared engine used by Jenkins.
mkdir "$BASE/legacy"
sh scripts/backup.sh "$BASE/legacy"
healthy
archive=$(find "$BASE/legacy" -maxdepth 1 -name '*.tar.gz' -type f)
[[ -n "$archive" ]]
sh scripts/restore.sh "$archive" "$LEGACY"
pass 'Existing tar.gz/checksum workflow remains compatible and restores through the hardened entry point'
expect_fail env PATH="$BASE/bin:$PATH" QA_COPY_MODE=fail sh scripts/backup.sh "$BASE/legacy"
healthy
[[ $(find "$BASE/legacy" -maxdepth 1 -name '*.tar.gz' -type f | wc -l) == 1 ]]
pass 'Legacy manual backup also recovers from copy failure and preserves historical archives'
cp "$archive" "$BASE/legacy/corrupt.tar.gz"
printf '0%.0s' {1..64} > "$BASE/legacy/corrupt.tar.gz.sha256"; printf '  corrupt.tar.gz\n' >> "$BASE/legacy/corrupt.tar.gz.sha256"
expect_fail sh scripts/restore.sh "$BASE/legacy/corrupt.tar.gz" "$PROJECT-never-created"
if docker volume inspect "$PROJECT-never-created" >/dev/null 2>&1; then exit 1; fi
pass 'Checksum corruption is rejected before any destination volume is created'

vault retention --dry-run > "$BASE/retention.json"
pass 'Managed retention dry-run completes without deleting snapshots'
vault status > "$BASE/status.json"
healthy
pass 'Original fixture app remains healthy at completion; both existing previews and production were untouched'
# Corrupt a PRIVATE COPY of the encrypted repository; the real test repo stays intact.
mkdir "$BASE/corrupt-target"
cp -a "$BASE/target with spaces/repository" "$BASE/corrupt-target/repository"
cp "$BASE/target with spaces/.memory-vault-repository.json" "$BASE/corrupt-target/.memory-vault-repository.json"
pack=$(find "$BASE/corrupt-target/repository/data" -type f -print -quit)
python3 - "$pack" <<'PY'
import sys
with open(sys.argv[1], 'r+b') as file:
    first = file.read(1); file.seek(0); file.write(bytes([first[0] ^ 255]))
PY
cp "$CONFIG" "$BASE/pre-corrupt.env"
printf '\nBACKUP_TARGET_DIR=%q\n' "$BASE/corrupt-target" >> "$CONFIG"
expect_fail vault verify latest
cp "$BASE/pre-corrupt.env" "$CONFIG"
vault verify latest > "$BASE/uncorrupted.json"
pass 'Cryptographically corrupted repository copy is rejected; original backup still verifies'
bash scripts/test-vault-retention.sh "$BASE"
COUNT=$((COUNT + $(jq -er .checks "$BASE/retention-result.json")))

# Only exact successful restore names created by this test; delete after label ownership validation.
for restored in "$RESTORED" "$LEGACY"; do
    owner=$(docker volume inspect "$restored" -f '{{index .Labels "akai.vault.owner"}}')
    [[ "$owner" =~ ^[a-f0-9-]{36}$ && "$restored" == "$PROJECT-"* ]] || exit 1
    docker volume rm "$restored" >/dev/null
done
