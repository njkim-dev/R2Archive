import asyncio
from concurrent.futures import ThreadPoolExecutor
from ipaddress import ip_network
from threading import Event
import os
import unittest
from unittest.mock import patch

os.environ.setdefault('SESSION_SECRET', 'ip-allowance-tests-at-least-32-characters-long')

from fastapi import HTTPException
from starlette.requests import Request
import rate_limit
import shop_image_guest as guest
from routers import shop_image_search as api
from work_capacity import run_blocking


def request(peer='198.51.100.20', forwarded=None):
    headers = [] if forwarded is None else [(b'x-forwarded-for', forwarded.encode())]
    return Request({'type':'http', 'method':'GET', 'path':'/', 'headers':headers, 'client':(peer,1234)})


class IPAllowanceTests(unittest.TestCase):
    def test_identifiers_are_process_specific_and_trusted_proxy_rules_prevent_spoofing(self):
        memory = guest.IPAllowance()
        with patch.object(rate_limit, '_TRUSTED_PROXIES', (ip_network('10.0.0.0/8'),)):
            key = memory.key(request())
            self.assertEqual(key, memory.key(request(forwarded='203.0.113.90')))
            self.assertEqual(key, memory.key(request('10.1.2.3','198.51.100.20')))
            self.assertNotEqual(key, memory.key(request('10.1.2.3','198.51.100.21')))
            self.assertEqual(key, memory.key(request('::ffff:198.51.100.20')))
            self.assertNotEqual(key, guest.IPAllowance().key(request()))
            self.assertEqual(len(key),32)
        for _ in range(100):
            self.assertEqual(memory.usage(memory.key(request()))['remaining'],5)
        self.assertEqual(memory._entries,{})

    def test_pending_work_reserves_the_last_slot_and_failures_refund_it(self):
        memory = guest.IPAllowance(); key = memory.key(request())
        memory.usage(key,4)
        started, finish = Event(), Event()
        def work():
            with memory.reserve(key):
                started.set(); self.assertTrue(finish.wait(3))
        with ThreadPoolExecutor(max_workers=1) as pool:
            job = pool.submit(work)
            try:
                self.assertTrue(started.wait(3))
                self.assertEqual(memory.usage(key,5)['remaining'],0)
                with self.assertRaises(HTTPException) as failure:
                    with memory.reserve(key): self.fail('Sixth request started')
                self.assertEqual(failure.exception.status_code,429)
            finally:
                finish.set()
            job.result()
        self.assertEqual(memory.usage(key)['used'],5)
        other = memory.key(request('198.51.100.21'))
        with self.assertRaises(RuntimeError):
            with memory.reserve(other): raise RuntimeError('failed')
        self.assertEqual(memory.usage(other)['remaining'],5)

    def test_bounded_memory_never_evicts_an_exhausted_entry_to_allow_bypass(self):
        memory = guest.IPAllowance(max_entries=1); key=memory.key(request())
        memory.usage(key,5)
        with self.assertRaises(HTTPException) as failure:
            with memory.reserve(memory.key(request('198.51.100.21'))): pass
        self.assertEqual(failure.exception.status_code,503)
        self.assertEqual(memory.usage(key)['remaining'],0)
        self.assertEqual(guest.IPAllowance().usage(key)['remaining'],5)

    def test_client_disconnect_does_not_refund_a_completed_paid_search(self):
        memory = guest.IPAllowance(); key = memory.key(request())
        started, finish = Event(), Event()
        def find(*args):
            started.set(); self.assertTrue(finish.wait(3)); return {'groups':[]}
        async def scenario():
            task = asyncio.create_task(run_blocking(api.find_ip_guest,key,b'image','male','all',None,'terra','random-cookie-id','a.png'))
            for _ in range(200):
                if started.is_set(): break
                await asyncio.sleep(.005)
            self.assertTrue(started.is_set())
            task.cancel(); finish.set()
            with self.assertRaises(asyncio.CancelledError): await task
        with patch.object(guest,'ip_allowance',memory), patch.object(api,'find_guest',side_effect=find):
            asyncio.run(scenario())
        self.assertEqual(memory.usage(key)['used'],1)
