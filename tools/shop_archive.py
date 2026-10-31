from pathlib import Path
import re
import struct


def archive_index(pak):
    size = pak.stat().st_size
    if size < 9:
        return []
    with pak.open('rb') as stream:
        stream.seek(-9, 2)
        hint, _, marker = struct.unpack('<IIB', stream.read())
        if marker != 18 or hint >= size:
            raise ValueError('Unsupported game archive footer')
        origin = max(0, hint - 256)
        stream.seek(origin)
        data = stream.read(size - 9 - origin)
    roots = re.finditer(rb'([\x01-\xff])\x02\x00{12}([A-Za-z0-9_]+)\x00', data)
    root = next((entry for entry in roots if entry[1][0] == len(entry[2])), None)
    if root is None:
        if size <= 32:
            return []
        raise ValueError('Game archive directory missing')
    cursor, entries = root.start(), []
    while cursor < len(data):
        length, kind, start, packed, unpacked = struct.unpack_from('<BBIII', data, cursor)
        cursor += 14
        name = data[cursor:cursor + length]
        if not length or cursor + length >= len(data) or data[cursor + length] != 0:
            raise ValueError('Invalid game archive filename')
        cursor += length + 1
        try:
            relative = name.decode('cp949').replace('\\', '/')
        except UnicodeError:
            relative = name.decode('cp936').replace('\\', '/')
        if relative.startswith('/') or '..' in relative.split('/') or ':' in relative or kind not in (0, 1, 2):
            raise ValueError('Invalid game archive entry')
        if kind == 2:
            continue
        if start + packed > origin + root.start() or unpacked > 256 * 1024 * 1024:
            raise ValueError('Invalid game archive data bounds')
        entries.append((pak, relative, kind, start, packed, unpacked))
    return entries


class ArchiveSource:
    def __init__(self, root, output):
        self.root, self.output = Path(root), Path(output)
        self.entries = {}
        self.archive_errors = {}
        for pak in sorted(self.root.rglob('*.pak')):
            try:
                for entry in archive_index(pak):
                    self.entries[entry[1].casefold()] = entry
            except (ValueError, UnicodeError, OSError, struct.error) as error:
                self.archive_errors[pak.relative_to(self.root).as_posix()] = str(error)

    def resolve(self, relative):
        relative = relative.replace('\\', '/')
        if relative.startswith('/') or '..' in relative.split('/') or ':' in relative:
            raise ValueError('Invalid game resource path')
        physical = self.root / relative
        if physical.is_file():
            return physical
        entry = self.entries.get(relative.casefold())
        if not entry:
            return None
        pak, name, kind, start, packed, size = entry
        target = self.output / name
        if target.is_file() and target.stat().st_size == size:
            return target
        with pak.open('rb') as stream:
            stream.seek(start)
            source = stream.read(packed)
        result, cursor = bytearray(), 0
        if kind == 0:
            result.extend(source)
        else:
            while cursor < len(source):
                flags = source[cursor]
                cursor += 1
                for bit in range(8):
                    if cursor == len(source):
                        break
                    if flags & (1 << bit):
                        if cursor + 2 > len(source):
                            raise ValueError('Truncated game archive token')
                        pair = struct.unpack_from('<H', source, cursor)[0]
                        cursor += 2
                        distance, count = pair & 4095, (pair >> 12) + 2
                        if not 0 < distance <= len(result):
                            raise ValueError('Invalid game archive distance')
                        for _ in range(count):
                            result.append(result[-distance])
                    else:
                        result.append(source[cursor])
                        cursor += 1
                    if len(result) > size:
                        raise ValueError('Game archive expands beyond declared size')
        if len(result) != size:
            raise ValueError('Game archive size mismatch')
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(result)
        return target
