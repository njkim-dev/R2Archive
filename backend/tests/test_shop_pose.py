import math
from pathlib import Path
import struct
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'tools'))
from shop_pose import local_pose, read_animation, sample_channel


class ShopPoseTests(unittest.TestCase):
    def animation(self, position, rotation, suffix=b''):
        data = struct.pack('<If', 1, 100) + b'\x03Hip' + struct.pack('<3I', len(position), len(rotation), 0)
        data += b''.join(struct.pack('<4f', *key) for key in position)
        data += b''.join(struct.pack('<5f', *key) for key in rotation) + suffix
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/'stand.ani'
            path.write_bytes(data)
            return read_animation(path)

    def test_interpolates_sparse_translation_and_clamps_endpoints(self):
        animation = self.animation([(10, 1, 2, 3), (90, 9, 10, 11)], [])
        keys = animation['tracks']['Hip']['position']
        self.assertEqual(sample_channel(keys, 50), [5, 6, 7])
        self.assertEqual(sample_channel(keys, 0), [1, 2, 3])
        self.assertEqual(sample_channel(keys, 100), [9, 10, 11])

    def test_quaternion_uses_short_arc_and_row_vector_rotation(self):
        s = math.sqrt(.5)
        keys = [(0, 0, 0, 0, 1), (100, 0, 0, -1, 0)]
        result = sample_channel(keys, 50, rotation=True)
        self.assertAlmostEqual(sum(v*v for v in result), 1)
        track = {'position': [], 'rotation': [(0, 0, 0, s, s)], 'scale': []}
        bind = [[1,0,0,0],[0,1,0,0],[0,0,1,0],[2,3,4,1]]
        matrix = local_pose(track, bind, 0)
        self.assertAlmostEqual(matrix[0][0], 0)
        self.assertAlmostEqual(matrix[0][1], 1)
        self.assertEqual(matrix[3], [2,3,4,1])
        equivalent = sample_channel([(0, 0,0,s,s),(100,0,0,-s,-s)], 50, rotation=True)
        self.assertAlmostEqual(equivalent[2], s)

    def test_missing_channels_keep_bind_and_translation_does_not_scale_bones(self):
        bind = [[2,0,0,0],[0,3,0,0],[0,0,4,0],[1,2,3,1]]
        track = {'position': [(0,5,6,7)], 'rotation': [(0,0,0,0,1)], 'scale': []}
        result = local_pose(track, bind, 0)
        self.assertEqual([result[i][i] for i in range(3)], [2,3,4])
        self.assertEqual(result[3], [5,6,7,1])
        self.assertEqual(local_pose({'position': [], 'rotation': [], 'scale': []}, bind, 0), bind)

    def test_rejects_corrupt_keys_and_trailing_payload(self):
        cases = [([(0,0,0,0),(0,1,1,1)], [], b''),
                 ([(101,0,0,0)], [], b''),
                 ([(0,float('nan'),0,0)], [], b''),
                 ([], [(0,0,0,0,0)], b''),
                 ([], [], b'bad')]
        for position, rotation, suffix in cases:
            with self.subTest(position=position, rotation=rotation, suffix=suffix), self.assertRaises(ValueError):
                self.animation(position, rotation, suffix)


if __name__ == '__main__':
    unittest.main()
