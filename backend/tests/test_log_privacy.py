import json
import logging
from pathlib import Path
import unittest

from log_privacy import IP_REGEX, PrivacyAccessFormatter, PrivacyFormatter, redact_ips


class LogPrivacyTests(unittest.TestCase):
    def test_ipv4_ipv6_and_forwarded_headers_are_removed_while_diagnostics_remain(self):
        addresses = ['203.0.113.7', '192.168.0.8', '127.0.0.1', '::1', '::', '2001:db8::8', '2001:0db8:0000:0000:0000:0000:0000:0008', 'fe80::1%eth0', '::ffff:192.0.2.3', '0:0:0:0:0:ffff:192.0.2.3']
        for address in addresses:
            with self.subTest(address=address):
                original = f'2026/11/04 21:15:30 [error] client: {address}, request: "GET /music/ HTTP/1.1", upstream: "http://[{address}]:8000/"'
                output = redact_ips(original)
                self.assertNotIn(address, output)
                self.assertIn('2026/11/04 21:15:30 [error]', output)
                self.assertIn('GET /music/ HTTP/1.1', output)
                self.assertEqual(len(IP_REGEX.findall(output)), 0)
        self.assertEqual(redact_ips('dial tcp 192.168.0.8:8000 failed'), 'dial tcp [IP]:8000 failed')

    def test_access_log_omits_client_peer_and_redacts_ips_in_request_url(self):
        record = logging.LogRecord('uvicorn.access', logging.INFO, __file__, 1, '%s - "%s %s HTTP/%s" %d', ('2001:db8::8:50000', 'GET', '/debug?ip=203.0.113.7', '1.1', 200), None)
        output = PrivacyAccessFormatter('%(levelprefix)s "%(request_line)s" %(status_code)s', use_colors=False).format(record)
        self.assertNotIn('2001:db8', output)
        self.assertNotIn('203.0.113.7', output)
        self.assertIn('GET /debug?ip=[IP] HTTP/1.1', output)
        self.assertIn('200', output)

    def test_exception_log_still_contains_error_type_and_redacts_traceback(self):
        try:
            raise ValueError('upstream 203.0.113.9 refused a connection')
        except ValueError:
            import sys
            record = logging.LogRecord('uvicorn.error', logging.ERROR, __file__, 1, 'Failed for %s', ('2001:db8::8',), sys.exc_info())
        output = PrivacyFormatter('%(levelprefix)s %(message)s', use_colors=False).format(record)
        self.assertIn('ValueError', output)
        self.assertIn('refused a connection', output)
        self.assertNotIn('203.0.113.9', output)
        self.assertNotIn('2001:db8::8', output)

    def test_runtime_logging_configuration_uses_privacy_formatters(self):
        config = json.loads((Path(__file__).parents[1] / 'logging.json').read_text())
        self.assertEqual(config['formatters']['default']['()'], 'log_privacy.PrivacyFormatter')
        self.assertNotIn('client_addr', config['formatters']['access']['fmt'])
