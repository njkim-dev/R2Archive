import unittest
from unittest.mock import MagicMock

from youtube_views import (
    extract_youtube_video_id,
    load_youtube_view_counts,
    youtube_view_count_for_url,
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

    def test_loads_and_resolves_cached_counts(self):
        cur = MagicMock()
        cur.fetchall.return_value = [("AbCdEf123_4", 4321), ("ZyXwVu987-6", 0)]
        counts = load_youtube_view_counts(cur)
        self.assertEqual(youtube_view_count_for_url("https://youtu.be/AbCdEf123_4", counts), 4321)
        self.assertEqual(youtube_view_count_for_url("https://youtu.be/not-found00", counts), 0)


if __name__ == "__main__":
    unittest.main()
