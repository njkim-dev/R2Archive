#!/bin/sh
set -eu

if [ "$#" -gt 1 ]; then
  echo "usage: $0 [destination-directory]" >&2
  exit 2
fi

destination=${1:-/volume1/r2archive-data/backups/postgres}
stamp=$(date +%Y%m%d-%H%M%S)
target="$destination/r2music-source-$stamp.dump"
mkdir -p "$destination"
umask 077

/volume1/@appstore/ContainerManager/usr/bin/docker exec postgres-1 \
  pg_dump -U postgres -d r2music -Fc -Z 9 > "$target"
/volume1/@appstore/ContainerManager/usr/bin/docker exec -i postgres-1 \
  pg_restore --list < "$target" >/dev/null
sha256sum "$target" > "$target.sha256"
if [ -n "${SUDO_USER:-}" ]; then
  chown "$SUDO_USER":users "$target" "$target.sha256"
  chmod 0640 "$target" "$target.sha256"
fi
echo "$target"
