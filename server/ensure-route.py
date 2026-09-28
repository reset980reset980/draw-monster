"""monster.xsw.kr 경로를 Caddy에 붙임 (없을 때만). 다른 경로는 그대로 둠. classroom-board 방식과 같음."""
import json
from urllib.error import HTTPError
from urllib.request import Request, urlopen

admin = 'http://127.0.0.1:2019'
collection = admin + '/config/apps/http/servers/srv0/routes'
hostname = 'monster.xsw.kr'
route_id = 'monster-lobby'
route = {
    '@id': route_id,
    'match': [{'host': [hostname]}],
    'handle': [{'handler': 'reverse_proxy', 'upstreams': [{'dial': '127.0.0.1:8793'}]}],
    'terminal': True,
}

def ensure_route():
    for attempt in range(3):
        with urlopen(collection, timeout=10) as response:
            routes = json.load(response)
            etag = response.headers.get('ETag')
        if not isinstance(routes, list) or not etag:
            raise RuntimeError('Expected a Caddy route array with a concurrency ETag.')
        owned = [c for c in routes if c.get('@id') == route_id]
        matching_host = [c for c in routes if any(hostname in m.get('host', []) for m in c.get('match', []))]
        if owned or matching_host:
            if len(owned) == 1 and len(matching_host) == 1 and owned[0] == matching_host[0] == route:
                return
            raise RuntimeError('monster.xsw.kr host or route ID is already used by different configuration.')
        request = Request(collection, data=json.dumps(route).encode(), method='POST',
                          headers={'Content-Type': 'application/json', 'If-Match': etag})
        try:
            with urlopen(request, timeout=20) as response:
                response.read()
        except HTTPError as error:
            if error.code == 412:
                continue
            raise
        with urlopen(admin + '/id/' + route_id, timeout=10) as response:
            if json.load(response) != route:
                raise RuntimeError('The new Caddy route did not match its expected configuration.')
        print('Added monster.xsw.kr route; existing routes preserved.')
        return
    raise RuntimeError('Caddy configuration kept changing; retry on the next timer run.')

if __name__ == '__main__':
    ensure_route()
