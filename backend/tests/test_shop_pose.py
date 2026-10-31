import math
from pathlib import Path
import struct
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'tools'))
from shop_pose import local_pose, read_animation, sample_channel, couple_scene_pose, couple_actor_side


class ShopPoseTests(unittest.TestCase):
    def test_face_to_face_couple_motion_places_translation_and_facing_together(self):
        def multiply(left, right):
            return [[sum(left[row][k] * right[k][column] for k in range(4)) for column in range(4)] for row in range(4)]
        for item_id in (30854, 30855):
            with self.subTest(item_id=item_id):
                boy = [[0,0,-1,0],[0,1,0,0],[1,0,0,0],[55,170,75,1]]
                girl = [[0,0,1,0],[0,1,0,0],[-1,0,0,0],[-91,170,-14,1]]
                boy = multiply(boy, couple_scene_pose('left', 'male'))
                girl = multiply(girl, couple_scene_pose('right', 'female'))
                self.assertEqual(boy[:3], girl[:3])
                self.assertEqual(boy[2][:3], [0,0,1])
                self.assertEqual(boy[3], [-75,170,55,1])
                self.assertEqual(girl[3], [-14,170,91,1])
                self.assertGreater(girl[3][0] + 65 - (boy[3][0] - 65), 150)

    def test_couple_actor_frames_are_opposite_and_reject_unknown_roles(self):
        male, female = couple_scene_pose('left', 'male'), couple_scene_pose('right', 'female')
        self.assertEqual(male[0][2], -female[0][2])
        self.assertEqual(male[2][0], -female[2][0])
        self.assertEqual(male[3], [0,0,0,1])
        self.assertEqual(couple_scene_pose('right', 'male')[3], [130,0,0,1])
        self.assertEqual(couple_scene_pose('left', 'female')[3], [-130,0,0,1])
        with self.assertRaises(ValueError):
            couple_scene_pose('common', 'male')

    def test_actor_side_uses_root_motion_without_replacing_original_hand_animation(self):
        left = {'duration': 100, 'tracks': {'Hip': {'position': [(0,0,0,0),(100,60,0,0)]}}}
        right = {'duration': 100, 'tracks': {'Hip': {'position': [(0,0,0,0),(100,-60,0,0)]}}}
        original = {'duration': 100, 'tracks': {'Hip': right['tracks']['Hip'], 'RightHand': {'rotation': ['original couple grip']}}}
        self.assertEqual(couple_actor_side(original, {'left': left, 'right': right}, 'left'), 'right')
        self.assertEqual(original['tracks']['RightHand']['rotation'], ['original couple grip'])
        self.assertEqual(couple_actor_side(original, {}, 'left'), 'left')
        self.assertEqual(couple_actor_side(original, {'left': right, 'right': right}, 'left'), 'left')

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
