#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
K8S="$ROOT/deploy/k8s"
RUNTIME="$K8S/runtime"

for file in r2-postgis-secret.yaml r2archive-secret.yaml; do
  if [ ! -f "$RUNTIME/$file" ]; then
    echo "missing runtime secret: $RUNTIME/$file" >&2
    exit 2
  fi
done

kubectl apply -f "$K8S/namespace.yaml"
kubectl apply -f "$RUNTIME/r2-postgis-secret.yaml"
kubectl apply -f "$RUNTIME/r2archive-secret.yaml"
kubectl apply -f "$K8S/storage.yaml"
kubectl apply -f "$K8S/app-config.yaml"
kubectl apply -f "$K8S/postgis.yaml"
kubectl rollout status statefulset/r2-postgis -n r2 --timeout=10m
kubectl apply -f "$K8S/backup-cronjob.yaml"

echo "k3s database foundation is ready"
