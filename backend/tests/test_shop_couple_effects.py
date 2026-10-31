from pathlib import Path
import struct
import sys
import tempfile
import unittest

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'tools'))
from prepare_couple_effects import effect_time, effect_worlds
from shop_pose import read_animation


class CoupleEffectTests(unittest.TestCase):
    def test_effect_loop_uses_source_ticks_and_nonlooping_effects_hold_the_end(self):
        self.assertEqual(effect_time(25, 10, True), 5)
        self.assertEqual(effect_time(25, 10, False), 10)
        self.assertEqual(effect_time(25, 0, True), 0)

    def test_model_animation_follows_parent_before_scene_placement(self):
        root = np.eye(4); root[3, 0] = 100
        child = np.eye(4); child[3, 1] = 20
        model = {'bones': [{'name': 'root', 'matrix': root, 'parent': -1}, {'name': 'heart', 'matrix': child, 'parent': 0}]}
        animation = {'tracks': {'root': {'position': [(0, 100, 0, 0), (10, 200, 0, 0)], 'rotation': [], 'scale': []}}}
        worlds = effect_worlds(model, animation, 5)
        np.testing.assert_allclose(worlds[1][3, :3], [150, 20, 0])

    def test_duplicate_effect_node_names_are_opt_in_and_keep_both_tracks(self):
        node = b'\x04cube' + struct.pack('<3I', 1, 0, 0) + struct.pack('<4f', 0, 10, 20, 30)
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'effect.ani'
            path.write_bytes(struct.pack('<If', 2, 10) + node + node)
            with self.assertRaisesRegex(ValueError, 'duplicate'):
                read_animation(path)
            tracks = read_animation(path, allow_duplicate_names=True)['tracks']
            self.assertEqual(list(tracks), ['cube', 'cube#2'])
            self.assertEqual(tracks['cube'], tracks['cube#2'])
