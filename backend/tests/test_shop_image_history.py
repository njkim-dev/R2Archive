from contextlib import contextmanager
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import MagicMock, patch
import unittest
import uuid
import os
os.environ.setdefault('SESSION_SECRET', 'image-history-test-session-secret-at-least-32-characters')

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from PIL import Image
import shop_image_history as store
import shop_outfit_search as outfit
from routers import shop_image_history as api


ID = uuid.UUID('11111111-1111-4111-8111-111111111111')
REGION = {'bbox_xyxy': [0,0,1000,1000], 'polygon_xy': [[0,0],[1000,0],[1000,1000],[0,1000]]}


def image_bytes():
    output = BytesIO(); Image.new('RGB',(32,64)).save(output,format='PNG'); return output.getvalue()


class HistoryTests(unittest.TestCase):
    @contextmanager
    def cursor(self, write=False):
        yield self.cur

    def setUp(self):
        self.cur = MagicMock()

    def client(self, admin=False):
        app = FastAPI(); app.include_router(api.router); app.include_router(api.admin_router); app.include_router(api.public_router)
        app.dependency_overrides[api.favorite_user] = lambda: 42
        if admin: app.dependency_overrides[api.require_admin] = lambda: {'id':42,'is_admin':True}
        return TestClient(app)

    def test_guest_and_member_cannot_read_admin_history_or_images(self):
        with patch.object(store,'listing') as listing, patch.object(store,'image_path') as image:
            client = self.client()
            for path in ['/history',f'/history/{ID}',f'/history/{ID}/image']:
                self.assertEqual(client.get('/api/shop/image-search/admin'+path).status_code,401)
            listing.assert_not_called(); image.assert_not_called()

    def test_vote_owner_must_match_and_candidate_must_be_in_same_part(self):
        row = {'user_id':42,'status':'completed','result':{'groups':[{'slot':'top','items':[{'id':'200'}]}]}}
        with patch.object(store,'transaction',self.cursor):
            self.cur.fetchone.return_value = {**row,'user_id':99}
            with self.assertRaises(HTTPException) as error: store.vote(ID,42,'top','200',1)
            self.assertEqual(error.exception.status_code,404)
            self.cur.fetchone.return_value = row
            for slot,item in [('hair','200'),('top','999')]:
                with self.assertRaises(HTTPException) as error: store.vote(ID,42,slot,item,1)
                self.assertEqual(error.exception.status_code,422)
            store.vote(ID,42,'top','200',1)
            self.assertIn('ON CONFLICT',self.cur.execute.call_args.args[0])
            store.vote(ID,42,'top','200',0)
            self.assertIn('DELETE',self.cur.execute.call_args.args[0])

    def test_feedback_schema_rejects_unbounded_or_invalid_ids_and_boolean_votes(self):
        client = self.client()
        with patch.object(store,'vote') as vote,patch.object(store,'action') as action:
            for body in [{'slot':'face','item_id':'200','value':1},{'slot':'top','item_id':'200','value':True}]:
                self.assertEqual(client.put(f'/api/shop/image-search/history/{ID}/votes',json=body).status_code,422)
            for item in ['-1','9'*5000,'12x']:
                self.assertEqual(client.post(f'/api/shop/image-search/history/{ID}/actions',json={'action':'preview','item_ids':[item]}).status_code,422)
            vote.assert_not_called(); action.assert_not_called()

    def test_raw_original_is_exact_and_failed_insert_removes_file(self):
        with TemporaryDirectory() as directory, patch.object(store,'DIRECTORY',Path(directory)),patch.object(store,'transaction',self.cursor):
            raw = image_bytes()
            search_id = store.create(raw,42,'male','top','v','C:\\private\\image.png','test')
            files = list(Path(directory).iterdir()); self.assertEqual(len(files),1); self.assertEqual(files[0].read_bytes(),raw)
            self.assertEqual(files[0].stem,uuid.UUID(search_id).hex)
            self.assertEqual(self.cur.execute.call_args.args[1][-1],'image.png')
            self.cur.execute.side_effect = RuntimeError('insert failed')
            with self.assertRaises(RuntimeError): store.create(raw,42,'male','top','v','image.png','test')
            self.assertEqual(len(list(Path(directory).iterdir())),1)

    def test_write_target_is_verified_and_wrong_database_rolls_back(self):
        conn = MagicMock(); conn.cursor.return_value.__enter__.return_value = self.cur
        context = MagicMock(); context.__enter__.return_value = conn
        self.cur.fetchone.return_value = {'db':'legacy','role':'r2archive'}
        with patch.object(store,'get_conn',return_value=context):
            with self.assertRaises(RuntimeError):
                with store.transaction(write=True): self.fail('write must not execute')
        conn.rollback.assert_called_once(); conn.commit.assert_not_called()

    def test_review_rejects_stale_version_without_encoding(self):
        self.cur.fetchone.return_value = {'review_version':1}
        with patch.object(store,'transaction',self.cursor),patch.object(outfit,'outfit_engine') as engine:
            with self.assertRaises(HTTPException) as error: store.review(ID,42,'approved',0,{},'')
            self.assertEqual(error.exception.status_code,409); engine.assert_not_called()

    def test_delete_restores_image_on_transaction_failure(self):
        @contextmanager
        def failing(write=False):
            yield self.cur
            raise RuntimeError('commit failed')
        with TemporaryDirectory() as directory,patch.object(store,'DIRECTORY',Path(directory)),patch.object(store,'transaction',failing):
            key = ID.hex+'.png'; path = Path(directory)/key; path.write_bytes(image_bytes())
            self.cur.fetchone.return_value = {'image_key':key}
            with self.assertRaises(RuntimeError): store.delete(ID)
            self.assertTrue(path.is_file()); self.assertEqual(list(Path(directory).iterdir()),[path])

    def test_approved_examples_rescue_rank_and_respect_catalogue_constraints(self):
        model = outfit.OutfitSearch.__new__(outfit.OutfitSearch)
        model.rows = [{'id':str(i),'thumbnail':str(i),'sex':'male','slot':'hair'} for i in range(1,123)]
        model.by_id = {row['id']:i for i,row in enumerate(model.rows)}
        model.features = np.zeros((122,384),dtype=np.float32); model.features[:121,0] = .8
        model.encoder_sha256 = 'encoder'; model.model = MagicMock()
        vector = np.zeros((1,384),dtype=np.float32); vector[0,0] = 1
        model.model.session.run.return_value = [vector]
        allowed = {row['id']:row for row in model.rows}
        image = Image.new('RGB',(32,64))
        self.assertNotIn('122',[row['id'] for row in model.shortlist(image,REGION,'male','hair',allowed)[0]])
        sample = {'item_id':'122','thumbnail':'122','slot':'hair','sex':'male','encoder_sha256':'encoder','feature':vector[0]}
        self.assertEqual(model.shortlist(image,REGION,'male','hair',allowed,[sample])[0][0]['id'],'122')
        for changed in [{'encoder_sha256':'stale'},{'thumbnail':'stale'},{'sex':'female'},{'slot':'top'}]:
            self.assertNotIn('122',[row['id'] for row in model.shortlist(image,REGION,'male','hair',allowed,[{**sample,**changed}])[0]])
        hidden = {key:value for key,value in allowed.items() if key != '122'}
        self.assertNotIn('122',[row['id'] for row in model.shortlist(image,REGION,'male','hair',hidden,[sample])[0]])

    def test_approval_generation_invalidates_cached_search(self):
        outfit._results.clear(); model = MagicMock(); model.search.return_value = {'parts':{}}
        image = Image.new('RGB',(32,64)); allowed = {'1':{'thumbnail':'a','slot':'hair','sex':'male'}}
        with patch.object(outfit,'outfit_engine',return_value=model),patch.object(store,'training_snapshot',side_effect=[(0,[]),(0,[]),(1,[])]):
            self.assertFalse(outfit.cached_search(b'photo',image,allowed,'v',('hair',))['cached'])
            self.assertTrue(outfit.cached_search(b'photo',image,allowed,'v',('hair',))['cached'])
            self.assertFalse(outfit.cached_search(b'photo',image,allowed,'v',('hair',))['cached'])
        self.assertEqual(model.search.call_count,2); outfit._results.clear()

    def test_share_requires_owner_and_reuses_an_immutable_selection(self):
        token = ID.hex + 'a'*48
        self.cur.fetchone.return_value = {'user_id':42,'status':'completed','sex':'male','catalog_revision':'a'*20,
            'result':{'groups':[{'slot':'top','items':[{'id':'200'},{'id':'201'}]}],
                      'shares':[{'token':token,'selected_ids':['200'],'url':'https://r2archive.com/short/abcd'}]}}
        with patch.object(store,'transaction',self.cursor):
            self.assertEqual(store.publish(ID,42,['200'])['url'],'https://r2archive.com/short/abcd')
            self.assertEqual(self.cur.execute.call_count,1)
            for selected in [['999'],['200','201']]:
                with self.assertRaises(HTTPException) as error: store.publish(ID,42,selected)
                self.assertEqual(error.exception.status_code,422)
            with self.assertRaises(HTTPException) as error: store.publish(ID,99,[])
            self.assertEqual(error.exception.status_code,404)

    def test_shared_result_exposes_only_published_data_and_owner_feedback(self):
        token = ID.hex + 'a'*48
        row={'id':ID,'user_id':42,'sex':'male','slot':'top','catalog_revision':'a'*20,
             'image_key':ID.hex+'.png','image_format':'PNG',
             'result':{'items':[{'id':'200'}],'groups':[{'slot':'top','items':[{'id':'200'}]}],
                       'shares':[{'token':token,'selected_ids':['200'],'url':'https://r2archive.com/short/abcd'}]}}
        self.cur.fetchone.return_value=row
        self.cur.fetchall.return_value=[{'slot':'top','item_id':'200','value':1}]
        with patch.object(store,'transaction',self.cursor):
            result=store.shared(token)
            self.assertIsNone(result['search_id']); self.assertEqual(result['votes'],[])
            self.assertFalse(set(result)&{'user_id','image_key','original_filename','diagnostics','shares'})
            self.assertEqual(self.cur.execute.call_args.args[1][0],str(ID))
            owner=store.shared(token,42);self.assertEqual(owner['search_id'],str(ID));self.assertEqual(owner['votes'][0]['value'],1)
            for invalid in ['a'*79,'../admin']:
                with self.assertRaises(HTTPException): store.shared(invalid)
            self.cur.fetchone.return_value=None
            with self.assertRaises(HTTPException) as error: store.shared(token)
            self.assertEqual(error.exception.status_code,404)

    def test_public_share_route_does_not_require_login_and_never_runs_search(self):
        token=ID.hex+'a'*48
        client=self.client()
        with patch.object(store,'shared',return_value={'shared':True}) as shared:
            response=client.get('/api/shop/image-search/shared/'+token)
            self.assertEqual(response.status_code,200);self.assertIn('no-store',response.headers['cache-control'])
            shared.assert_called_once_with(token,None)


if __name__ == '__main__': unittest.main()
