import gzip
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from shop_asset_store import find_asset


class AssetStoreTests(unittest.TestCase):
    def test_http_inherited_models_decode_and_audio_preserves_ranges_and_immutable_cache(self):
        os.environ.setdefault('SESSION_SECRET','shop-assets-test-secret-at-least-32-characters')
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        from routers import shop
        with tempfile.TemporaryDirectory() as directory, patch.object(shop,'SHOP_DIR',Path(directory)):
            root = Path(directory)
            old, new = 'a'*20, 'b'*20
            for kind in ['models','audio']:(root/'assets'/old/kind).mkdir(parents=True)
            model, audio = 'c'*64+'.json.gz', 'd'*64+'.mp3'
            (root/'assets'/old/'models'/model).write_bytes(gzip.compress(b'{"meshes":[]}'))
            (root/'assets'/old/'audio'/audio).write_bytes(b'0123456789abcdef')
            child = root/'assets'/new
            child.mkdir()
            (child/'parent.json').write_text(json.dumps({'schema':'shop-assets-parent-v1','revision':old}))
            app = FastAPI()
            app.include_router(shop.router)
            client = TestClient(app)
            prefix = '/api/shop/assets/'+new
            response = client.get(prefix+'/models/'+model)
            self.assertEqual(response.json(),{'meshes':[]})
            self.assertEqual(response.headers['cache-control'],'public, max-age=31536000, immutable')
            response = client.get(prefix+'/audio/'+audio,headers={'Range':'bytes=2-5'})
            self.assertEqual(response.status_code,206)
            self.assertEqual(response.content,b'2345')
            self.assertEqual(response.headers['content-type'],'audio/mpeg')
            self.assertEqual(client.get(prefix+'/audio/'+model).status_code,404)

    def test_existing_revision_lengths_remain_supported(self):
        with tempfile.TemporaryDirectory() as directory:
            for revision in ['a'*12, 'b'*64]:
                target = Path(directory)/'assets'/revision/'textures'/'old.webp'
                target.parent.mkdir(parents=True)
                target.write_bytes(b'existing')
                self.assertEqual(find_asset(directory,revision,'textures','old.webp'),target)

    def test_additive_catalog_reuses_parent_and_own_file_has_priority(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            old, new = 'a'*20, 'b'*20
            parent = root/'assets'/old/'models'/'model.json.gz'
            parent.parent.mkdir(parents=True)
            parent.write_bytes(b'unchanged')
            folder = root/'assets'/new
            folder.mkdir()
            (folder/'parent.json').write_text(json.dumps({'schema':'shop-assets-parent-v1','revision':old}))
            self.assertEqual(find_asset(root,new,'models','model.json.gz'), parent)
            child = folder/'models'/'model.json.gz'
            child.parent.mkdir()
            child.write_bytes(b'new')
            self.assertEqual(find_asset(root,new,'models','model.json.gz'), child)
            self.assertEqual(parent.read_bytes(), b'unchanged')

    def test_invalid_cyclic_oversized_and_missing_parents_fail_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            folder = root/'assets'/('a'*20)
            folder.mkdir(parents=True)
            for value in ['../outside', 'a'*20, 'b'*20, 'x'*300]:
                (folder/'parent.json').write_text(json.dumps({'schema':'shop-assets-parent-v1','revision':value}))
                self.assertIsNone(find_asset(root,'a'*20,'models','missing.json.gz'))
            (folder/'parent.json').write_text('{broken')
            self.assertIsNone(find_asset(root,'a'*20,'models','missing.json.gz'))

    def test_parent_chain_is_bounded_and_paths_cannot_leave_store(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for number in range(9):
                folder = root/'assets'/f'{number:020x}'
                folder.mkdir(parents=True)
                (folder/'parent.json').write_text(json.dumps({'schema':'shop-assets-parent-v1','revision':f'{number+1:020x}'}))
            target = folder/'models'/'too-deep.json.gz'
            target.parent.mkdir()
            target.write_bytes(b'bounded')
            self.assertIsNone(find_asset(root,'0'*20,'models','too-deep.json.gz'))
            self.assertIsNone(find_asset(root,'../outside','models','file'))
            self.assertIsNone(find_asset(root,'0'*20,'models','../../../../outside'))
