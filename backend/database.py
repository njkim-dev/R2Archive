import os
from contextlib import contextmanager
from dotenv import load_dotenv
from psycopg2 import pool as pg_pool

load_dotenv()

DB_CONFIG = {
    "host":     os.environ.get("DB_HOST"),
    "port":     int(os.environ["DB_PORT"]),
    "dbname":   os.environ.get("DB_NAME"),
    "user":     os.environ.get("DB_USER"),
    "password": os.environ.get("DB_PASSWORD"),
}

_pool: pg_pool.ThreadedConnectionPool | None = None


def init_pool():
    global _pool
    _pool = pg_pool.ThreadedConnectionPool(minconn=2, maxconn=10, **DB_CONFIG)


@contextmanager
def get_conn():
    if _pool is None:
        raise RuntimeError("커넥션 풀이 초기화되지 않았습니다")
    conn = _pool.getconn()
    try:
        yield conn
    finally:
        _pool.putconn(conn)
