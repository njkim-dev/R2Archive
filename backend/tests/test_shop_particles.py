from pathlib import Path
import struct
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'tools'))
from shop_particles import read_aif, read_pfx


def string(value, wide=True):
    return bytes([len(value)]) + value.encode('utf-16-le' if wide else 'cp949')


class ParticleResourceTests(unittest.TestCase):
    def resource(self, data, read):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'resource'
            path.write_bytes(data)
            return read(path)

    def test_both_attachment_versions_preserve_time_window_bone_and_offset(self):
        for version, size in [(2, 6), (3, 7)]:
            row = string('spark.pfx') + string('model.ani') + string('RightHand', False) + struct.pack('<8f', 800, 1000, 0, 1.5, 0, 0, 0, 0) + bytes([1] + [0] * (size - 1))
            data = struct.pack('<IHI', 0x51523DAF, version, 2) + row + row
            result = self.resource(data, read_aif)
            self.assertEqual(len(result), 2)
            self.assertEqual(result[0]['bone'], 'RightHand')
            self.assertEqual(result[0]['position'], [0, 1.5, 0])
            self.assertEqual(result[0]['start'], 800)
            with self.assertRaises(ValueError):
                self.resource(data[:-1], read_aif)

    def test_binary_layers_respect_variable_sprite_counts_and_padding_bytes(self):
        block = bytearray(372)
        struct.pack_into('<I', block, 96, 20)
        struct.pack_into('<f', block, 100, .1)
        struct.pack_into('<4f', block, 108, 80, 100, .1, .2)
        struct.pack_into('<I', block, 368, 2)
        row = string('Layer') + string('d:/editor/tex/spark.tga') + block + struct.pack('<8f', 0, 0, .5, 1, .5, 0, 1, 1)
        data = struct.pack('<IHBI', 0x81523DAF, 3, 0, 2) + row + row
        result = self.resource(data, read_pfx)
        self.assertEqual(len(result), 2)
        self.assertEqual(result[0]['count'], 20)
        self.assertEqual(result[0]['lifetime'], [80, 100])
        self.assertEqual(result[1]['uv'][1], [.5, 0, 1, 1])
        for damaged in [data[:-1], data + b'extra']:
            with self.assertRaises(ValueError):
                self.resource(damaged, read_pfx)

    def test_legacy_xml_keeps_source_texture_blend_and_motion_parameters(self):
        data = b'<ParticleSystem><Particle><Num>100</Num><Texture>spark.tga</Texture><MinLifetime>2</MinLifetime><MaxLifetime>3</MaxLifetime><Gravity>[0,-1,0]</Gravity><DestBlend>2</DestBlend></Particle></ParticleSystem>'
        row = self.resource(data, read_pfx)[0]
        self.assertEqual(row['texture'], 'spark.tga')
        self.assertEqual(row['lifetime'], [2, 3])
        self.assertEqual(row['gravity'], [0, -1, 0])
        self.assertTrue(row['additive'])
