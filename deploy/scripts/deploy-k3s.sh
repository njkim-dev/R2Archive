#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
  echo "usage: $0 <40-character-git-sha|full-image>" >&2
  exit 2
fi

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
K8S="$ROOT/deploy/k8s"
value=$1
case "$value" in
  *:*) image=$value ;;
  ???????*) image="ghcr.io/njkim-dev/r2archive:$value" ;;
  *) echo "invalid image or commit SHA: $value" >&2; exit 2 ;;
esac

if ! kubectl get secret ghcr-pull -n r2 >/dev/null 2>&1; then
  echo "missing image pull secret: r2/ghcr-pull" >&2
  exit 3
fi

deploy_id=$(printf '%s' "$value" | tr -cd 'a-zA-Z0-9' | cut -c1-20)
app_rendered=$(mktemp)
migration_rendered=$(mktemp)
trap 'rm -f "$app_rendered" "$migration_rendered"' EXIT HUP INT TERM

sed "s|__R2ARCHIVE_IMAGE__|$image|g" "$K8S/app.yaml.tpl" > "$app_rendered"
sed -e "s|__R2ARCHIVE_IMAGE__|$image|g" \
    -e "s|__DEPLOY_ID__|$deploy_id|g" \
    "$K8S/migration-job.yaml.tpl" > "$migration_rendered"

kubectl apply -f "$K8S/app-config.yaml"
kubectl delete job "r2archive-migrate-$deploy_id" -n r2 --ignore-not-found=true --wait=true
kubectl apply -f "$migration_rendered"
if ! kubectl wait --for=condition=complete "job/r2archive-migrate-$deploy_id" -n r2 --timeout=10m; then
  kubectl logs "job/r2archive-migrate-$deploy_id" -n r2 --all-containers=true || true
  exit 4
fi
kubectl logs "job/r2archive-migrate-$deploy_id" -n r2 --all-containers=true

kubectl apply -f "$app_rendered"
kubectl apply -f "$K8S/backup-cronjob.yaml"
kubectl rollout status deployment/r2archive -n r2 --timeout=15m
kubectl get pods,service,pvc -n r2 -o wide
echo "deployed image=$image"
