#!/bin/sh
set -eu

job="r2music-restore-test-$(date +%s)"
kubectl create job --from=cronjob/r2music-backup "$job" -n r2
kubectl wait --for=condition=complete "job/$job" -n r2 --timeout=15m
kubectl logs "job/$job" -n r2

pod=$(kubectl get pod -n r2 -l app.kubernetes.io/name=r2-postgis -o jsonpath='{.items[0].metadata.name}')
kubectl exec -n r2 "$pod" -- sh -ceu '
  export PGPASSWORD="$POSTGRES_PASSWORD"
  latest=$(ls -1t /backup/postgres/r2music-*.dump | head -n 1)
  pg_restore --list "$latest" >/dev/null
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE IF EXISTS r2music_restore_test WITH (FORCE)"
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE r2music_restore_test"
  pg_restore --exit-on-error --no-owner --no-privileges -U "$POSTGRES_USER" -d r2music_restore_test "$latest"
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d r2music_restore_test -c "SELECT count(*) FROM songs"
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE r2music_restore_test WITH (FORCE)"
' || {
  kubectl delete job "$job" -n r2 --ignore-not-found=true
  exit 1
}
kubectl delete job "$job" -n r2 --wait=true
echo "backup restore test passed"
