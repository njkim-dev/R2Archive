import os
from contextlib import contextmanager
from dotenv import load_dotenv
from psycopg2 import pool as pg_pool

load_dotenv()

DB_CONFIG = {
    "host":     os.environ.get("DB_HOST"),
    "port":     int(os.environ.get("DB_PORT", "5432")),
    "dbname":   os.environ.get("DB_NAME"),
    "user":     os.environ.get("DB_USER"),
    "password": os.environ.get("DB_PASSWORD"),
}

_pool: pg_pool.ThreadedConnectionPool | None = None


def init_pool():
    global _pool
    if _pool is not None:
        return
    _pool = pg_pool.ThreadedConnectionPool(minconn=2, maxconn=10, **DB_CONFIG)


def close_pool():
    global _pool
    if _pool is not None:
        _pool.closeall()
        _pool = None


def check_database():
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1")
            return cur.fetchone()[0] == 1


@contextmanager
def get_conn():
    if _pool is None:
        raise RuntimeError("커넥션 풀이 초기화되지 않았습니다")
    conn = _pool.getconn()
    try:
        yield conn
    finally:
        _pool.putconn(conn)
