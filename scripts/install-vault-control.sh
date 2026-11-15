#!/usr/bin/env bash
# Run by the deployment user, under the deployment lock. Never configures a repository.
set -Eeuo pipefail
umask 077
deploy=$(realpath -e -- "${1:?deploy directory}")
project=${2:?compose project}
[[ "$deploy" != / && "$deploy" != *[[:space:]%\"\\]* && "$project" =~ ^[a-z0-9][a-z0-9_-]+$ ]]
for cmd in python3 restic jq systemctl loginctl; do command -v "$cmd" >/dev/null; done
uid=$(id -u); user=$(id -un); group=$(id -gn)
[[ "$uid" == 1000 ]] || { echo 'The app and backup controller must share UID 1000.' >&2; exit 1; }
source_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
mkdir -p "$deploy/vault-tools" "$deploy/vault-control" "$deploy/.memory-vault"
python3 - "$deploy/.memory-vault/web-job.json" <<'PY'
import json,sys
from pathlib import Path
p=Path(sys.argv[1])
if p.exists() and json.loads(p.read_text()).get('result')=='running':
    raise SystemExit('A backup operation is running; retry deployment after it completes.')
PY
version=$(mktemp -d "$deploy/vault-tools/release-XXXXXXXX")
mkdir "$version/scripts"
for name in vault-control.py vault-files.py memory-vault.sh backup-common.sh; do
    install -m 700 "$source_dir/$name" "$version/scripts/$name"
done
ln -s "$version" "$deploy/vault-tools/current.new"
mv -Tf "$deploy/vault-tools/current.new" "$deploy/vault-tools/current"
python3 - "$deploy" "$project" "$uid" "$HOME" <<'PY'
import json,os,secrets,sys
from pathlib import Path
deploy,project,uid,home=sys.argv[1:]
base=Path(deploy)
key=base/'vault-control/control.key'
if not key.exists():
    key.write_text(secrets.token_hex(32)+'\n'); key.chmod(0o400)
if key.is_symlink() or key.stat().st_mode & 0o077: raise SystemExit('Unsafe control key')
policy={'deploy':deploy,'project':project,'uid':int(uid),'home':home,
        'socket':str(base/'vault-control/control.sock'),'key_file':str(key)}
path=base/'vault-tools/policy.json'
path.write_text(json.dumps(policy)+'\n');path.chmod(0o600)
overlay=base/'compose.vault.yml'
overlay.write_text('services:\n  app:\n    volumes:\n      - type: bind\n        source: '+json.dumps(str(base/'vault-control'))+'\n        target: /app/vault-control\n        read_only: true\n        bind:\n          create_host_path: false\n')
PY
units=$(mktemp -d)
trap 'rm -f -- "$units/$project-vault-control.socket" "$units/$project-vault-control.service"; rmdir -- "$units"' EXIT
cat > "$units/$project-vault-control.socket" <<EOF
[Unit]
Description=Akai Ito private backup control socket
[Socket]
ListenStream=$deploy/vault-control/control.sock
SocketUser=$user
SocketGroup=$group
SocketMode=0600
RemoveOnStop=true
[Install]
WantedBy=sockets.target
EOF
cat > "$units/$project-vault-control.service" <<EOF
[Unit]
Description=Akai Ito private backup controller
Requires=$project-vault-control.socket
After=docker.service
[Service]
User=$user
Group=$group
Environment=HOME=$HOME
Environment=XDG_RUNTIME_DIR=/run/user/$uid
ExecStart=/usr/bin/python3 $deploy/vault-tools/current/scripts/vault-control.py serve $deploy/vault-tools/policy.json
UMask=0077
KillMode=process
TimeoutStopSec=20
EOF
sudo -n install -m 644 "$units/$project-vault-control.socket" "$units/$project-vault-control.service" /etc/systemd/system/
sudo -n loginctl enable-linger "$user"
sudo -n systemctl daemon-reload
sudo -n systemctl stop "$project-vault-control.service"
sudo -n systemctl enable --now "$project-vault-control.socket"
# Boot recovery is harmless without configuration; it never creates a backup or enables a timer.
mkdir -p "$HOME/.config/systemd/user"
recovery="$HOME/.config/systemd/user/$project-memory-vault-recover.service"
if [[ -e "$recovery" ]] && ! head -n 1 "$recovery" | grep -qx '# Managed by Akai Ito backup settings'; then
    echo 'Existing unmanaged recovery unit; refusing to replace it.' >&2; exit 1
fi
cat > "$recovery" <<EOF
# Managed by Akai Ito backup settings
[Unit]
Description=Recover an interrupted Akai Ito backup
ConditionPathExists=$deploy/.memory-vault/backup.env
[Service]
Type=oneshot
Environment=MEMORY_VAULT_CONFIG=$deploy/.memory-vault/backup.env
ExecStartPre=/usr/bin/python3 $deploy/vault-tools/current/scripts/vault-control.py wait-docker $deploy/vault-tools/policy.json
ExecStart=/bin/bash $deploy/vault-tools/current/scripts/memory-vault.sh recover
UMask=0077
TimeoutStartSec=240
[Install]
WantedBy=default.target
EOF
export XDG_RUNTIME_DIR="/run/user/$uid"
systemctl --user daemon-reload
systemctl --user enable "$project-memory-vault-recover.service"
echo 'Private backup control ready; no backup schedule has been enabled.'
