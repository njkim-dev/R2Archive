from __future__ import annotations

import argparse
import hashlib
from pathlib import Path

import psycopg2

from database import DB_CONFIG


MIGRATIONS_DIR = Path(__file__).with_name("migrations")
ADVISORY_LOCK_ID = 824244512


def migration_files() -> list[Path]:
    return sorted(MIGRATIONS_DIR.glob("*.sql"), key=lambda path: path.name)


def checksum(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def ensure_tracking_table(cur) -> None:
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS schema_migrations (
          filename   TEXT PRIMARY KEY,
          checksum   CHAR(64) NOT NULL,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )


def has_existing_schema(cur) -> bool:
    cur.execute("SELECT to_regclass('public.songs') IS NOT NULL")
    return bool(cur.fetchone()[0])


def baseline(cur, files: list[Path]) -> None:
    for path in files:
        cur.execute(
            """
            INSERT INTO schema_migrations (filename, checksum)
            VALUES (%s, %s)
            ON CONFLICT (filename) DO NOTHING
            """,
            (path.name, checksum(path)),
        )


def apply_pending(cur, files: list[Path]) -> None:
    cur.execute("SELECT filename, checksum FROM schema_migrations")
    applied = dict(cur.fetchall())
    for path in files:
        digest = checksum(path)
        if path.name in applied:
            if applied[path.name].strip() != digest:
                raise RuntimeError(f"applied migration was modified: {path.name}")
            continue
        cur.execute(path.read_text(encoding="utf-8"))
        cur.execute(
            "INSERT INTO schema_migrations (filename, checksum) VALUES (%s, %s)",
            (path.name, digest),
        )
        print(f"applied {path.name}", flush=True)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--baseline-existing",
        action="store_true",
        help="mark current migrations as applied when restoring a pre-migration database",
    )
    args = parser.parse_args()
    files = migration_files()
    if not files:
        raise RuntimeError(f"no SQL migrations found in {MIGRATIONS_DIR}")

    with psycopg2.connect(**DB_CONFIG) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT pg_advisory_xact_lock(%s)", (ADVISORY_LOCK_ID,))
            tracking_existed = False
            cur.execute("SELECT to_regclass('public.schema_migrations') IS NOT NULL")
            tracking_existed = bool(cur.fetchone()[0])
            ensure_tracking_table(cur)
            if args.baseline_existing and not tracking_existed and has_existing_schema(cur):
                baseline(cur, files)
                print(f"baselined {len(files)} existing migrations", flush=True)
            apply_pending(cur, files)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
