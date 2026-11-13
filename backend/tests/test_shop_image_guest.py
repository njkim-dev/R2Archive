from contextlib import contextmanager
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import MagicMock, patch
import os
import unittest

os.environ.setdefault('SESSION_SECRET', 'guest-image-search-test-secret-at-least-32-characters')

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from PIL import Image
import jwt

import shop_image_guest as guest
import shop_image_history as history
from routers import shop_image_search as api
from security_middleware import BrowserCSRFMiddleware


def png():
    stream = BytesIO(); Image.new('RGB', (32, 64)).save(stream, format='PNG'); return stream.getvalue()


class GuestSearchTests(unittest.TestCase):
    def setUp(self):
        limiter = patch.object(api.limiter, 'enabled', False)
        limiter.start(); self.addCleanup(limiter.stop)

    def client(self):
        app = FastAPI(); app.include_router(api.router)
        return TestClient(app, base_url='https://testserver')

    def test_signed_cookie_is_private_and_tampering_cannot_start_a_search(self):
        client = self.client()
        with patch.object(history, 'guest_usage', return_value=guest.usage(0)):
            response = client.get('/api/shop/image-search/access')
            self.assertEqual(response.json()['remaining'], 5)
            cookie = response.headers['set-cookie']
            for value in ['HttpOnly', 'Secure', 'SameSite=lax', 'Path=/api/shop/image-search']:
                self.assertIn(value, cookie)
            self.assertEqual(response.headers['cache-control'], 'private, no-store')
        token = jwt.encode({'purpose': guest.COOKIE, 'guest_id': 'a'*32}, 'wrong-signing-key-at-least-32-bytes', algorithm='HS256')
        client.cookies.clear(); client.cookies.set(guest.COOKIE, token)
        with patch.object(api, 'find_guest') as find:
            response = client.post('/api/shop/image-search', data={'mode':'terra','sex':'male','slot':'all'}, files={'image':('a.png',png(),'image/png')})
            self.assertEqual(response.status_code, 428); find.assert_not_called()

    def test_five_searches_then_server_denies_sixth_without_inference(self):
        client = self.client(); used = 0
        def reserve(*args, **kwargs):
            nonlocal used
            if used >= 5: raise guest.exhausted()
            used += 1
            return str(used)
        context = MagicMock()
        with patch.object(history, 'guest_usage', side_effect=lambda value: guest.usage(used)), patch.object(history, 'create', side_effect=reserve), \
             patch.object(api, 'get_conn', return_value=context), patch.object(api, 'catalog', return_value={'revision':'a'*20}), \
             patch.object(api.outfit, 'configured', return_value=True), patch.object(api, 'find_outfit', return_value={'groups':[]}) as find:
            client.get('/api/shop/image-search/access')
            for count in range(1, 6):
                response = client.post('/api/shop/image-search', data={'mode':'terra','sex':'male','slot':'all'}, files={'image':('a.png',png(),'image/png')})
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json()['guest_usage']['remaining'], 5-count)
            response = client.post('/api/shop/image-search', data={'mode':'terra','sex':'male','slot':'all'}, files={'image':('a.png',png(),'image/png')})
            self.assertEqual(response.status_code, 429); self.assertEqual(response.json()['detail'], guest.LIMIT_MESSAGE)
            self.assertEqual(find.call_count, 5)
            self.assertEqual(client.get('/api/shop/image-search/access').json()['remaining'], 0)

    def test_last_slot_is_reserved_under_database_lock_and_rejection_removes_upload(self):
        cursor = MagicMock(); cursor.fetchone.return_value = {'used':4}
        @contextmanager
        def transaction(write=False): yield cursor
        with TemporaryDirectory() as directory, patch.object(history,'DIRECTORY',Path(directory)), patch.object(history,'transaction',transaction):
            history.create(png(), None, 'male','all','v','a.png','terra',guest_id='a'*32)
            queries = [call.args[0] for call in cursor.execute.call_args_list]
            self.assertIn('pg_advisory_xact_lock', queries[0]); self.assertIn('SELECT count(*)', queries[1]); self.assertIn('INSERT INTO', queries[2])
            self.assertIn("'running','completed'", queries[1])
            self.assertEqual(cursor.execute.call_args.args[1][-1].adapted, {'guest_id':'a'*32})
            cursor.fetchone.return_value = {'used':5}
            with self.assertRaises(HTTPException) as failure:
                history.create(png(), None, 'male','all','v','b.png','terra',guest_id='a'*32)
            self.assertEqual(failure.exception.status_code, 429)
            self.assertEqual(len(list(Path(directory).iterdir())), 1)

    def test_failed_inference_releases_reserved_slot_and_diagnostics_preserve_identity(self):
        with patch.object(api, 'get_conn'), patch.object(api, 'catalog', return_value={'revision':'a'*20}), \
             patch.object(api.outfit, 'configured', return_value=True), patch.object(history, 'create', return_value='search'), \
             patch.object(api, 'find_outfit', side_effect=HTTPException(503,'failed')), patch.object(history, 'finish') as finish:
            with self.assertRaises(HTTPException): api.find_guest(png(),'male','all',None,'terra','a'*32,'a.png')
            self.assertTrue(finish.call_args.kwargs['error'])
        cursor = MagicMock()
        @contextmanager
        def transaction(write=False): yield cursor
        with patch.object(history,'transaction',transaction): history.finish('search', {'groups':[]}, {'cost':.01})
        self.assertIn('diagnostics=diagnostics ||', cursor.execute.call_args.args[0])

    def test_member_does_not_consume_guest_allowance_and_guest_cookie_enforces_csrf(self):
        app = FastAPI(); app.include_router(api.router); app.dependency_overrides[api.search_user] = lambda: 1
        with patch.object(history,'guest_usage') as usage, patch.object(api,'find_outfit',return_value={'groups':[]}), patch.object(history,'create') as create:
            client = TestClient(app)
            self.assertTrue(client.get('/api/shop/image-search/access').json()['authenticated'])
            self.assertEqual(client.post('/api/shop/image-search',data={'mode':'terra','sex':'male','slot':'all'},files={'image':('a.png',png(),'image/png')}).status_code,200)
            usage.assert_not_called(); create.assert_not_called()
        app = FastAPI(); app.include_router(api.router)
        app.add_middleware(BrowserCSRFMiddleware)
        response = TestClient(app).post('/api/shop/image-search',headers={'Cookie':guest.COOKIE+'=token','Origin':'https://untrusted.example'})
        self.assertEqual(response.status_code,403)
