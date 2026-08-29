#!/bin/sh
set -eu

if [ "$(id -u)" -eq 0 ] && [ -z "${KUBECONFIG:-}" ] && [ -n "${SUDO_USER:-}" ]; then
  KUBECONFIG="/var/services/homes/$SUDO_USER/.kube/config"
  export KUBECONFIG
fi

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT HUP INT TERM

source_psql() {
  /volume1/@appstore/ContainerManager/usr/bin/docker exec postgres-1 \
    psql -X -U postgres -d r2music "$@"
}

pod=$(kubectl get pod -n r2 -l app.kubernetes.io/name=r2-postgis -o jsonpath='{.items[0].metadata.name}')
target_psql() {
  kubectl exec -n r2 "$pod" -- sh -c \
    'export PGPASSWORD="$POSTGRES_PASSWORD"; exec psql -X -U "$POSTGRES_USER" -d r2music "$@"' sh "$@"
}

inventory_sql="COPY (
  SELECT 'table' AS kind, table_schema || '.' || table_name AS name
  FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  UNION ALL
  SELECT 'sequence', sequence_schema || '.' || sequence_name
  FROM information_schema.sequences WHERE sequence_schema = 'public'
  UNION ALL
  SELECT 'extension', extname FROM pg_extension
  UNION ALL
  SELECT 'constraint', n.nspname || '.' || c.relname || '.' || con.conname
  FROM pg_constraint con
  JOIN pg_class c ON c.oid = con.conrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
  ORDER BY 1, 2
) TO STDOUT WITH CSV"

source_psql -Atc "$inventory_sql" | sort > "$work/source-inventory.csv"
target_psql -Atc "$inventory_sql" | sort > "$work/target-inventory.csv"

source_psql -Atc "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name" > "$work/tables"
: > "$work/source-counts"
: > "$work/target-counts"
while IFS= read -r table; do
  source_count=$(source_psql -Atc "SELECT count(*) FROM public.\"$table\"")
  target_count=$(target_psql -Atc "SELECT count(*) FROM public.\"$table\"")
  printf '%s|%s\n' "$table" "$source_count" >> "$work/source-counts"
  printf '%s|%s\n' "$table" "$target_count" >> "$work/target-counts"
done < "$work/tables"

diff -u "$work/source-counts" "$work/target-counts"

missing=$(comm -23 "$work/source-inventory.csv" "$work/target-inventory.csv")
if [ -n "$missing" ]; then
  echo "target database is missing schema objects:" >&2
  printf '%s\n' "$missing" >&2
  exit 1
fi

source_psql -Atc "SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema='public' ORDER BY sequence_name" > "$work/sequences"
: > "$work/source-sequences"
: > "$work/target-sequences"
while IFS= read -r sequence; do
  source_value=$(source_psql -Atc "SELECT last_value || '|' || is_called FROM public.\"$sequence\"")
  target_value=$(target_psql -Atc "SELECT last_value || '|' || is_called FROM public.\"$sequence\"")
  printf '%s|%s\n' "$sequence" "$source_value" >> "$work/source-sequences"
  printf '%s|%s\n' "$sequence" "$target_value" >> "$work/target-sequences"
done < "$work/sequences"
diff -u "$work/source-sequences" "$work/target-sequences"

echo "database validation passed: $(wc -l < "$work/tables" | tr -d ' ') tables"
