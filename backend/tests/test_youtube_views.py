import unittest
from unittest.mock import MagicMock

from youtube_views import (
    extract_youtube_video_id,
    load_youtube_view_data,
    youtube_view_data_for_url,
)


class YoutubeViewsTests(unittest.TestCase):
    def test_extracts_supported_youtube_video_urls(self):
        video_id = "AbCdEf123_4"
        urls = [
            f"https://www.youtube.com/watch?v={video_id}&list=test",
            f"https://youtu.be/{video_id}?si=test",
            f"https://www.youtube.com/shorts/{video_id}",
            f"https://www.youtube.com/embed/{video_id}",
            f"youtube.com/live/{video_id}",
        ]
        self.assertEqual([extract_youtube_video_id(url) for url in urls], [video_id] * len(urls))

    def test_rejects_channel_and_non_youtube_urls(self):
        self.assertIsNone(extract_youtube_video_id("https://www.youtube.com/@r2beatmusic"))
        self.assertIsNone(extract_youtube_video_id("https://example.com/watch?v=AbCdEf123_4"))
        self.assertIsNone(extract_youtube_video_id(""))

    def test_loads_and_resolves_cached_counts_and_channel_policy(self):
        cur = MagicMock()
        cur.fetchall.return_value = [
            ("AbCdEf123_4", 4321, "UCAR5Euqj20YJ1R3joEorAxA"),
            ("ZyXwVu987-6", 99, "some-other-channel"),
        ]
        data = load_youtube_view_data(cur)
        music_box = youtube_view_data_for_url("https://youtu.be/AbCdEf123_4", data)
        other = youtube_view_data_for_url("https://youtu.be/ZyXwVu987-6", data)
        missing = youtube_view_data_for_url("https://youtu.be/not-found00", data)
        self.assertEqual((music_box.count, music_box.youtube_only), (4321, True))
        self.assertEqual((other.count, other.youtube_only), (99, False))
        self.assertEqual((missing.count, missing.youtube_only), (0, False))


if __name__ == "__main__":
    unittest.main()
