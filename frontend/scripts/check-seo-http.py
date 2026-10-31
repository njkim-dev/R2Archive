import sys
import time
from html.parser import HTMLParser
from urllib.error import HTTPError, URLError
from urllib.request import Request, build_opener,HTTPRedirectHandler
class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,headers,newurl):return None
opener=build_opener(NoRedirect())
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
        with opener.open(request, timeout=10) as response:
            return response.status, response.headers, response.read().decode('utf-8')
    except HTTPError as error:
        return error.code, error.headers, error.read().decode('utf-8')


if base:
    for attempt in range(30):
        try:
            if get('r2archive.com','/music/')[0]==200:break
        except (URLError,TimeoutError,ConnectionError):pass
        time.sleep(1)
    else:raise RuntimeError('Web server did not become ready')

host='r2archive.com'
pages={'/music/':'알투비트 음악 아카이브 | R2Archive','/music/pmang-songs':'과거 피망 알투비트 음악 목록 | R2Archive','/music/updates':'알투비트 음악 업데이트 내역 | R2Archive'}
documents=[]
for path,title in pages.items():
    for query in ['', '?search=test']:
        status,headers,html=get(host,path+query);assert status==200,(path,status)
        assert 'text/html' in headers.get('Content-Type','') and 'noindex' not in headers.get('X-Robots-Tag','')
        head=Head(html);assert head.title==title,(path,head.title);assert head.canonicals==['https://'+host+path]
        descriptions=[attrs['content'] for tag,attrs in head.tags if tag=='meta' and attrs.get('name')=='description'];assert len(descriptions)==1 and len(descriptions[0])>20
        verification=[attrs for tag,attrs in head.tags if tag=='meta' and attrs.get('name')=='google-site-verification'];assert len(verification)==1 and 'data-page-seo' not in verification[0]
        documents.append(head)
    assert get(host,path,'Googlebot')[2]==get(host,path)[2]
for path in ['/robots.txt','/sitemap.xml']:
    status,headers,body=get(host,path);assert status==200
    if path.endswith('.txt'):
        assert 'Allow: /music/' in body and 'Disallow: /myhome' in body and 'Sitemap: https://r2archive.com/sitemap.xml' in body
    else:
        locations=[node.text for node in ElementTree.fromstring(body).findall('{*}url/{*}loc')];assert locations==['https://'+host+path for path in pages]
for path in ['/music/removed-songs','/music/analytics','/music/personal-categories','/xyx/','/shop','/myhome','/myhome/test','/short/abcd']:
    status,headers,html=get(host,path);assert status==200 and 'noindex' in headers.get('X-Robots-Tag',''),(path,status,headers)
    assert Head(html).canonicals==[]
for legacy,prefix in [('music.r2archive.com','/music'),('xyx.r2archive.com','/xyx')]:
    for path in ['/','/removed-songs?q=test']:
        status,headers,_=get(legacy,path);assert status==308 and headers['Location']=='https://r2archive.com'+prefix+path
    for path in ['/robots.txt','/sitemap.xml']:
        status,headers,_=get(legacy,path);assert status==308 and headers['Location']=='https://r2archive.com'+path
for path in ['/.env','/api/docs','/seo/kr/home.html','/music/.env','/xyx/.git/config']:
    assert get(host,path)[0]==404,path
for legacy in ['music.r2archive.com','xyx.r2archive.com']:
    assert get(legacy,'/.env')[0]==404
xyx=Head(get(host,'/xyx/')[2]);assert xyx.title=='알투비트 아카이브 — Music' and not any(tag=='meta' and attrs.get('name')=='google-site-verification' for tag,attrs in xyx.tags)
assert all(document.body==xyx.body for document in documents)
for tag,attrs in documents[0].tags:
    path=attrs.get('src') if tag=='script' else attrs.get('href') if attrs.get('rel')=='stylesheet' else None
    if path and path.startswith('/assets/'):
        status,headers,_=get(host,path);assert status==200 and 'text/html' not in headers.get('Content-Type','') and 'immutable' in headers.get('Cache-Control','')
status,headers,_=get(host,'/');assert status==200 and headers.get('Cache-Control')=='no-store' and not headers.get('Location') and not headers.get('Clear-Site-Data')
assert get(host,'/?refresh=home')[1].get('Clear-Site-Data')=='"cache"'
assert not get(host,'/music/?refresh=home')[1].get('Clear-Site-Data')
print('PASS: music-prefix metadata, canonical URLs, sitemap, robots, legacy redirects, crawler parity, protected paths, immutable shared assets, XYX isolation and portal cache behavior')
