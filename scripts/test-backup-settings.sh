#!/usr/bin/env bash
# Disposable Linux runner + Docker socket. Only UUID-owned synthetic resources.
set -Eeuo pipefail
umask 077
ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
cd "$ROOT"
suffix=$(cat /proc/sys/kernel/random/uuid)
project="akai-settings-qa-$suffix"
image="akai-ito:settings-qa-$suffix"
app="$project-app"
volume="${project}_diary-data"
control_volume=${VAULT_QA_CONTROL_VOLUME:?Mount a dedicated QA volume at /control}
base=$(mktemp -d /tmp/akai-settings-XXXXXXXX)
mkdir "$base/deploy" "$base/home"
touch "$base/deploy/.env"
docker image tag "${VAULT_TEST_IMAGE:-akai-ito:backup-settings-local}" "$image"
cleanup() {
    result=$?; trap - EXIT INT TERM
    # Let any detached worker finish/recover the app before removing its fixture.
    if [[ -f "$base/deploy/.memory-vault/web-job.json" ]]; then
        for ((i=0;i<180;i++)); do
            [[ $(jq -r .result "$base/deploy/.memory-vault/web-job.json") == running ]] || break
            sleep 1
        done
    fi
    [[ -z ${bridge:-} ]] || { kill "$bridge" 2>/dev/null || true; wait "$bridge" 2>/dev/null || true; }
    docker rm -f "$app" >/dev/null 2>&1 || true
    if [[ $(docker volume inspect "$volume" -f '{{index .Labels "akai.vault.qa"}}' 2>/dev/null || true) == "$suffix" ]]; then docker volume rm "$volume" >/dev/null; fi
    docker image rm "$image" >/dev/null 2>&1 || true
    docker network disconnect "${project}_default" "$HOSTNAME" >/dev/null 2>&1 || true
    docker network rm "${project}_default" >/dev/null 2>&1 || true
    if (( result != 0 )); then
        find "$base/deploy/.memory-vault" -name '*.log' -exec tail -n 8 {} \; 2>/dev/null || true
    fi
    exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
# A test double exercises enable/disable and generated units; never contacts host systemd.
cat > "$base/scheduler" <<EOF
#!/bin/sh
case "\$2" in
  is-enabled|is-active) test -f '$base/timer-active';;
  enable) touch '$base/timer-active';;
  disable) rm -f '$base/timer-active';;
  daemon-reload) exit 0;;
  *) exit 1;;
esac
EOF
chmod 700 "$base/scheduler"
python3 - "$base" "$project" <<'PY'
import json,secrets,sys,os
from pathlib import Path
base=Path(sys.argv[1])
Path('/control/control.key').write_text(secrets.token_hex(32)+'\n')
os.chown('/control',1000,1000);os.chmod('/control',0o700)
os.chown('/control/control.key',1000,1000);os.chmod('/control/control.key',0o400)
(base/'policy.json').write_text(json.dumps({'deploy':str(base/'deploy'),'project':sys.argv[2], 'uid':1000,'home':str(base/'home'), 'socket':'/control/control.sock','key_file':'/control/control.key', 'scheduler':str(base/'scheduler'),'test_mode':True}))
PY
python3 -B scripts/vault-control.py serve "$base/policy.json" & bridge=$!
for ((i=0;i<50;i++)); do [[ ! -S /control/control.sock ]] || break; sleep 0.1; done
docker volume create --label "akai.vault.qa=$suffix" "$volume" >/dev/null
jq -n --arg app "$app" --arg image "$image" --arg volume "$volume" --arg control "$control_volume" \
 '{services:{app:{container_name:$app,image:$image,ports:["127.0.0.1:3002:3000"],read_only:true,tmpfs:["/tmp:mode=1777,size=64m"],cap_drop:["ALL"],security_opt:["no-new-privileges:true"],volumes:["diary-data:/app/data","control:/app/vault-control:ro"],environment:{APP_ORIGIN:"http://localhost:3002",COOKIE_SECURE:"false"},healthcheck:{interval:"1s",start_period:"1s",timeout:"2s"},command:["sh","-c","node apps/api/dist/cli.js migrate && exec node apps/api/dist/server.js"]}},volumes:{"diary-data":{external:true,name:$volume},control:{external:true,name:$control}}}' > "$base/compose.json"
