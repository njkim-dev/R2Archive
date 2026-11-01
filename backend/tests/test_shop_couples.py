import json
import os
import unittest
from unittest.mock import MagicMock,patch
os.environ.setdefault('SESSION_SECRET','couple-test-secret-at-least-32-characters')
from fastapi import HTTPException
from routers.shop_couples import public_handle,locked_relation
from routers.shop_characters import character_state
from shop_couples import partner_character
from routers.shop_couples import request_couple,CoupleRequest

class CoupleRegistrationTests(unittest.TestCase):
    def register(self,peer,occupied=False):
        cur,conn,ctx=MagicMock(),MagicMock(),MagicMock();conn.cursor.return_value.__enter__.return_value=cur;ctx.__enter__.return_value=conn
        cur.fetchall.return_value=[{'id':12},{'id':13}];cur.fetchone.side_effect=[{'exists':1} if occupied else None,{'id':99}]
        with patch('routers.shop_couples.favorite_user',return_value=7),patch('routers.shop_couples.get_conn',return_value=ctx),patch('routers.shop_couples.lock_couple_changes') as lock,patch('routers.shop_couples.require_character') as owner,patch('routers.shop_couples.public_home_owner',return_value=peer):
            try:response=request_couple(MagicMock(),12,CoupleRequest(url='https://r2archive.com/myhome/friend'))
            except HTTPException as error:response=error
        owner.assert_called_once_with(cur,7,12);lock.assert_called_once_with(cur)
        return response,cur,conn

    def test_distinct_characters_on_same_account_are_immediately_accepted(self):
        response,cur,conn=self.register({'user_id':7,'character_id':13})
        self.assertEqual(response.status_code,201);self.assertEqual(json.loads(response.body),{'ok':True,'status':'accepted'})
        self.assertEqual(response.headers['cache-control'],'private, no-store')
        self.assertIn((12,13,'accepted'),[call.args[1] for call in cur.execute.call_args_list]);conn.commit.assert_called_once()
        self.assertTrue(any('ORDER BY id FOR UPDATE' in call.args[0] for call in cur.execute.call_args_list))

    def test_other_account_still_requires_consent(self):
        response,cur,conn=self.register({'user_id':8,'character_id':13})
        self.assertEqual(json.loads(response.body)['status'],'pending');self.assertIn((12,13,'pending'),[call.args[1] for call in cur.execute.call_args_list]);conn.commit.assert_called_once()

    def test_a_character_cannot_be_its_own_partner(self):
        response,cur,conn=self.register({'user_id':7,'character_id':12})
        self.assertEqual(response.status_code,422);conn.commit.assert_not_called();cur.execute.assert_not_called()

    def test_existing_or_pending_couple_cannot_be_overwritten(self):
        for uid in [7,8]:
            with self.subTest(uid=uid):
                response,cur,conn=self.register({'user_id':uid,'character_id':13},occupied=True)
                self.assertEqual(response.status_code,409);conn.commit.assert_not_called();self.assertFalse(any(call.args[0].startswith('INSERT') for call in cur.execute.call_args_list))

class Cursor:
    def __init__(self,rows):self.rows=iter(rows);self.queries=[]
    def execute(self,sql,args=None):self.queries.append((sql,args))
    def fetchall(self):return next(self.rows)
    def fetchone(self):return next(self.rows)

class CouplePrivacyTests(unittest.TestCase):
    def test_partner_urls_never_fetch_other_hosts(self):
        self.assertEqual(public_handle('https://r2archive.com/myhome/%ED%95%9C%EA%B8%80'),'한글')
        for url in ['http://r2archive.com/myhome/a','https://evil.test/myhome/a','https://r2archive.com.evil.test/myhome/a','https://r2archive.com@evil.test/myhome/a','https://r2archive.com/shop','https://r2archive.com/myhome/a/b']:
            with self.subTest(url=url),self.assertRaises(HTTPException):public_handle(url)

    def test_owner_retains_private_items_and_mains(self):
        cur=Cursor([[{'item_id':1,'is_private':True}],[{'id':1}],[{'slot':'top','item_id':1}]])
        with patch('routers.shop_characters.serialize',lambda row:{'id':str(row['id'])}):result=character_state(cur,{'id':7,'name':'own','sex':'female'},'a'*20)
        self.assertEqual(result['ids'],['1']);self.assertEqual(result['private_ids'],['1']);self.assertEqual(len(result['mains']),1)
        self.assertNotIn('AND NOT is_private',cur.queries[0][0])

    def test_public_and_partner_state_omit_private_metadata_and_mains(self):
        cur=Cursor([[],[],[{'slot':'top','item_id':1}]])
        result=character_state(cur,{'id':7,'name':'own','sex':'female'},'a'*20,public=True)
        self.assertEqual(result['ids'],[]);self.assertEqual(result['mains'],[]);self.assertNotIn('private_ids',result)
        self.assertIn('AND NOT is_private',cur.queries[0][0]);self.assertIn('AND NOT is_private',cur.queries[1][0])

    def test_partner_read_requires_owned_character_and_accepted_relation(self):
        cur=Cursor([None])
        with self.assertRaises(HTTPException) as result:partner_character(cur,5,7)
        self.assertEqual(result.exception.status_code,404);self.assertEqual(cur.queries[0][1],(7,5));self.assertIn("r.status='accepted'",cur.queries[0][0]);self.assertIn('own.user_id=%s',cur.queries[0][0])

    def test_stale_notification_cannot_accept_or_remove_a_replaced_relationship(self):
        row={'id':42,'sender_id':1,'recipient_id':7,'status':'pending'}
        cur=Cursor([row,[],row])
        with patch('routers.shop_couples.require_character'),patch('routers.shop_couples.lock_couple_changes'):
            with self.assertRaises(HTTPException) as result:locked_relation(cur,5,7,41)
        self.assertEqual(result.exception.status_code,409)
        self.assertFalse(any('UPDATE' in sql.split(' FROM ')[0] or sql.startswith('DELETE') for sql,args in cur.queries))

    def test_pending_cancel_cannot_break_a_just_accepted_couple(self):
        row={'id':42,'sender_id':1,'recipient_id':7,'status':'accepted'}
        cur=Cursor([row,[],row])
        with patch('routers.shop_couples.require_character'),patch('routers.shop_couples.lock_couple_changes'):
            with self.assertRaises(HTTPException) as result:locked_relation(cur,5,7,42,'pending')
        self.assertEqual(result.exception.status_code,409)
