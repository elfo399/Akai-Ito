#!/bin/sh
# Run by the trusted Jenkins agent on the Raspberry. Never removes volumes.
set -eu
umask 077

image="${1:?Uso: sh scripts/jenkins-deploy.sh immagine directory-deploy}"
deploy_dir="${2:?Indica una directory di deploy già configurata}"
project="${COMPOSE_PROJECT_NAME:-akai-ito}"
case "$image" in akai-ito:*) ;; *) printf 'Immagine non valida\n' >&2; exit 1;; esac
case "$deploy_dir" in /*) ;; *) printf 'La directory di deploy deve essere assoluta\n' >&2; exit 1;; esac
if [ "$deploy_dir" = / ] || [ ! -d "$deploy_dir" ] || [ ! -r "$deploy_dir/.env" ]; then
    printf 'Preparare la directory di deploy e il suo file .env prima di abilitare il job.\n' >&2
    exit 1
fi
case "$project" in ''|*[!a-z0-9_-]*) printf 'Nome progetto Compose non valido\n' >&2; exit 1;; esac
command -v flock >/dev/null
docker image inspect "$image" >/dev/null
deploy_dir=$(cd "$deploy_dir" && pwd -P)
exec 9>"$deploy_dir/.deploy.lock"
flock -n 9 || { printf 'Un altro deploy è in corso\n' >&2; exit 1; }

compose() {
    if [ -f "$deploy_dir/compose.proxy.yml" ]; then
        docker compose --project-name "$project" --project-directory "$deploy_dir" \
            --env-file "$deploy_dir/.env" -f docker-compose.yml -f "$deploy_dir/compose.proxy.yml" "$@"
    else
        docker compose --project-name "$project" --project-directory "$deploy_dir" \
            --env-file "$deploy_dir/.env" -f docker-compose.yml "$@"
    fi
}
# Validate config before stopping any existing application.
APP_IMAGE="$image" compose config --quiet
container=$(docker ps -aq --filter "label=com.docker.compose.project=$project" --filter 'label=com.docker.compose.service=app' --filter 'label=com.docker.compose.oneoff=False')
old_image=''
stopped=false
if [ -n "$container" ]; then
    if [ "$(printf '%s\n' "$container" | wc -l | tr -d ' ')" != 1 ]; then
        printf 'Trovati più container app: verificare il progetto Compose prima di continuare.\n' >&2
        exit 1
    fi
    old_image=$(docker inspect --format '{{.Image}}' "$container")
    # Do not silently attach a different/empty data volume to an existing diary.
    actual_volume=$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/app/data"}}{{.Name}}{{end}}{{end}}' "$container")
    expected_volume="${project}_diary-data"
    if [ "$actual_volume" != "$expected_volume" ]; then
        printf 'Il volume esistente richiede una configurazione dedicata prima del deploy automatico.\n' >&2
        exit 1
    fi
fi

rollback() {
    result=$?
    trap - EXIT HUP INT TERM
    if [ "$result" -ne 0 ] && [ "$stopped" = true ] && [ -n "$old_image" ]; then
        printf 'Deploy fallito: riavvio della precedente immagine.\n' >&2
        APP_IMAGE="$old_image" compose up -d --no-build --pull never --wait --wait-timeout 180 app || \
            printf 'Ripristino automatico non riuscito: consultare Jenkins e il backup.\n' >&2
    fi
    exit "$result"
}
trap rollback EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP

if [ -n "$old_image" ]; then
    mkdir -p "$deploy_dir/backups"
    stamp=$(date -u +%Y%m%dT%H%M%SZ)
    backup_file="before-deploy-$stamp.tar.gz"
    stopped=true
    APP_IMAGE="$old_image" compose stop --timeout 30 app
    # No writers while DB, WAL and photographs are archived together.
    # Stream to a file owned by the Jenkins user, avoiding host UID assumptions
    # and preventing private archive bytes from entering Docker/Jenkins logs.
    docker run --rm --read-only --network none --log-driver none --cap-drop ALL --security-opt no-new-privileges:true \
        --user 1000:1000 --mount "type=volume,source=$actual_volume,target=/data,readonly" \
        "$old_image" tar -czf - -C /data . > "$deploy_dir/backups/$backup_file"
    (cd "$deploy_dir/backups" && sha256sum "$backup_file" > "$backup_file.sha256")
fi

APP_IMAGE="$image" compose up -d --no-build --pull never --wait --wait-timeout 180 app
APP_IMAGE="$image" compose exec -T app node apps/api/dist/cli.js verify
# Keep a recovery copy outside the disposable Jenkins workspace.
cp docker-compose.yml "$deploy_dir/docker-compose.yml.tmp"
mv "$deploy_dir/docker-compose.yml.tmp" "$deploy_dir/docker-compose.yml"
printf '%s\n' "$image" > "$deploy_dir/current-image.tmp"
mv "$deploy_dir/current-image.tmp" "$deploy_dir/current-image"
printf 'Deploy verificato: %s\n' "$image"
