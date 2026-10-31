import io
import os
import unittest
from unittest.mock import MagicMock,patch

import jwt
from fastapi import FastAPI,HTTPException
from fastapi.testclient import TestClient
from PIL import Image

os.environ.setdefault('SESSION_SECRET','wardrobe-test-secret-at-least-32-characters')
import auth
from routers import shop,shop_characters as chars
from shop_characters import require_character
from security_middleware import BrowserCSRFMiddleware


class WardrobeTests(unittest.TestCase):
    def client(self,uid=7,csrf=False):
        app=FastAPI();app.include_router(shop.router);app.include_router(chars.router)
        if csrf:app.add_middleware(BrowserCSRFMiddleware)
        client=TestClient(app)
        if uid:client.cookies.set(auth.SESSION_COOKIE,jwt.encode({'sub':str(uid)},auth.SESSION_SECRET,algorithm='HS256'))
        return client

    def database(self):
        cur,conn,ctx=MagicMock(),MagicMock(),MagicMock();conn.cursor.return_value.__enter__.return_value=cur;ctx.__enter__.return_value=conn
        return cur,conn,ctx

    def test_guest_and_cross_origin_cannot_read_or_change_wardrobe(self):
        with patch.object(shop,'get_conn') as old,patch.object(chars,'get_conn') as connection:
            for method,url,kwargs in [('get','/wardrobe',{}),('post','/wardrobe/200',{}),('get','/characters',{}),('post','/characters',{'json':{'name':'test','sex':'female'}}),('get','/characters/12',{}),('delete','/characters/12',{}),('post','/characters/12/items',{'json':{'ids':[200]}}),('get','/items?owned_only=true',{})]:
                self.assertEqual(getattr(self.client(None),method)('/api/shop'+url,**kwargs).status_code,401)
            self.assertEqual(self.client(csrf=True).post('/api/shop/characters',json={'name':'test','sex':'female'},headers={'Origin':'https://wrong.invalid'}).status_code,403)
            old.assert_not_called();connection.assert_not_called()

    def test_aggregate_saved_ids_are_scoped_to_session_owner(self):
        cur,conn,ctx=self.database();cur.fetchall.return_value=[{'item_id':200}]
        with patch.object(shop,'fetch_user',return_value={'id':7}),patch.object(shop,'get_conn',return_value=ctx),patch.object(shop,'catalog',return_value={'revision':'a'*20}):response=self.client().get('/api/shop/wardrobe?user_id=999')
        self.assertEqual(response.json(),{'ids':['200'],'mains':[]});self.assertEqual(cur.execute.call_args.args[1],(7,));conn.commit.assert_not_called()
        self.assertEqual(response.headers['cache-control'],'private, no-store')

    def test_legacy_writes_require_explicit_character(self):
        with patch.object(shop,'fetch_user',return_value={'id':7}),patch.object(shop,'get_conn') as connection:
            for method,url in [('post','/wardrobe/200'),('post','/wardrobe/batch'),('delete','/wardrobe/200'),('put','/wardrobe/200/main')]:self.assertEqual(getattr(self.client(),method)('/api/shop'+url).status_code,409)
            connection.assert_not_called()

    def test_first_save_locks_character_and_preserves_existing_main(self):
        for sex in ['male','female']:
            for department,slot in [('wearable','top'),('wearable','pet'),('functional',None)]:
                cur,conn,ctx=self.database();cur.fetchall.return_value=[{'item_id':200,'sex':'common' if slot=='pet' else sex,'slot':slot,'department':department}]
                with patch.object(shop,'fetch_user',return_value={'id':7}),patch.object(chars,'get_conn',return_value=ctx),patch.object(chars,'require_character',return_value={'id':12,'sex':sex}) as required,patch.object(chars,'catalog',return_value={'revision':'a'*20}),patch.object(chars,'character_state',return_value={'ids':['200'],'mains':[]}):response=self.client().post('/api/shop/characters/12/items?user_id=999',json={'ids':[200]})
                self.assertEqual(response.status_code,200);required.assert_called_once_with(cur,7,12,True)
                writes=[call for call in cur.execute.call_args_list if 'INSERT INTO shop_character_mains' in call.args[0]]
                self.assertEqual(len(writes),int(department=='wearable'));self.assertTrue(all('DO NOTHING' in call.args[0] for call in writes));conn.commit.assert_called_once()
                query=cur.execute.call_args_list[0];self.assertIn("sex IN (%s,'common')",query.args[0]);self.assertEqual(query.args[1][-1],sex)

    def test_main_requires_saved_wearable_and_does_not_accept_rings(self):
        for row,expected in [(None,422),({'slot':None},422),({'slot':'pet'},200)]:
            cur,conn,ctx=self.database();cur.fetchone.return_value=row
            with patch.object(shop,'fetch_user',return_value={'id':7}),patch.object(chars,'get_conn',return_value=ctx),patch.object(chars,'require_character',return_value={'id':12,'sex':'female'}),patch.object(chars,'catalog',return_value={'revision':'a'*20}),patch.object(chars,'character_state',return_value={'ids':['200'],'mains':[]}):response=self.client().put('/api/shop/characters/12/mains/200')
            self.assertEqual(response.status_code,expected)
            query=cur.execute.call_args_list[0].args[0];self.assertIn('shop_character_items',query);self.assertIn("='wearable'",query);self.assertIn('sex IN',query)
            if expected==200:conn.commit.assert_called_once()
            else:conn.commit.assert_not_called()

    def test_character_limit_and_duplicate_names_are_enforced_transactionally(self):
        for responses,expected in [([{'n':17}],409),([{'n':0},None],409),([{'n':0},{'id':12,'name':'Test','sex':'female'}],201)]:
            cur,conn,ctx=self.database();cur.fetchone.side_effect=responses
            with patch.object(shop,'fetch_user',return_value={'id':7}),patch.object(chars,'get_conn',return_value=ctx),patch.object(chars,'catalog',return_value={'revision':'a'*20}),patch.object(chars,'character_state',return_value={'ids':[],'mains':[]}):response=self.client().post('/api/shop/characters',json={'name':'Test','sex':'female'})
            self.assertEqual(response.status_code,expected);self.assertIn('FOR UPDATE',cur.execute.call_args_list[0].args[0]);self.assertEqual(cur.execute.call_args_list[0].args[1],(7,))
            if expected!=201:conn.commit.assert_not_called()

    def test_foreign_character_is_not_accessible(self):
        cur=MagicMock();cur.fetchone.return_value=None
        with self.assertRaises(HTTPException) as error:require_character(cur,7,999,True)
        self.assertEqual(error.exception.status_code,404);self.assertEqual(cur.execute.call_args.args[1],(999,7));self.assertIn('FOR UPDATE',cur.execute.call_args.args[0])

    def test_thumbnail_validation_happens_before_database_write(self):
        with patch.object(shop,'fetch_user',return_value={'id':7}),patch.object(chars,'get_conn') as connection:
            for body,status in [(b'not-an-image',422),(b'x'*196609,413)]:self.assertEqual(self.client().put('/api/shop/characters/12/thumbnail?key='+'a'*24,content=body).status_code,status)
            connection.assert_not_called()

    def test_thumbnail_is_private_and_supports_conditional_requests(self):
        image=io.BytesIO();Image.new('RGBA',(2,2)).save(image,format='WEBP');cur,conn,ctx=self.database();cur.fetchone.return_value={'thumbnail':image.getvalue()}
        with patch.object(shop,'fetch_user',return_value={'id':7}),patch.object(chars,'get_conn',return_value=ctx),patch.object(chars,'require_character'):
            client=self.client();first=client.get('/api/shop/characters/12/thumbnail');second=client.get('/api/shop/characters/12/thumbnail',headers={'If-None-Match':first.headers['etag']})
        self.assertEqual(first.status_code,200);self.assertIn('private',first.headers['cache-control']);self.assertEqual(second.status_code,304);conn.commit.assert_not_called()

    def test_unreleased_never_discloses_price_duration_or_new_flag(self):
        result=shop.serialize({'id':30320871,'revision':'a'*20,'is_unreleased':True,'is_new':True,'prices':[{'key':'P30','amount':1000}]})
        self.assertEqual(result['prices'],[]);self.assertFalse(result['is_new']);self.assertTrue(result['is_unreleased'])

    def test_unreleased_owned_filter_binds_account_and_limits_functional_items(self):
        for include in [False,True]:
            cur,conn,ctx=self.database();cur.fetchone.return_value={'count':0};cur.fetchall.return_value=[]
            with patch.object(shop,'fetch_user',return_value={'id':7}),patch.object(shop,'get_conn',return_value=ctx),patch.object(shop,'catalog',return_value={'revision':'a'*20}):response=self.client().get('/api/shop/items',params={'owned_only':True,'include_unreleased':include,'cursor':''})
            self.assertEqual(response.status_code,200)
            for call in cur.execute.call_args_list:
                self.assertIn('c.user_id=%s',call.args[0]);self.assertIn(7,call.args[1]);self.assertIn('owned.item_id=shop_items.item_id',call.args[0]);self.assertEqual('show OR' in call.args[0],include);self.assertIn("category='507'",call.args[0]);self.assertIn("='friend'",call.args[0])
