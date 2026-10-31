import unittest
from fastapi import HTTPException
from shop_sharing import home_handle, short_target


class SharingValidationTests(unittest.TestCase):
    def test_home_id_counts_utf8_bytes_and_normalizes_case(self):
        self.assertEqual(home_handle('Abc[한글]_-')[1], 'abc[한글]_-')
        self.assertEqual(home_handle('가나다라마바12')[0], '가나다라마바12')
        for handle in ['', '가나다라마바사', 'space name', '../admin', 'a/b', 'a%2Fb', '😀', 'a'*21]:
            with self.subTest(handle=handle), self.assertRaises(HTTPException):
                home_handle(handle)

    def test_short_targets_are_canonical_and_preserve_outfits(self):
        self.assertEqual(short_target('/shop?sex=female&top=10320585&angle=180.0&view=couple&item=30854'), '/shop?angle=180&item=30854&sex=female&top=10320585&view=couple')
        for target in ['https://evil.invalid/shop','//evil.invalid/shop','/myhome/abc','/shop?view=invalid','/shop?top=1&top=2','/shop?zoom=nan','/shop?angle=361','/shop?redirect=evil','/shop#bad']:
            with self.subTest(target=target), self.assertRaises(HTTPException):
                short_target(target)


if __name__ == '__main__':
    unittest.main()
