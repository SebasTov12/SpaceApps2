#!/usr/bin/env bash
set -Eeuo pipefail

# Poll origin/main and deploy from an isolated, clean worktree. Keeping runtime
# data and the operator's working tree outside this checkout prevents a deploy
# from overwriting local files or uploaded NISAR inputs.
source_repo="${SPACEAPPS2_SOURCE_REPO:-/home/admin/spaceapps2}"
deploy_repo="${SPACEAPPS2_DEPLOY_REPO:-/home/admin/spaceapps2-deploy}"
env_file="${SAROS_ENV_FILE:-/home/admin/spaceapps2/.env}"
compose_file="$deploy_repo/infra/saros/docker-compose.yml"
state_dir="${STATE_DIRECTORY:-/var/lib/spaceapps2-auto-deploy}"
failure_marker="$state_dir/last-failed-commit"

exec 9>/run/lock/spaceapps2-auto-update.lock
flock -n 9 || exit 0

log() {
  printf '%s %s\n' "$(date --utc --iso-8601=seconds)" "$*"
}

compose() {
  docker compose --env-file "$env_file" -f "$compose_file" "$@"
}

record_failure() {
  mkdir -p "$state_dir"
  printf '%s\n' "$target_commit" > "$failure_marker"
}

restore_previous_release() {
  local restored=0
  log "Rolling back to ${current_commit:0:12}."
  git -C "$deploy_repo" reset --hard "$current_commit" || restored=1
  export SAROS_IMAGE_TAG="$current_commit"
  docker image tag "${old_image_ids[saros]}" "ghcr.io/sebastov12/spaceapps2-saros:${current_commit}" || restored=1
  docker image tag "${old_image_ids[api]}" "ghcr.io/sebastov12/spaceapps2-api:${current_commit}" || restored=1
  docker image tag "${old_image_ids[predictor]}" "ghcr.io/sebastov12/spaceapps2-nisar-model:${current_commit}" || restored=1
  if ! compose up -d --no-build --no-deps --wait --wait-timeout 240 saros api predictor; then
    compose logs --tail=80 --no-color saros api predictor || true
    restored=1
  fi
  return "$restored"
}

fail_before_restart() {
  local stage="$1"
  log "Deployment of ${target_commit:0:12} failed during ${stage}; running containers were left untouched."
  git -C "$deploy_repo" reset --hard "$current_commit" || true
  export SAROS_IMAGE_TAG="$current_commit"
  for service in "${!old_image_ids[@]}"; do
    if [[ -n "${old_image_ids[$service]:-}" ]]; then
      docker image tag "${old_image_ids[$service]}" "ghcr.io/sebastov12/${image_names[$service]}:${current_commit}" || true
    fi
  done
  record_failure
  exit 1
}

if [[ ! -e "$deploy_repo/.git" || ! -f "$env_file" ]]; then
  log "Auto-deploy is not initialized: deploy worktree or server .env is missing."
  exit 1
fi

if [[ -n "$(git -C "$deploy_repo" status --porcelain)" ]]; then
  log "Refusing deployment: $deploy_repo has local changes."
  git -C "$deploy_repo" status --short || true
  exit 1
fi

git -C "$deploy_repo" fetch --prune origin main
current_commit="$(git -C "$deploy_repo" rev-parse HEAD)"
target_commit="$(git -C "$deploy_repo" rev-parse origin/main)"

if [[ "$current_commit" == "$target_commit" ]]; then
  log "SAROS is current at ${current_commit:0:12}."
  exit 0
fi

if [[ -f "$failure_marker" && "$(cat "$failure_marker")" == "$target_commit" ]]; then
  log "Skipping ${target_commit:0:12}; its previous deployment failed. A new commit will trigger another attempt."
  exit 0
fi

if ! git -C "$deploy_repo" merge-base --is-ancestor "$current_commit" "$target_commit"; then
  log "Refusing deployment: origin/main is not a fast-forward from the deployed commit."
  exit 1
fi

declare -A containers=(
  [saros]="spaceapps2-saros"
  [api]="spaceapps2-api"
  [predictor]="spaceapps2-model"
)
declare -A image_names=(
  [saros]="spaceapps2-saros"
  [api]="spaceapps2-api"
  [predictor]="spaceapps2-nisar-model"
)
declare -A images=(
  [saros]="ghcr.io/sebastov12/spaceapps2-saros:${target_commit}"
  [api]="ghcr.io/sebastov12/spaceapps2-api:${target_commit}"
  [predictor]="ghcr.io/sebastov12/spaceapps2-nisar-model:${target_commit}"
)
declare -A old_image_ids=()

for service in saros api predictor; do
  container="${containers[$service]}"
  health="$(docker inspect --format '{{.State.Health.Status}}' "$container")" || fail_before_restart "preflight"
  if [[ "$health" != "healthy" ]]; then
    log "Refusing deployment: $container is currently $health. Inspect it before deploying."
    exit 1
  fi
  old_image_ids[$service]="$(docker inspect --format '{{.Image}}' "$container")" || fail_before_restart "preflight"
done

git -C "$deploy_repo" reset --hard "$target_commit"
export SAROS_IMAGE_TAG="$target_commit"
if ! compose config --quiet; then
  fail_before_restart "compose configuration validation"
fi

if [[ ! -s "$deploy_repo/models/nisar-change/composite_model.json" ]]; then
  fail_before_restart "model artifact validation"
fi

available_memory_kb="$(awk '/MemAvailable:/ { print $2; exit }' /proc/meminfo)"
if [[ -z "$available_memory_kb" ]] || (( available_memory_kb < 900000 )); then
  log "Skipping ${target_commit:0:12}: only ${available_memory_kb:-unknown} KiB RAM is available; current containers remain untouched."
  git -C "$deploy_repo" reset --hard "$current_commit"
  exit 0
fi

load_1m="$(awk '{ print $1; exit }' /proc/loadavg)"
if awk -v load="$load_1m" 'BEGIN { exit !(load >= 1.25) }'; then
  log "Skipping ${target_commit:0:12}: 1-minute load average is $load_1m; current containers remain untouched."
  git -C "$deploy_repo" reset --hard "$current_commit"
  exit 0
fi

# Images are built and published by GitHub Actions. Pull them before touching
# any running service so a missing image or registry/auth problem leaves the
# current release available and can be retried on the next timer tick.
if ! compose pull saros api predictor; then
  log "Images for ${target_commit:0:12} are not available from GHCR yet; current containers remain untouched and the next timer tick will retry."
  git -C "$deploy_repo" reset --hard "$current_commit"
  exit 0
fi

# All current migrations use CREATE ... IF NOT EXISTS, so applying them on
# each release is safe. --no-deps keeps PostgreSQL itself out of the restart.
if ! compose --profile migration run --rm --no-deps nisar-migrate; then
  fail_before_restart "database migrations"
fi

if compose up -d --no-build --no-deps --wait --wait-timeout 240 saros api predictor; then
  rm -f "$failure_marker"
  log "Deployment succeeded: ${current_commit:0:12} -> ${target_commit:0:12}."
  exit 0
fi

compose logs --tail=80 --no-color saros api predictor || true
record_failure
if restore_previous_release; then
  log "Rollback succeeded after deployment of ${target_commit:0:12} failed."
else
  log "CRITICAL: rollback failed; inspect Docker and journal immediately."
fi
exit 1
