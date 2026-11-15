# Disposable Linux tooling for local backup tests; never used by the app service.
FROM node:24-bookworm-slim
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends bash restic jq util-linux python3 shellcheck systemd tzdata ca-certificates curl && rm -rf /var/lib/apt/lists/*
# Docker CLI only. The operator's daemon is used exclusively by opt-in QA.
COPY --from=docker:27-cli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=docker:27-cli /usr/local/libexec/docker/cli-plugins/docker-compose /usr/local/libexec/docker/cli-plugins/docker-compose
WORKDIR /workspace
COPY . .
CMD ["bash", "scripts/test-memory-vault.sh"]
