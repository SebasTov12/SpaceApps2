#!/usr/bin/env bash
set -Eeuo pipefail

repo_dir="/home/admin/spaceapps2"
compose_file="$repo_dir/infra/saros/docker-compose.yml"

exec 9>/run/lock/spaceapps2-auto-update.lock
flock -n 9 || exit 0

if [[ -n "$(git -C "$repo_dir" status --porcelain)" ]]; then
  echo "Refusing auto-update: $repo_dir has local changes."
  exit 1
fi

git -C "$repo_dir" fetch --prune origin main
current_commit="$(git -C "$repo_dir" rev-parse HEAD)"
target_commit="$(git -C "$repo_dir" rev-parse origin/main)"

if [[ "$current_commit" == "$target_commit" ]]; then
  echo "SAROS is already current at ${current_commit:0:12}."
  exit 0
fi

if ! git -C "$repo_dir" merge-base --is-ancestor "$current_commit" "$target_commit"; then
  echo "Refusing auto-update: origin/main is not a fast-forward from local HEAD."
  exit 1
fi

git -C "$repo_dir" pull --ff-only origin main
docker compose \
  --env-file "$repo_dir/.env" \
  -f "$compose_file" \
  up -d --build
