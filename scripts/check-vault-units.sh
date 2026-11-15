#!/usr/bin/env bash
# Offline syntax/calendar validation, never installs or starts a service.
set -Eeuo pipefail
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
work=$(mktemp -d /tmp/akai-vault-units-XXXXXXXXXX)
trap 'case "$work" in /tmp/akai-vault-units-*) rm -rf --one-file-system -- "$work";; esac' EXIT
for file in "$root"/docker/systemd/akai-memory-vault*; do
    # Only replace deliberately unresolved installation placeholders for validation.
    sed -e 's/^User=CHANGE_ME$/User=root/' -e 's|^WorkingDirectory=/opt/akai-ito$|WorkingDirectory=/tmp|' \
        -e 's|^ExecStart=/bin/bash /opt/akai-ito/scripts/memory-vault.sh|ExecStart=/bin/true|' "$file" > "$work/$(basename "$file")"
done
printf '[Unit]\nDescription=Offline Docker dependency fixture\n[Service]\nType=oneshot\nExecStart=/bin/true\n' > "$work/docker.service"
SYSTEMD_UNIT_PATH="$work:/etc/systemd/system:/usr/lib/systemd/system:/lib/systemd/system" systemd-analyze verify "$work"/akai-memory-vault*
systemd-analyze calendar '*-*-* 03:30:00 Europe/Rome'
printf 'Systemd templates and Europe/Rome calendar validated offline. No scheduler installed.\n'
