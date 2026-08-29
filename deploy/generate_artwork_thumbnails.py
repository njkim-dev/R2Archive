from __future__ import annotations

import argparse
import os
from concurrent.futures import ThreadPoolExecutor
from functools import partial
from pathlib import Path

from PIL import Image, ImageOps


SOURCE_EXTENSIONS = {".bmp", ".png", ".jpg", ".jpeg"}
SOURCE_PRIORITY = {".bmp": 0, ".png": 1, ".jpg": 2, ".jpeg": 3}


def generate_thumbnail(source: Path, *, force: bool, quality: int) -> bool:
    destination = source.with_suffix(".webp")
    if (
        not force
        and destination.exists()
        and destination.stat().st_size > 0
        and destination.stat().st_mtime_ns >= source.stat().st_mtime_ns
    ):
        return False

    temporary = destination.with_suffix(".webp.tmp")
    with Image.open(source) as image:
        image = ImageOps.exif_transpose(image).convert("RGB")
        image.save(temporary, format="WEBP", quality=quality, method=6)
    os.replace(temporary, destination)
    return True


def process_source(source: Path, *, force: bool, quality: int) -> tuple[Path, bool, str | None]:
    try:
        return source, generate_thumbnail(source, force=force, quality=quality), None
    except Exception as exc:
        return source, False, str(exc)


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate WebP artwork files next to source images.")
    parser.add_argument("directories", nargs="+", type=Path)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--quality", type=int, default=80)
    parser.add_argument("--workers", type=int, default=min(8, os.cpu_count() or 4))
    args = parser.parse_args()

    sources_by_destination: dict[Path, Path] = {}
    for directory in args.directories:
        if not directory.is_dir():
            parser.error(f"directory does not exist: {directory}")
        for path in directory.iterdir():
            extension = path.suffix.lower()
            if not path.is_file() or extension not in SOURCE_EXTENSIONS:
                continue
            destination = path.with_suffix(".webp")
            current = sources_by_destination.get(destination)
            if current is None or SOURCE_PRIORITY[extension] < SOURCE_PRIORITY[current.suffix.lower()]:
                sources_by_destination[destination] = path
    sources = list(sources_by_destination.values())

    created = 0
    skipped = 0
    failures: list[tuple[Path, str]] = []
    worker = partial(process_source, force=args.force, quality=args.quality)
    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as executor:
        for index, (source, was_created, error) in enumerate(executor.map(worker, sorted(sources)), start=1):
            if error is not None:
                failures.append((source, error))
            elif was_created:
                created += 1
            else:
                skipped += 1
            if index % 250 == 0 or index == len(sources):
                print(
                    f"processed={index}/{len(sources)} created={created} "
                    f"skipped={skipped} failed={len(failures)}",
                    flush=True,
                )

    for source, error in failures:
        print(f"failed: {source}: {error}")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
