#!/bin/sh
# Run from repository root on the Raspberry Pi. Stop writes before copying DB and media.
set -eu
destination="${1:-backups}"
mkdir -p "$destination"
backup_dir=$(cd "$destination" && pwd)
stamp=$(date -u +%Y%m%dT%H%M%SZ)
archive="akai-ito-$stamp.tar.gz"
docker compose stop app
trap 'docker compose up -d app >/dev/null' EXIT HUP INT TERM
docker compose run --rm --no-deps --user 1000:1000 -e BACKUP_FILE="$archive" -v "$backup_dir:/backup" app sh -c 'tar -czf "/backup/$BACKUP_FILE" -C /app/data .'
docker compose run --rm --no-deps --user 1000:1000 -e BACKUP_FILE="$archive" -v "$backup_dir:/backup" app node -e 'const fs=require("node:fs"),c=require("node:crypto"); const p="/backup/"+process.env.BACKUP_FILE;fs.writeFileSync(p+".sha256",c.createHash("sha256").update(fs.readFileSync(p)).digest("hex")+"  "+process.env.BACKUP_FILE+"\n")'
printf 'Backup: %s/%s\n' "$backup_dir" "$archive"
