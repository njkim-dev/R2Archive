import logging
import re

from uvicorn.logging import AccessFormatter, DefaultFormatter

_V4 = r"(?:[0-9]{1,3}\.){3}[0-9]{1,3}"
_ZONE = r"(?:%[0-9A-Za-z_.-]+)?"
_V6_MAPPED = rf"(?=[0-9A-Fa-f:]*::|(?:[0-9A-Fa-f]{{1,4}}:){{5}})(?:[0-9A-Fa-f]{{0,4}}:){{1,7}}{_V4}{_ZONE}"
_V6 = rf"(?=[0-9A-Fa-f:]*::|(?:[0-9A-Fa-f]{{1,4}}:){{7}})(?:[0-9A-Fa-f]{{0,4}}:){{1,7}}[0-9A-Fa-f]{{0,4}}{_ZONE}"
IP_PATTERN = rf"(?<![0-9A-Za-z_:.])(?:{_V6_MAPPED}|{_V6})(?![0-9A-Za-z_:.])|(?<![0-9A-Za-z_.]){_V4}(?![0-9A-Za-z_.])"
IP_REGEX = re.compile(IP_PATTERN)


def redact_ips(text):
    return IP_REGEX.sub('[IP]', text)


class PrivacyFormatter(DefaultFormatter):
    def format(self, record: logging.LogRecord) -> str:
        return redact_ips(super().format(record))


class PrivacyAccessFormatter(AccessFormatter):
    def format(self, record: logging.LogRecord) -> str:
        return redact_ips(super().format(record))
