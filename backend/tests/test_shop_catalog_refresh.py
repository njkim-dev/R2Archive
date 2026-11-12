from pathlib import Path
import sys
import unittest

tools=Path(__file__).resolve().parents[2]/'tools'
sys.path.insert(0,str(tools))
try:
    from refresh_shop_catalog import merge_items
finally:
    sys.path.remove(str(tools))


class CatalogRefreshTests(unittest.TestCase):
    def item(self,item_id=1,sex='male',slot='top'):
        return {'id':item_id,'name':'기존 이름','name_key':'기존 이름','category':'302' if sex=='male' else '402','department':'wearable','slot':slot,'sex':sex,'show':False,'description':'설명','prices':[],'attributes':{'New':'0'},'model':'verified-model','thumbnail':'verified-image','preview_available':True,'counterpart_id':None}

    def test_release_updates_client_fields_without_losing_verified_models_or_mutating_old_urls(self):
        previous=self.item();current={**previous,'name':'새 이름','name_key':'새 이름','show':True,'prices':[{'amount':9600}],'attributes':{'New':'1'},'model':None,'thumbnail':None,'preview_available':False}
        result=merge_items([previous],[current],{1:'new-image'})[0]
        self.assertEqual((result['name'],result['show'],result['prices'],result['attributes']),('새 이름',True,[{'amount':9600}],{'New':'1'}));self.assertEqual((result['model'],result['thumbnail'],result['preview_available']),('verified-model','new-image',True))
        self.assertEqual((previous['name'],previous['show'],previous['thumbnail']),('기존 이름',False,'verified-image'))

    def test_new_ids_and_retired_rows_remain_separate_from_immutable_previous_catalog(self):
        previous={**self.item(),'show':True};current={**previous,'show':False};new={**self.item(2),'model':None,'preview_available':False}
        result=merge_items([previous],[new,current]);self.assertEqual([row['id'] for row in result],[2,1]);self.assertFalse(result[1]['show']);self.assertTrue(previous['show'])
        for rows in [[current,current],[]]:
            with self.subTest(rows=rows),self.assertRaises(ValueError):merge_items([previous],rows)

    def test_differently_named_reviewed_counterparts_are_reciprocal_and_cannot_cross_slots(self):
        male,female=self.item(),self.item(2,'female');result=merge_items([male,female],[male,{**female,'name':'다른 이름'}],reviewed_pairs=[(1,2)])
        self.assertEqual([row['counterpart_id'] for row in result],[2,1]);self.assertIsNone(male['counterpart_id'])
        with self.assertRaises(ValueError):merge_items([male,female],[male,{**female,'slot':'hair'}],reviewed_pairs=[(1,2)])
