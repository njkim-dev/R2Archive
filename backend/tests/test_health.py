import os
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

os.environ.setdefault("SESSION_SECRET", "test-session-secret-at-least-32-characters")

import main


class HealthEndpointTests(unittest.TestCase):
    def test_live_does_not_query_database(self):
        with patch.object(main, "init_pool"), patch.object(main, "close_pool"):
            with TestClient(main.app) as client:
                with patch.object(main, "check_database", side_effect=AssertionError):
                    response = client.get("/api/health/live", headers={"host": "localhost"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})

    def test_ready_reports_database_failure(self):
        with patch.object(main, "init_pool"), patch.object(main, "close_pool"):
            with TestClient(main.app) as client:
                with patch.object(main, "check_database", side_effect=RuntimeError):
                    response = client.get("/api/health/ready", headers={"host": "localhost"})
        self.assertEqual(response.status_code, 503)
