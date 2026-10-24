import http.client
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

os.environ.setdefault("SESSION_SECRET", "isolated-proxy-regression-secret-32-bytes")
os.environ.setdefault("DB_PORT", "5432")

from starlette.requests import Request
from rate_limit import ip_key


def unused_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


@unittest.skipUnless(shutil.which("caddy"), "Caddy integration runs in the release image")
class ProxyChainTests(unittest.TestCase):
    def test_real_proxy_preserves_distinct_ips_and_rejects_untrusted_forwarding(self):
        class Echo(BaseHTTPRequestHandler):
            def do_GET(self):
                forwarded = self.headers.get("X-Forwarded-For", "")
                req = Request({"type": "http", "headers": [(b"x-forwarded-for", forwarded.encode())],
                               "client": (self.client_address[0], self.client_address[1])})
                body = json.dumps({"ip": ip_key(req), "xff": forwarded}).encode()
                self.send_response(200)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            def log_message(self, *args): pass

        server = ThreadingHTTPServer(("127.0.0.1", 0), Echo)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        port = unused_port()
        source = Path(os.environ.get("AUDIT_CADDYFILE", Path(__file__).resolve().parent.parent.parent / "Caddyfile"))
        if not source.exists(): source = Path("/etc/caddy/Caddyfile")
        config = source.read_text().replace("{\n", "{\n\tadmin off\n", 1).replace(":3000\n", f"http://127.0.0.1:{port}\n", 1)
        env = {**os.environ, "API_UPSTREAM": f"127.0.0.1:{server.server_port}",
               "TRUSTED_PROXY_CIDRS": "127.0.0.1/32"}
        process = None
        try:
            with tempfile.TemporaryDirectory() as folder:
                path = Path(folder, "Caddyfile")
                path.write_text(config)
                with Path(folder, "caddy.log").open("w+") as log:
                    process = subprocess.Popen(["caddy", "run", "--config", str(path)], env=env, stdout=log, stderr=log)
                    for _ in range(100):
                        if process.poll() is not None:
                            log.seek(0)
                            self.fail(log.read())
                        try:
                            with socket.create_connection(("127.0.0.1", port), timeout=.1): break
                        except OSError: time.sleep(.03)
                    else: self.fail("Caddy did not start")

                    def get(peer, forwarded):
                        client = http.client.HTTPConnection("127.0.0.1", port, timeout=5, source_address=(peer, 0))
                        try:
                            client.request("GET", "/api/proxy-test", headers={"X-Forwarded-For": forwarded})
                            response = client.getresponse()
                            self.assertEqual(response.status, 200)
                            return json.loads(response.read())
                        finally: client.close()

                    for ip in ("198.51.100.10", "203.0.113.20"):
                        self.assertEqual(get("127.0.0.1", ip), {"ip": ip, "xff": ip})
                    self.assertEqual(get("127.0.0.2", "198.51.100.10"),
                                     {"ip": "127.0.0.2", "xff": "127.0.0.2"})
                    self.assertEqual(get("127.0.0.1", "198.51.100.10, 203.0.113.20")["ip"], "203.0.113.20")
                    process.terminate()
                    process.wait(timeout=10)
                    process = None
        finally:
            if process is not None:
                process.terminate()
                process.wait(timeout=10)
            server.shutdown()
            server.server_close()


if __name__ == "__main__": unittest.main()
