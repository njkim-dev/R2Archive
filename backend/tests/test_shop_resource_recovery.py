import struct
import gzip
import json
import sys
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'tools'))
from prepare_shop import Builder, Resolver, load_image, parse_md9, posed_meshes, unique_bone_names
from shop_archive import ArchiveSource, archive_index
from prepare_couple_preview import collect, read_actor_animation
from prepare_couple_particles import build as build_particles


class ResourceRecoveryTests(unittest.TestCase):
    def test_identical_actor_tracks_can_repeat_but_conflicting_body_motion_cannot(self):
        source={'duration':1,'tracks':{'Hip':{'position':[1]},'Hip#2':{'position':[1]},'Skirt':{'rotation':[1]},'Skirt#2':{'rotation':[2]}}}
        with patch('prepare_couple_preview.read_animation',return_value=source):
            result=read_actor_animation(Path('actor.ani'))
        self.assertNotIn('Hip#2',result['tracks'])
        self.assertIn('Skirt#2',result['tracks'])
        with patch('prepare_couple_preview.read_animation',return_value={'tracks':{'Hip':{'position':[1]},'Hip#2':{'position':[2]}}}):
            with self.assertRaisesRegex(ValueError,'Conflicting duplicate actor bone'):read_actor_animation(Path('actor.ani'))

    def test_role_only_animation_aliases_supply_both_actors_without_filename_guessing(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            actor=root/'actor.ani';actor.write_bytes(b'actor')
            audio=root/'audio.mp3';audio.write_bytes(b'audio')
            source=type('Source',(),{'resolve':lambda _,name:audio if name=='audio.mp3'else actor})()
            scripts={'animap.txt':'left.ani cp_l_boy\nright.ani cp_r_girl','fxsound.txt':'1 audio.mp3'}
            rows={'effectsound.txt':[{'Name':'cp','Id':'1'}],'effectid.txt':[],'emoticon2.txt':[{'ItemCode':'9999','Ani':'cp'}]}
            with patch('prepare_couple_preview.ArchiveSource',return_value=source),patch('prepare_couple_preview.script',side_effect=lambda _,name:scripts[name]),patch('prepare_couple_preview.tags',side_effect=lambda _,name,tag:rows[name]),patch('prepare_couple_preview.read_animation',return_value={'duration':1,'tracks':{}}):
                records,unavailable=collect(root,root/'shop',{'items':[{'id':9999,'category':'507','show':False,'name':'Role only'}]})
            self.assertFalse(unavailable)
            self.assertEqual(records['9999']['actor_roles'],{'male':'left','female':'right'})

    def test_unreleased_ring_with_complete_data_is_collected_without_inventing_no_motion_rings(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            actor, audio = root/'actor.ani', root/'sound.mp3'
            actor.write_bytes(b'actor')
            audio.write_bytes(b'audio')
            source = type('Source', (), {'resolve':lambda _,name:audio if name=='sound.mp3' else actor})()
            scripts = {'animap.txt':'boy.ani cp_boy\ngirl.ani cp_girl', 'fxsound.txt':'1 sound.mp3'}
            rows = {'effectsound.txt':[{'Name':'cp','Id':'1'}], 'effectid.txt':[], 'emoticon2.txt':[{'ItemCode':'9999','Ani':'cp'}]}
            items = [{'id':9999,'category':'507','show':False,'name':'Unreleased ring'}, {'id':30005,'category':'507','show':True,'name':'No motion'}]
            with patch('prepare_couple_preview.ArchiveSource',return_value=source), patch('prepare_couple_preview.script',side_effect=lambda _,name:scripts[name]), patch('prepare_couple_preview.tags',side_effect=lambda _,name,tag:rows[name]), patch('prepare_couple_preview.read_animation',return_value={'duration':1,'tracks':{}}), patch('prepare_couple_preview.couple_actor_side',side_effect=lambda animation,variants,default:default):
                records, unavailable = collect(root,root/'shop',{'items':items})
            self.assertIn('9999',records)
            self.assertEqual(records['9999']['actor_roles'],{'male':'left','female':'right'})
            self.assertEqual(unavailable,{'30005':'no_motion'})

    def test_ring_without_ornament_can_still_build_motion_catalog_with_no_particles(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            shop = root/'shop'
            folder = shop/'assets'/('a'*20)/'motions'
            folder.mkdir(parents=True)
            (folder/'clip.json.gz').write_bytes(gzip.compress(b'{}'))
            audit = shop/'couple-effect-input'/'audit.json'
            audit.parent.mkdir()
            audit.write_text(json.dumps({'9999':{'action_models':[]}}))
            base = root/'base.json'
            base.write_text(json.dumps({'revision':'a'*20,'rings':{'9999':{'motion':'clip.json.gz'}}}))
            build_particles(root/'game',shop,base)
            result=json.loads((shop/'couple-particles-catalog.json').read_text())
            self.assertNotIn('ornament',result['rings']['9999'])

    def test_unused_helper_does_not_steal_visible_bones_animation_name(self):
        bones = [{'name':'Skirt','parent':-1,'nf':0}, {'name':'Hip','parent':-1,'nf':20}, {'name':'Skirt','parent':1,'nf':40}]
        unique_bone_names(bones,allow_duplicates=True)
        self.assertEqual([bone['name'] for bone in bones], ['Skirt#2','Hip','Skirt'])
        self.assertEqual(bones[2]['parent'],1)
        with self.assertRaisesRegex(ValueError,'duplicate bone names'):
            unique_bone_names([{'name':'Hip','parent':-1,'nf':1},{'name':'Hip','parent':-1,'nf':1}])

    def test_unused_empty_root_does_not_block_clothing_but_visible_or_parent_roots_do(self):
        with tempfile.TemporaryDirectory() as folder:
            builder = Builder.__new__(Builder)
            builder.lock = threading.RLock()
            builder.asset_root = Path(folder)
            builder.resolver = type('Source', (), {'resolve': lambda *args: Path(folder)/'model.md9'})()
            builder.bases = {'female': {'bones': [{'name': 'Waist'}]}}
            builder.poses = {'female': {}}
            builder.encode_meshes = lambda *args: 'converted.json.gz'
            for faces, parent, accepted in [(0, -1, True), (1, -1, False), (0, 0, False)]:
                with self.subTest(faces=faces, parent=parent):
                    builder.cache = {}
                    model = {'bones': [{'name':'UnusedHelper','parent':-1,'nf':faces}, {'name':'Waist','parent':parent,'nf':1}]}
                    with patch('prepare_shop.parse_md9',return_value=model), patch('prepare_shop.posed_meshes',return_value=[]):
                        if accepted:
                            self.assertEqual(builder.model('model.md9',sex='female'),'converted.json.gz')
                        else:
                            with self.assertRaisesRegex(ValueError,'unmapped attachment root'):builder.model('model.md9',sex='female')

    def test_archive_reads_complete_directory_larger_than_two_megabytes(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            body = b'\0A'
            name = b'rnr_char'
            directory = bytearray(struct.pack('<BBIII', len(name), 2, 0, 0, 0) + name + b'\0')
            for index in range(24000):
                name = ('rnr_char/' + str(index).zfill(6) + '_' + 'a'*80 + '.md9').encode()
                directory += struct.pack('<BBIII', len(name), 1, 0, 2, 1) + name + b'\0'
            pak = root/'rnr_char1.pak'
            pak.write_bytes(body + directory + struct.pack('<IIB', len(body)+14, 24000, 18))
            entries = archive_index(pak)
            self.assertEqual(len(entries), 24000)
            source = ArchiveSource(root, root/'extracted')
            self.assertEqual(source.resolve(entries[0][1]).read_bytes(), b'A')
            self.assertFalse(source.archive_errors)

    def test_missing_texture_requires_an_explicit_reviewed_alias(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for name in ['rnr_char/first/shared.dds', 'rnr_char/second/shared.dds', 'rnr_char/uw/model.md9']:
                path = root/name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(b'same')
            resolver = Resolver(root)
            self.assertIsNone(resolver.texture(root/'rnr_char/uw/model.md9', 'shared.dds'))
            resolver = Resolver(root, texture_aliases=[{'model':'rnr_char/uw/model.md9','name':'shared.dds','resolved':'rnr_char/first/shared.dds'}])
            self.assertEqual(resolver.texture(root/'rnr_char/uw/model.md9', 'shared.dds'), root/'rnr_char/first/shared.dds')
            self.assertIsNone(resolver.texture(root/'rnr_char/uw/model.md9', 'unreviewed.dds'))

    def test_valid_dxt_pixels_with_wrong_declared_header_size_decode_without_source_mutation(self):
        data = bytearray(128)
        data[:4] = b'DDS '
        for offset,value in [(4,24),(8,0x81007),(12,4),(16,4),(20,8),(28,1),(76,32),(80,4),(108,0x1000)]:
            struct.pack_into('<I', data, offset, value)
        data[84:88] = b'DXT1'
        data += struct.pack('<HHI',0xf800,0x07e0,0)
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder)/'original.dds'
            path.write_bytes(data)
            image = load_image(path)
            self.assertEqual(image.size, (4,4))
            self.assertEqual(image.getpixel((0,0)), (255,0,0,255))
            self.assertEqual(path.read_bytes(), data)
            path.write_bytes(data[:-1])
            with self.assertRaises(OSError):load_image(path)

    def test_untextured_material_uses_recorded_diffuse_color_but_missing_named_texture_still_fails(self):
        material = bytearray(100)
        struct.pack_into('<4f', material, 0, .5, .25, .75, 1)
        bone = bytearray(136)
        bone[:5] = b'Waist'
        bone[32:96] = np.eye(4, dtype='<f4').tobytes()
        struct.pack_into('<4i',bone,96,3,1,0,-1)
        vertices = np.array([[0,0,0,0,0,1,0,0],[1,0,0,0,0,1,1,0],[0,1,0,0,0,1,0,1]],dtype='<f4').tobytes()
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder)/'model.md9'
            def write():path.write_bytes(struct.pack('<I',1)+material+struct.pack('<I',1)+bone+b'\0'*8+vertices+struct.pack('<3H',0,1,2))
            write()
            resolver = type('NoTextures',(),{'texture':lambda *args:None})()
            model = parse_md9(path,resolver,allow_solid_materials=True)
            self.assertEqual(posed_meshes(model)[0]['material_color'], [.5,.25,.75,1])
            material[68:79] = b'missing.dds'
            write()
            with self.assertRaisesRegex(ValueError,'missing texture'):parse_md9(path,resolver,allow_solid_materials=True)
