#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
  echo "usage: $0 <custom-format-dump>" >&2
  exit 2
fi

dump=$1
test -r "$dump"
pod=$(kubectl get pod -n r2 -l app.kubernetes.io/name=r2-postgis -o jsonpath='{.items[0].metadata.name}')
test -n "$pod"

cat "$dump" | kubectl exec -i -n r2 "$pod" -- sh -c 'cat > /tmp/r2music-restore.dump'
kubectl exec -n r2 "$pod" -- sh -ceu '
  export PGPASSWORD="$POSTGRES_PASSWORD"
  pg_restore --list /tmp/r2music-restore.dump >/dev/null
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres \
    --set=app_user="$APP_DB_USER" <<SQL
  SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '\''r2music'\'' AND pid <> pg_backend_pid();
  DROP DATABASE IF EXISTS r2music;
  CREATE DATABASE r2music OWNER :"app_user";
SQL
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d r2music <<SQL
  CREATE EXTENSION IF NOT EXISTS postgis;
  CREATE EXTENSION IF NOT EXISTS postgis_topology;
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
  CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
SQL
  pg_restore --exit-on-error --no-owner --no-privileges --no-comments \
    --role="$APP_DB_USER" -U "$POSTGRES_USER" -d r2music /tmp/r2music-restore.dump
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d r2music \
    --set=app_user="$APP_DB_USER" <<SQL
  ALTER SCHEMA public OWNER TO :"app_user";
  GRANT CONNECT, TEMPORARY ON DATABASE r2music TO :"app_user";
  GRANT USAGE, CREATE ON SCHEMA public TO :"app_user";
SQL
  rm -f /tmp/r2music-restore.dump
'
echo "restored $dump"
