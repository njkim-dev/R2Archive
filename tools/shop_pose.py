import bisect
import math
import struct


def couple_scene_pose(item_id, sex):
    # 이 두 모션은 서로 마주 보는 캐릭터의 로컬 좌표로 이동과 회전을 기록한다.
    if str(item_id) not in {'30854', '30855'}:
        return None
    turn = 1 if sex == 'male' else -1
    return [[0, 0, turn, 0], [0, 1, 0, 0], [-turn, 0, 0, 0], [0, 0, 0, 1]]


def read_animation(path):
    data = path.read_bytes()
    if len(data) < 8:
        raise ValueError('truncated animation header')
    count, duration = struct.unpack_from('<If', data)
    if not 0 < count < 400 or not math.isfinite(duration) or not 0 <= duration <= 100000:
        raise ValueError('invalid animation header')
    offset, tracks = 8, {}
    for _ in range(count):
        if offset >= len(data):
            raise ValueError('truncated animation bone')
        length = data[offset]
        offset += 1
        if not length or offset + length + 12 > len(data):
            raise ValueError('invalid animation bone name')
        name = data[offset:offset + length].decode('cp949')
        offset += length
        counts = struct.unpack_from('<3I', data, offset)
        offset += 12
        if name in tracks:
            raise ValueError('duplicate animation bone')
        channels = {}
        for label, size, number in zip(['position', 'rotation', 'scale'], [4, 5, 4], counts):
            if number > 100000 or offset + number * size * 4 > len(data):
                raise ValueError('truncated animation keys')
            keys = list(struct.iter_unpack('<' + 'f' * size, data[offset:offset + number * size * 4]))
            offset += number * size * 4
            if any(not all(math.isfinite(v) for v in key) or not 0 <= key[0] <= duration for key in keys):
                raise ValueError('invalid animation key')
            if any(a[0] >= b[0] for a, b in zip(keys, keys[1:])):
                raise ValueError('unordered animation keys')
            if label == 'rotation' and any(sum(v*v for v in key[1:]) < 1e-10 for key in keys):
                raise ValueError('zero animation quaternion')
            channels[label] = keys
        tracks[name] = channels
    if offset != len(data):
        raise ValueError('unexpected animation trailing data')
    return {'duration': duration, 'tracks': tracks}


def sample_channel(keys, time, rotation=False):
    if not keys:
        return None
    right = bisect.bisect_right([key[0] for key in keys], time)
    a, b = keys[max(0, right - 1)], keys[min(len(keys) - 1, right)]
    amount = 0 if a[0] == b[0] else max(0, min(1, (time - a[0]) / (b[0] - a[0])))
    left, other = list(a[1:]), list(b[1:])
    if rotation:
        left = [v / math.sqrt(sum(x*x for x in left)) for v in left]
        other = [v / math.sqrt(sum(x*x for x in other)) for v in other]
        dot = sum(v*w for v, w in zip(left, other))
        if dot < 0:
            other, dot = [-v for v in other], -dot
        if dot < .9995:
            angle = math.acos(min(1, dot))
            wa, wb = math.sin((1-amount)*angle)/math.sin(angle), math.sin(amount*angle)/math.sin(angle)
            return [wa*v + wb*w for v, w in zip(left, other)]
    value = [(1-amount)*v + amount*w for v, w in zip(left, other)]
    if rotation:
        norm = math.sqrt(sum(v*v for v in value))
        value = [v/norm for v in value]
    return value


def local_pose(track, bind, time):
    matrix = [list(row) for row in bind]
    translation = sample_channel(track['position'], time)
    quaternion = sample_channel(track['rotation'], time, rotation=True)
    scale = sample_channel(track['scale'], time)
    if quaternion:
        x, y, z, w = quaternion
        rotation = [[1-2*(y*y+z*z), 2*(x*y+z*w), 2*(x*z-y*w)],
                    [2*(x*y-z*w), 1-2*(x*x+z*z), 2*(y*z+x*w)],
                    [2*(x*z+y*w), 2*(y*z-x*w), 1-2*(x*x+y*y)]]
        for i in range(3):
            length = scale[i] if scale else math.sqrt(sum(bind[i][j]**2 for j in range(3)))
            matrix[i][:3] = [v*length for v in rotation[i]]
    elif scale:
        for i in range(3):
            length = math.sqrt(sum(bind[i][j]**2 for j in range(3)))
            if length < 1e-10:
                raise ValueError('singular bind matrix')
            matrix[i][:3] = [v*scale[i]/length for v in bind[i][:3]]
    if translation:
        matrix[3][:3] = translation
    return matrix