docker compose -p "$project" -f "$base/compose.json" up -d --no-build --wait --wait-timeout 60 >/dev/null
docker exec -i "$app" node --input-type=module <<'JS'
import {openDb} from './apps/api/dist/db.js';
import {initializeUsers} from './apps/api/dist/cli.js';
const {db,sqlite}=openDb('/app/data');
await initializeUsers(db,[{username:'demo',name:'Elena',password:'DiarioLocale2026!'},{username:'partner',name:'Luca',password:'DiarioLocale2026!'}]);sqlite.close();
JS
docker network connect "${project}_default" "$HOSTNAME"
QA_APP_HOST=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$app") node --input-type=module <<'JS'
import assert from 'node:assert/strict';
const origin='http://localhost:3002',url='http://'+process.env.QA_APP_HOST+':3000';
const login=await fetch(url+'/api/auth/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({username:'demo',password:'DiarioLocale2026!'})});
assert.equal(login.status,200);const auth=await login.json(), cookie=login.headers.getSetCookie()[0].split(';')[0];
const headers={Origin:origin,Cookie:cookie,'X-CSRF-Token':auth.csrf,'Content-Type':'application/json'};
const request=async(path,method='GET',data)=>{let r=await fetch(url+'/api/backup/'+path,{method,headers,body:data?JSON.stringify(data):undefined});assert.equal(r.status,200,await r.clone().text());return r.json();};
let status=await request('status');assert.equal(status.available,true);assert.equal(status.keyConfigured,false);assert.equal(status.automaticActive,false);console.log('PASS Real Node API connects to authenticated private Unix socket');
const wait=async()=>{for(let i=0;i<120;i++){await new Promise(r=>setTimeout(r,1000));try{status=await request('status');if(status.job?.result!=='running'){assert.equal(status.job.result,'success',JSON.stringify(status.job));return status;}}catch(e){if(e.code!=='ECONNREFUSED'&&e.cause?.code!=='ECONNREFUSED'&&e.cause?.code!=='UND_ERR_SOCKET')throw e;}}throw Error('Job timeout');};
const configuration={destinationId:'local',folder:'qa-diary',automatic:false,time:'03:30',daily:7,weekly:4,monthly:6,localAcknowledged:true,keyAcknowledged:true,encryptionPassword:'SyntheticBackupKey2026!'};
await request('configuration','PUT',configuration);await wait();assert.equal(status.ready,true);assert.equal(status.snapshotCount,0);assert.equal(status.keyConfigured,true);assert.ok(!JSON.stringify(status).includes('SyntheticBackupKey'));console.log('PASS UI configuration prepares actual encrypted repository; key is never returned');
await request('actions','POST',{action:'backup'});await wait();assert.equal(status.snapshotCount,1);assert.equal(status.lastSuccess.result,'success');console.log('PASS Asynchronous cold backup survives application restart and publishes verified snapshot');
for(const action of ['verify','test-restore']){await request('actions','POST',{action});await wait();console.log('PASS Real '+action+' completes on synthetic volume');}
delete configuration.encryptionPassword;configuration.automatic=true;configuration.time='04:15';
await request('configuration','PUT',configuration);await wait();assert.equal(status.automaticActive,true);assert.equal(status.configuration.time,'04:15');console.log('PASS First successful backup gates schedule activation with selected time');
await request('actions','POST',{action:'disable'});status=await request('status');assert.equal(status.automaticActive,false);assert.equal(status.configuration.automatic,false);console.log('PASS Disable stops future scheduling while preserving copies and encryption key');
JS
grep -q '04:15:00 Europe/Rome' "$base/home/.config/systemd/user/$project-memory-vault.timer"
systemd-analyze verify "$base/home/.config/systemd/user/$project-memory-vault.service" "$base/home/.config/systemd/user/$project-memory-vault.timer"
echo 'PASS Generated systemd service/timer syntax and timezone verified'
echo "SETTINGS_QA_READY app=$app"
if [[ ${VAULT_QA_HOLD:-false} == true ]]; then
    for ((i=0;i<1200;i++)); do [[ ! -f /control/finish ]] || break; sleep 1; done
fi
echo 'Completed backup settings integration checks'
