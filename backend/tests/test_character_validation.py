import unittest
from unittest.mock import patch
from fastapi import HTTPException
from shop_characters import character_name, thumbnail_key
from routers.auth_oauth import _safe_return_origin


class CharacterValidationTests(unittest.TestCase):
    def test_name_and_thumbnail_key_stay_stable(self):
        self.assertEqual(character_name('My[캐릭터]')[1], 'my[캐릭터]')
        with self.assertRaises(HTTPException):
            character_name('가나다라마바사')
        mains=[{'slot':'top','item':{'id':'201'}},{'slot':'hair','item':{'id':'100'}}]
        key=thumbnail_key('a'*20,'female',mains)
        self.assertEqual(key,thumbnail_key('a'*20,'female',mains[::-1]))
        self.assertNotEqual(key,thumbnail_key('a'*20,'male',mains))

    def test_archive_oauth_returns_are_strictly_scoped(self):
        with patch('routers.auth_oauth.COOKIE_SECURE',True):
            for base in ['https://r2archive.com','https://r2archive.com/music','https://r2archive.com/xyx']:
                self.assertEqual(_safe_return_origin(base+'/'),base)
            for unsafe in ['https://r2archive.com.evil.invalid/music','https://evil.invalid','https://r2archive.com/music/evil','https://r2archive.com/music?redirect=evil','https://r2archive.com/xyx#evil']:
                self.assertEqual(_safe_return_origin(unsafe),_safe_return_origin(None))
