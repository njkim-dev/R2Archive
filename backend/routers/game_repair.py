import json
import zipfile
import os
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse

router = APIRouter(prefix="/api/game-repair", tags=["game-repair"])
REPAIR_DIR = Path(os.environ.get("GAME_REPAIR_DIR", Path(__file__).resolve().parents[2] / "game_repair"))


def load_manifest():
    try:
        manifest = json.loads((REPAIR_DIR / "manifest.json").read_text(encoding="utf-8"))
        if not manifest["files"] or not str(manifest["version"]).isdigit():
            raise ValueError("invalid manifest")
        return manifest
    except (OSError, ValueError, KeyError) as exc:
        raise HTTPException(status_code=503, detail="복구 기준 파일을 준비 중입니다. 잠시 후 다시 시도해주세요.") from exc


@router.get("/manifest")
def get_manifest():
    return JSONResponse(load_manifest(), headers={"Cache-Control": "no-store"})


@router.get("/files/{snapshot}/{filename}")
def download_file(snapshot: str, filename: str):
    manifest = load_manifest()
    if snapshot != manifest["snapshot"]:
        raise HTTPException(status_code=409, detail="복구 기준이 변경되었습니다. 다시 검사해주세요.")
    entry = next((item for item in manifest["files"] if item["name"] == filename), None)
    if not entry or Path(filename).name != filename or "\\" in filename or "/" in filename:
        raise HTTPException(status_code=404, detail="file not found")
    target = resolve_file(snapshot, entry)
    return FileResponse(target, filename=filename, media_type="application/octet-stream", headers={"Cache-Control": "no-store"})


def resolve_file(snapshot, entry):
    filename = entry["name"]
    root = (REPAIR_DIR / snapshot).resolve()
    target = (root / filename).resolve()
    if Path(filename).name != filename or "\\" in filename or "/" in filename or target.parent != root or not target.is_file():
        raise HTTPException(status_code=404, detail="file not found")
    if target.stat().st_size != entry["size"]:
        raise HTTPException(status_code=503, detail="복구 기준 파일을 확인 중입니다.")
    return target


class ZipChunks:
    def __init__(self):
        self.parts = []
        self.position = 0

    def write(self, data):
        self.parts.append(data)
        self.position += len(data)
        return len(data)

    def tell(self):
        return self.position

    def flush(self):
        pass

    def take(self):
        chunk = b"".join(self.parts)
        self.parts.clear()
        return chunk


def stream_archive(files):
    chunks = ZipChunks()
    with zipfile.ZipFile(chunks, "w", compression=zipfile.ZIP_STORED, allowZip64=True) as archive:
        for entry, target in files:
            info = zipfile.ZipInfo(entry["name"])
            info.file_size = entry["size"]
            with target.open("rb") as source, archive.open(info, "w") as output:
                yield chunks.take()
                remaining = entry["size"]
                while remaining:
                    block = source.read(min(1024 * 1024, remaining))
                    if not block:
                        raise OSError("Reference file changed during download")
                    remaining -= len(block)
                    output.write(block)
                    yield chunks.take()
                if source.read(1):
                    raise OSError("Reference file changed during download")
            yield chunks.take()
    yield chunks.take()


@router.get("/archive/{snapshot}")
def download_archive(snapshot: str, name: list[str] = Query(..., min_length=1, max_length=256)):
    manifest = load_manifest()
    if snapshot != manifest["snapshot"]:
        raise HTTPException(status_code=409, detail="복구 기준이 변경되었습니다. 다시 검사해주세요.")
    entries = {item["name"]: item for item in manifest["files"]}
    files = []
    for filename in dict.fromkeys(name):
        lower = filename.lower()
        allowed = lower.endswith(".pak") or lower in {"game.exe", "hv.dll", "steam_api.dll"}
        if filename not in entries or not allowed:
            raise HTTPException(status_code=404, detail="file not found")
        entry = entries[filename]
        files.append((entry, resolve_file(snapshot, entry)))
    return StreamingResponse(stream_archive(files), media_type="application/zip", headers={
        "Content-Disposition": 'attachment; filename="R2beat-repair.zip"',
        "Cache-Control": "no-store",
        "X-Accel-Buffering": "no",
    })
