import os
import unittest
from unittest.mock import MagicMock, patch

import jwt
from fastapi import FastAPI
from fastapi.testclient import TestClient

os.environ.setdefault('SESSION_SECRET', 'wardrobe-test-secret-at-least-32-characters')
import auth
from routers import shop
from security_middleware import BrowserCSRFMiddleware


class WardrobeTests(unittest.TestCase):
    def client(self, uid=7, csrf=False):
        app = FastAPI(); app.include_router(shop.router)
        if csrf:
            app.add_middleware(BrowserCSRFMiddleware)
        client = TestClient(app)
        if uid:
            client.cookies.set(auth.SESSION_COOKIE, jwt.encode({'sub': str(uid)}, auth.SESSION_SECRET, algorithm='HS256'))
        return client

    def database(self):
        cur, conn, ctx = MagicMock(), MagicMock(), MagicMock()
        conn.cursor.return_value.__enter__.return_value = cur
        ctx.__enter__.return_value = conn
        return cur, conn, ctx

    def test_guest_and_cross_origin_cannot_read_or_change_wardrobe(self):
        with patch.object(shop, 'get_conn') as connection:
            for method, url in [('get','/wardrobe'), ('post','/wardrobe/200'), ('put','/wardrobe/200/main?sex=male'), ('get','/items?owned_only=true')]:
                self.assertEqual(getattr(self.client(None), method)('/api/shop' + url).status_code, 401)
            self.assertEqual(self.client(csrf=True).post('/api/shop/wardrobe/200', headers={'Origin':'https://wrong.invalid'}).status_code, 403)
            connection.assert_not_called()

    def test_saved_ids_and_mains_are_scoped_to_session_owner(self):
        cur, conn, ctx = self.database()
        cur.fetchone.return_value = {'owned':'shop_wardrobe','mains':'shop_wardrobe_mains'}
        cur.fetchall.side_effect = [[{'item_id':200}], [{'id':200,'revision':'a'*20,'slot':'top'}], [{'item_id':200,'sex':'male','slot':'top'}]]
        with patch.object(shop, 'fetch_user', return_value={'id':7}), patch.object(shop, 'get_conn', return_value=ctx), patch.object(shop, 'catalog', return_value={'revision':'a'*20}):
            result = self.client().get('/api/shop/wardrobe?user_id=999')
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()['ids'], ['200'])
        self.assertEqual(result.json()['mains'][0]['item']['id'], '200')
        for call in cur.execute.call_args_list[1:]:
            self.assertIn(7, call.args[1]); self.assertNotIn(999, call.args[1])
        self.assertEqual(result.headers['cache-control'], 'private, no-store')
        conn.commit.assert_not_called()

    def test_first_save_is_serialized_and_preserves_any_existing_main(self):
        for item_sex, genders in [('male',['male']),('female',['female']),('common',['male','female'])]:
            cur, conn, ctx = self.database()
            with patch.object(shop,'fetch_user',return_value={'id':7}), patch.object(shop,'get_conn',return_value=ctx), patch.object(shop,'wardrobe_storage'), patch.object(shop,'catalog',return_value={'revision':'a'*20}), patch.object(shop,'wardrobe_state',return_value={'ids':['200'],'mains':[]}):
                cur.fetchone.return_value = {'sex':item_sex,'slot':'pet' if item_sex == 'common' else 'top'}
                response = self.client().post('/api/shop/wardrobe/200?user_id=999')
            self.assertEqual(response.status_code, 200)
            statements = cur.execute.call_args_list
            self.assertIn('FOR UPDATE', statements[0].args[0]); self.assertEqual(statements[0].args[1], (7,))
            main_writes = [c for c in statements if 'INSERT INTO shop_wardrobe_mains' in c.args[0]]
            self.assertEqual([c.args[1][1] for c in main_writes], genders)
            self.assertTrue(all('DO NOTHING' in c.args[0] for c in main_writes))
            conn.commit.assert_called_once()

    def test_main_requires_saved_item_and_matching_gender(self):
        for item_sex, owned, expected in [('female',True,422),('male',False,404),('common',True,200)]:
            cur, conn, ctx = self.database(); cur.fetchone.return_value = {'item_id':200} if owned else None
            with patch.object(shop,'fetch_user',return_value={'id':7}), patch.object(shop,'get_conn',return_value=ctx), patch.object(shop,'wardrobe_item',return_value=('a'*20,{'sex':item_sex,'slot':'pet'})), patch.object(shop,'wardrobe_state',return_value={'ids':['200'],'mains':[]}):
                response = self.client().put('/api/shop/wardrobe/200/main?sex=male&user_id=999')
            self.assertEqual(response.status_code, expected)
            if expected != 200:
                conn.commit.assert_not_called()
            else:
                self.assertEqual(cur.execute.call_args.args[1], (7,'male','pet',200))
                self.assertIn('DO UPDATE SET item_id', cur.execute.call_args.args[0])

    def test_unreleased_never_discloses_price_duration_or_new_flag(self):
        row = {'id':30320871,'revision':'a'*20,'is_unreleased':True,'is_new':True,'prices':[{'key':'P30','amount':1000}]}
        result = shop.serialize(row)
        self.assertEqual(result['prices'], [])
        self.assertFalse(result['is_new'])
        self.assertTrue(result['is_unreleased'])

    def test_unreleased_filter_only_opens_wearables_and_owned_filter_binds_owner(self):
        for include in [False, True]:
            cur, conn, ctx = self.database(); cur.fetchone.return_value={'count':0}; cur.fetchall.return_value=[]
            with patch.object(shop,'fetch_user',return_value={'id':7}), patch.object(shop,'get_conn',return_value=ctx), patch.object(shop,'catalog',return_value={'revision':'a'*20}):
                response=self.client().get('/api/shop/items',params={'owned_only':True,'include_unreleased':include,'sex':'female','slot':'top','cursor':''})
            self.assertEqual(response.status_code,200)
            for call in cur.execute.call_args_list:
                self.assertIn('owned.user_id = %s',call.args[0]); self.assertIn(7,call.args[1])
                self.assertIn('owned.item_id = shop_items.item_id',call.args[0])
                self.assertEqual('show OR' in call.args[0],include)
                self.assertIn("= 'wearable'",call.args[0])


if __name__ == '__main__':
    unittest.main()
