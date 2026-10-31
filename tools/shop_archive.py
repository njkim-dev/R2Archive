from pathlib import Path
import re
import struct


class ArchiveSource:
    def __init__(self, root, output):
        self.root, self.output = Path(root), Path(output)
        self.entries = {}
        for pak in sorted(self.root.glob('rnr_*.pak')):
            size = pak.stat().st_size
            with pak.open('rb') as stream:
                stream.seek(max(0, size - 2 * 1024 * 1024))
                data = stream.read()
            for match in re.finditer(rb'rnr_[A-Za-z0-9_]+/[^\x00\r\n]{1,230}\x00', data):
                if match.start() < 14:
                    continue
                name = match.group()[:-1]
                length, kind, start, packed, unpacked = struct.unpack_from('<BBIII', data, match.start() - 14)
                if length != len(name) or kind not in (0, 1) or not 0 < packed or not 0 < unpacked < 100_000_000 or start + packed > size:
                    continue
                try:
                    relative = name.decode('cp949').replace('\\', '/')
                except UnicodeError:
                    continue
                if '..' in relative.split('/') or ':' in relative:
                    continue
                self.entries[relative.casefold()] = (pak, relative, kind, start, packed, unpacked)

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
