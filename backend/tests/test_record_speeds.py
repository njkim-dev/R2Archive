import unittest

from fastapi import HTTPException
from pydantic import ValidationError

from models import ManualRecordEntry, RecordCreate
from routers.rankings import _ranking_speed


class RecordSpeedTests(unittest.TestCase):
    def test_existing_clients_default_to_ultra(self):
        self.assertEqual(RecordCreate(nickname="tester").speed, "ultra")
        self.assertEqual(ManualRecordEntry(song_id=1).speed, "ultra")

    def test_all_supported_speeds_are_accepted(self):
        for speed in ("normal", "fast", "ultra"):
            self.assertEqual(RecordCreate(nickname="tester", speed=speed).speed, speed)
            self.assertEqual(ManualRecordEntry(song_id=1, speed=speed).speed, speed)

    def test_unknown_speeds_are_rejected(self):
        with self.assertRaises(ValidationError):
            RecordCreate(nickname="tester", speed="turbo")
        with self.assertRaises(HTTPException):
            _ranking_speed("turbo")

    def test_ranking_filter_accepts_all_and_normalizes_case(self):
        self.assertEqual(_ranking_speed("all"), "all")
        self.assertEqual(_ranking_speed("FAST"), "fast")


if __name__ == "__main__":
    unittest.main()
