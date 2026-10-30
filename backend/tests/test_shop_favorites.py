import os
import unittest
from unittest.mock import MagicMock, patch

import jwt
from fastapi import FastAPI
from fastapi.testclient import TestClient

os.environ.setdefault('SESSION_SECRET','shop-favorite-test-session-secret-at-least-32-characters')
import auth
from routers import shop
from security_middleware import BrowserCSRFMiddleware


class ShopFavoriteTests(unittest.TestCase):
    def client(self, uid=7, csrf=False):
        app=FastAPI()
        app.include_router(shop.router)
        if csrf:
            app.add_middleware(BrowserCSRFMiddleware)
        client=TestClient(app)
        client.cookies.set(auth.SESSION_COOKIE,jwt.encode({'sub':str(uid)},auth.SESSION_SECRET,algorithm='HS256'))
        return client

    def database(self):
        cur=MagicMock()
        connection=MagicMock()
        connection.cursor.return_value.__enter__.return_value=cur
        context=MagicMock()
        context.__enter__.return_value=connection
        return cur,connection,context

    def test_regular_members_read_only_their_own_ids(self):
        for uid in [7,8]:
            cur,conn,context=self.database()
            cur.fetchone.return_value=('shop_favorites',)
            cur.fetchall.return_value=[(200,),(201,)]
            with patch.object(shop,'fetch_user',return_value={'id':uid,'is_admin':False}),patch.object(shop,'get_conn',return_value=context):
                response=self.client(uid).get('/api/shop/favorites?user_id=999')
            self.assertEqual(response.json(),{'ids':['200','201']})
            self.assertEqual(cur.execute.call_args.args[1],(uid,))
            self.assertEqual(response.headers['cache-control'],'private, no-store')

    def test_add_is_idempotent_checks_visible_clothing_and_binds_session_owner(self):
        cur,conn,context=self.database()
        cur.fetchone.side_effect=[{'storage':'shop_favorites'},{'item_id':200}]
        with patch.object(shop,'fetch_user',return_value={'id':7,'is_admin':False}),patch.object(shop,'get_conn',return_value=context),patch.object(shop,'catalog',return_value={'revision':'a'*20}):
            response=self.client().post('/api/shop/favorites/200?user_id=999',json={'user_id':999})
        self.assertEqual(response.status_code,200)
        self.assertTrue(response.json()['favorite'])
        queries=[call.args[0] for call in cur.execute.call_args_list]
        self.assertIn('AND show',queries[1])
        self.assertIn("= 'wearable'",queries[1])
        self.assertIn('ON CONFLICT DO NOTHING',queries[2])
        self.assertEqual(cur.execute.call_args.args[1],(7,200))
        conn.commit.assert_called_once()

    def test_hidden_missing_and_functional_items_cannot_be_saved(self):
        cur,conn,context=self.database()
        cur.fetchone.side_effect=[{'storage':'shop_favorites'},None]
        with patch.object(shop,'fetch_user',return_value={'id':7}),patch.object(shop,'get_conn',return_value=context),patch.object(shop,'catalog',return_value={'revision':'a'*20}):
            response=self.client().post('/api/shop/favorites/200')
        self.assertEqual(response.status_code,404)
        conn.commit.assert_not_called()

    def test_removal_is_scoped_to_the_current_account_even_for_missing_catalog_items(self):
        cur,conn,context=self.database()
        cur.fetchone.return_value=('shop_favorites',)
        with patch.object(shop,'fetch_user',return_value={'id':7}),patch.object(shop,'get_conn',return_value=context):
            response=self.client().delete('/api/shop/favorites/200?user_id=999')
        self.assertEqual(response.status_code,200)
        self.assertEqual(cur.execute.call_args.args[1],(7,200))
        self.assertIn('user_id = %s AND item_id = %s',cur.execute.call_args.args[0])
        conn.commit.assert_called_once()

    def test_favorite_filter_intersects_slot_sex_visibility_and_preview_support(self):
        cur,conn,context=self.database()
        cur.fetchone.return_value={'count':0}
        cur.fetchall.return_value=[]
        with patch.object(shop,'fetch_user',return_value={'id':7}),patch.object(shop,'get_conn',return_value=context),patch.object(shop,'catalog',return_value={'revision':'a'*20}):
            response=self.client().get('/api/shop/items',params={'favorites_only':True,'sex':'female','slot':'face','preview_only':True,'cursor':''})
        self.assertEqual(response.status_code,200)
        for call in cur.execute.call_args_list:
            self.assertIn('favorite.user_id = %s',call.args[0])
            self.assertIn('favorite.item_id = shop_items.item_id',call.args[0])
            self.assertIn('preview_available AND model IS NOT NULL',call.args[0])
            self.assertIn(7,call.args[1])
            self.assertIn('female',call.args[1])
            self.assertIn('face',call.args[1])

    def test_cross_site_cookie_writes_are_rejected_before_touching_favorites(self):
        with patch.object(shop,'get_conn') as connection:
            response=self.client(csrf=True).post('/api/shop/favorites/200',headers={'Origin':'https://untrusted.invalid'})
        self.assertEqual(response.status_code,403)
        connection.assert_not_called()


if __name__=='__main__':
    unittest.main()
