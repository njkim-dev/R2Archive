import math
from pathlib import Path
import re
import struct
import xml.etree.ElementTree as ET


class Reader:
    def __init__(self, data, offset=0):
        self.data, self.offset = data, offset

    def take(self, size):
        if size < 0 or self.offset + size > len(self.data):
            raise ValueError('Truncated particle resource')
        result = self.data[self.offset:self.offset + size]
        self.offset += size
        return result

    def unpack(self, fmt):
        return struct.unpack('<' + fmt, self.take(struct.calcsize('<' + fmt)))

    def string(self, wide=True):
        length = self.unpack('B')[0]
        return self.take(length * (2 if wide else 1)).decode('utf-16-le' if wide else 'cp949')

    def finish(self):
        if self.offset != len(self.data):
            raise ValueError('Unexpected particle resource trailing data')


def read_aif(path):
    reader = Reader(Path(path).read_bytes())
    magic, version, count = reader.unpack('IHI')
    if magic != 0x51523DAF or version not in [2, 3] or count > 256:
        raise ValueError('Unsupported particle attachment format')
    result = []
    for _ in range(count):
        particle, animation, bone = reader.string(), reader.string(), reader.string(False)
        values = reader.unpack('8f')
        flags = list(reader.take(6 if version == 2 else 7))
        if not all(math.isfinite(value) for value in values) or not 0 <= values[0] <= 100000 or not 0 <= values[1] <= 100000:
            raise ValueError('Invalid particle attachment transform')
        result.append({'file': particle, 'animation': animation, 'bone': bone, 'start': values[0], 'end': values[1],
                       'position': list(values[2:5]), 'rotation': list(values[5:8]), 'flags': flags})
    reader.finish()
    return result


def numbers(value):
    return [float(number) for number in re.findall(r'[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?', value or '')]


def read_pfx(path):
    data = Path(path).read_bytes()
    if data.lstrip().startswith(b'<'):
        try:
            text = data.decode('utf-8-sig')
        except UnicodeError:
            text = data.decode('cp949')
        root = ET.fromstring(text)
        layers = []
        for index, node in enumerate(root.findall('Particle')):
            def field(name, default):
                values = numbers(node.findtext(name))
                return values if values else default
            start, end = field('MinColor', [1, 1, 1, 1]), field('MaxColor', [1, 1, 1, 1])
            size0, size1 = field('StartSize', [.03, .03, .03]), field('EndSize', [.03, .03, .03])
            layers.append({'name': f'Particle{index}', 'texture': (node.findtext('Texture') or '').strip(), 'format': 'xml',
                           'count': int(field('Num', [1])[0]), 'interval': field('Term', [.1])[0], 'legacy_loop': int(field('Loop', [0])[0]),
                           'position': field('Translate', [0, 0, 0]), 'min_position': field('MinPos', [0, 0, 0]), 'max_position': field('MaxPos', [0, 0, 0]), 'position_scale': [1, 1, 1],
                           'min_direction': field('MinDir', [0, 0, 0]), 'max_direction': field('MaxDir', [0, 0, 0]), 'gravity': field('Gravity', [0, 0, 0]),
                           'lifetime': [field('MinLifetime', [1])[0], field('MaxLifetime', [1])[0]],
                           'velocity': [field('MinVelocity', [0])[0], field('MaxVelocity', [0])[0]],
                           'colors': [start, end, [*end[:3], 0] if field('FadeOut', [1])[0] else end],
                           'sizes': [[size0[0], size0[0], size0[1], size0[1]], [(size0[0] + size1[0]) / 2] * 2 + [(size0[1] + size1[1]) / 2] * 2, [size1[0], size1[0], size1[1], size1[1]]],
                           'midpoint': .5, 'uv_fps': 10, 'uv': [[0, 0, 1, 1]], 'additive': int(field('DestBlend', [2])[0]) == 2,
                           'axis': field('Axis', [0, 0, 0]), 'angular_velocity': field('LocalAngle', [0])[0], 'acceleration': field('Accel', [0, 0, 0]),
                           'approximations': ['legacy axis orbit and random-mode flags']})
    else:
        reader = Reader(data)
        magic, version, flags, count = reader.unpack('I H B I')
        if magic != 0x81523DAF or version != 3 or count > 128:
            raise ValueError('Unsupported binary particle format')
        layers = []
        for _ in range(count):
            name, texture = reader.string(), reader.string()
            block = reader.take(372)
            def floats(offset, count):
                return list(struct.unpack_from('<' + 'f' * count, block, offset))
            def integer(offset):
                return struct.unpack_from('<I', block, offset)[0]
            uv_count = integer(368)
            if not 1 <= uv_count <= 256:
                raise ValueError('Invalid particle sprite frame count')
            uv = [list(reader.unpack('4f')) for _ in range(uv_count)]
            layers.append({'name': name, 'texture': texture, 'format': 'binary-v3', 'count': integer(96), 'interval': floats(100, 1)[0],
                           'position': floats(0, 3), 'min_position': floats(12, 3), 'max_position': floats(24, 3), 'position_scale': floats(36, 3),
                           'min_direction': floats(52, 3), 'max_direction': floats(64, 3), 'gravity': floats(84, 3),
                           'lifetime': floats(108, 2), 'velocity': floats(116, 2), 'colors': [floats(offset, 4) for offset in [124, 140, 156]],
                           'sizes': [floats(offset, 4) for offset in [176, 192, 208]], 'midpoint': floats(284, 1)[0], 'uv_fps': integer(288),
                           'uv': uv, 'additive': integer(360) == 1, 'angular_velocity': floats(276, 1)[0], 'acceleration': [0, 0, 0],
                           'source_flags': {'system': flags, 'loop': integer(104), 'render': integer(356), 'sprite': integer(364)},
                           'approximations': ['binary emission interval uses source ticks', 'engine random-mode, axis and render flags']})
        reader.finish()
    for layer in layers:
        if not 0 <= layer['count'] <= 100000 or not layer['texture'] or len(layer['colors']) != 3:
            raise ValueError('Invalid particle layer')
        for key in ['position', 'min_position', 'max_position', 'position_scale', 'min_direction', 'max_direction', 'gravity', 'lifetime', 'velocity', 'acceleration', 'colors', 'sizes', 'uv']:
            values = layer[key]
            flat = [value for row in values for value in row] if values and isinstance(values[0], list) else values
            if not all(math.isfinite(value) and abs(value) < 1e7 for value in flat):
                raise ValueError('Invalid particle parameter')
        if len(layer['lifetime']) != 2 or min(layer['lifetime']) <= 0 or not math.isfinite(layer['interval']) or layer['interval'] < 0:
            raise ValueError('Invalid particle timing')
    return layers
