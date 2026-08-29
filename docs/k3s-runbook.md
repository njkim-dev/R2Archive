# R2Archive k3s runbook

## Scope

The `r2` namespace contains only the R2Archive web/API workload and its `r2music` PostGIS database. Practice API, Redis, the blog, and `practice_api_db` remain in Docker on the NAS.

## Persistent data

- `database-r2-postgis-0`: 8Gi `local-path` PVC on the k3s VM data disk.
- `r2-static`: read-only NFS share `/volume1/r2archive-static`.
- `r2-data`: read-write NFS share `/volume1/r2archive-data` for record screenshots and database dumps.
- Daily custom-format dumps run at 03:30 Asia/Seoul and retain 30 days.

## Deploy

Runtime secrets live only on the NAS under `deploy/k8s/runtime`. Create `r2/ghcr-pull` with a token that has `read:packages`, then run:

```sh
deploy/scripts/bootstrap-k3s.sh
deploy/scripts/restore-r2music.sh /volume1/r2archive-data/backups/postgres/<dump>
deploy/scripts/deploy-k3s.sh <full-commit-sha>
```

The deployment script runs schema migrations before replacing the application Pod. Images are immutable `ghcr.io/njkim-dev/r2archive:<commit-sha>` references.

## Verify

```sh
kubectl get pods,service,pvc -n r2 -o wide
kubectl top node
kubectl top pod -n r2 --containers
curl -fsS http://192.168.0.8:30004/api/health/live
curl -fsS http://192.168.0.8:30004/api/health/ready
deploy/scripts/validate-r2music.sh
deploy/scripts/backup-restore-test.sh
```

Restart tests:

```sh
kubectl delete pod -n r2 -l app.kubernetes.io/name=r2archive
kubectl rollout status deployment/r2archive -n r2 --timeout=10m
kubectl delete pod -n r2 r2-postgis-0
kubectl rollout status statefulset/r2-postgis -n r2 --timeout=10m
```

## Roll back

During the 72-hour stabilization period, the Docker app remains available only on `127.0.0.1:3004` and uses the migrated PostGIS database. To roll back the frontend/API, change both Synology nginx upstreams to `http://127.0.0.1:3004` and reload nginx. Do not switch database storage back without a reverse data migration.

## Capacity gate

Start the VM at 2 vCPU / 5GiB. Raise it to 6GiB only after 72 hours when NAS available memory stays at or above 1.5GiB, swap usage stays at or below 256MiB, and no app or database container restarts from OOM.
