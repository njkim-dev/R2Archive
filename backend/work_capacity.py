import asyncio
from contextlib import contextmanager
from threading import Lock

from fastapi import HTTPException
from starlette.concurrency import run_in_threadpool


async def run_blocking(function, *args):
    worker = asyncio.create_task(run_in_threadpool(function, *args))
    cancelled = False
    while True:
        try:
            result = await asyncio.shield(worker)
            break
        except asyncio.CancelledError:
            if worker.cancelled():
                raise
            cancelled = True
    if cancelled:
        raise asyncio.CancelledError
    return result


class WorkCapacity:
    def __init__(self, limit: int):
        self.limit = limit
        self.users = set()
        self.lock = Lock()

    @contextmanager
    def enter(self, user_id: int):
        with self.lock:
            if user_id in self.users or len(self.users) >= self.limit:
                raise HTTPException(429, "처리 중인 작업이 있습니다. 잠시 후 다시 시도해주세요.",
                                    headers={"Retry-After": "5"})
            self.users.add(user_id)
        try:
            yield
        finally:
            with self.lock:
                self.users.discard(user_id)
