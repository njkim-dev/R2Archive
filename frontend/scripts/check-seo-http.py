import sys
import time
from html.parser import HTMLParser
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from xml.etree import ElementTree


class Head(HTMLParser):
    def __init__(self, html):
        super().__init__()
        self.tags = []
        self.title = ''
        self.in_title = False
        self.body = []
        self.in_body = False
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        self.tags.append((tag, attrs))
        self.in_title = tag == 'title' or self.in_title
        self.in_body = tag == 'body' or self.in_body
        if self.in_body:
            self.body.append((tag, attrs))

    def handle_endtag(self, tag):
        if tag == 'title':
            self.in_title = False
        if tag == 'body':
            self.in_body = False

    def handle_data(self, data):
        if self.in_title:
            self.title += data

    @property
    def canonicals(self):
        return [attrs['href'] for tag, attrs in self.tags if tag == 'link' and attrs.get('rel') == 'canonical']


base = sys.argv[1].rstrip('/') if len(sys.argv) > 1 else None


def get(host, path, user_agent='SEO regression test'):
    url = (base or f'https://{host}') + path
    request = Request(url, headers={'Host': host, 'User-Agent': user_agent, 'Cache-Control': 'no-cache'})
    try:
        with urlopen(request, timeout=10) as response:
            return response.status, response.headers, response.read().decode('utf-8')
    except HTTPError as error:
        return error.code, error.headers, error.read().decode('utf-8')


if base:
    for attempt in range(30):
        try:
            if get('music.r2archive.com', '/')[0] == 200:
                break
        except (URLError, TimeoutError, ConnectionError):
            pass
        time.sleep(1)
    else:
        raise RuntimeError('Web server did not become ready')

host = 'music.r2archive.com'
pages = {'/': '알투비트 음악 아카이브 | R2Archive', '/pmang-songs': '과거 피망 알투비트 음악 목록 | R2Archive'}
documents = []
for path, title in pages.items():
    for query in ['', '?search=test']:
        status, headers, html = get(host, path + query)
        assert status == 200, (path, status)
        assert 'text/html' in headers.get('Content-Type', '')
        assert 'noindex' not in headers.get('X-Robots-Tag', '')
        head = Head(html)
        assert head.title == title, (path, head.title)
        assert head.canonicals == [f'https://{host}{path}'], head.canonicals
        descriptions = [attrs['content'] for tag, attrs in head.tags if tag == 'meta' and attrs.get('name') == 'description']
        assert len(descriptions) == 1 and len(descriptions[0]) > 20
        if path == '/':
            assert descriptions == ['한국·중국 서버의 알투비트 음악 정보를 확인하고 음악을 들을 수 있어요.']
        verification = [attrs for tag, attrs in head.tags if tag == 'meta' and attrs.get('name') == 'google-site-verification']
        assert len(verification) == 1
        assert verification[0]['content'] == 'DXgPBP38iWVZ-p_7pOaEbltAqpG-r4G4Ss0mdyZVJBY'
        assert 'data-page-seo' not in verification[0]
        documents.append(head)
    assert get(host, path, 'Googlebot')[2] == get(host, path)[2]

for path in ['/robots.txt', '/sitemap.xml']:
    status, headers, body = get(host, path)
    assert status == 200, (path, status)
    if path.endswith('.txt'):
        assert 'text/plain' in headers.get('Content-Type', '')
        assert 'Allow: /' in body and 'Disallow:' not in body
        assert f'Sitemap: https://{host}/sitemap.xml' in body
    else:
        assert 'xml' in headers.get('Content-Type', '')
        tree = ElementTree.fromstring(body)
        locations = [node.text for node in tree.findall('{*}url/{*}loc')]
        assert locations == [f'https://{host}{path}' for path in pages], locations

for path in ['/removed-songs', '/analytics', '/personal-categories']:
    status, headers, html = get(host, path)
    assert status == 200
    assert 'noindex' in headers.get('X-Robots-Tag', '')
    assert Head(html).canonicals == []

for path in ['/.env', '/api/docs', '/seo/kr/home.html', '/seo/kr/sitemap.xml']:
    assert get(host, path)[0] == 404, path

status, _, html = get('xyx.r2archive.com', '/')
xyx = Head(html)
assert status == 200 and xyx.canonicals == []
assert xyx.title == '알투비트 아카이브 — Music'
assert not any(tag == 'meta' and attrs.get('name') == 'google-site-verification' for tag, attrs in xyx.tags)
assert all(document.body == xyx.body for document in documents)
assert get('xyx.r2archive.com', '/robots.txt')[0] == 404
assert get('xyx.r2archive.com', '/sitemap.xml')[0] == 404

for tag, attrs in documents[0].tags:
    path = attrs.get('src') if tag == 'script' else attrs.get('href') if attrs.get('rel') == 'stylesheet' else None
    if path and path.startswith('/assets/'):
        status, headers, _ = get(host, path)
        assert status == 200 and 'text/html' not in headers.get('Content-Type', '')

print('PASS: initial metadata, Google verification, canonical URLs, sitemap, robots, crawler parity, protected paths, shared body/assets and XYX isolation')
