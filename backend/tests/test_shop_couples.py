import unittest
from unittest.mock import patch
from fastapi import HTTPException
from routers.shop_couples import public_handle,locked_relation
from routers.shop_characters import character_state
from shop_couples import partner_character

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
