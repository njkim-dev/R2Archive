import json
import zipfile
import os
import tempfile
import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from pydantic import BaseModel, StrictBool

from auth import require_admin

router = APIRouter(prefix="/api/game-repair", tags=["game-repair"])
REPAIR_DIR = Path(os.environ.get("GAME_REPAIR_DIR", Path(__file__).resolve().parents[2] / "game_repair"))
CONTROL_FILE = Path(os.environ.get("GAME_REPAIR_STATUS_FILE", Path(__file__).resolve().parents[2] / "record_screenshots" / ".service-state" / "game-repair.json"))
MAINTENANCE_MESSAGE = "게임 점검 및 복구 기준 파일 확인으로 검사와 다운로드를 일시 중단했습니다. 준비가 끝나면 다시 이용해주세요."


class RepairAvailability(BaseModel):
    enabled: StrictBool


def load_status():
    try:
        data = json.loads(CONTROL_FILE.read_text(encoding="utf-8"))
        if type(data["enabled"]) is not bool or not isinstance(data["revision"], str) or not data["revision"]:
            raise ValueError("invalid repair status")
        return {"enabled": data["enabled"], "revision": data["revision"], "message": "" if data["enabled"] else MAINTENANCE_MESSAGE}
    except FileNotFoundError:
        return {"enabled": True, "revision": "initial", "message": ""}
    except (OSError, ValueError, KeyError, TypeError):
        return {"enabled": False, "revision": "unavailable", "message": "복구 서비스 운영 상태를 확인 중입니다. 잠시 후 다시 시도해주세요."}


def require_open():
    status = load_status()
    if not status["enabled"]:
        raise HTTPException(status_code=503, detail=status["message"], headers={"Cache-Control": "no-store", "Retry-After": "30"})


@router.get("/status")
def get_status():
    return JSONResponse(load_status(), headers={"Cache-Control": "no-store"})


@router.put("/admin/status")
def update_status(request: Request, body: RepairAvailability):
    require_admin(request)
    if body.enabled:
        load_manifest(check_status=False)
    data = {"enabled": body.enabled, "revision": str(uuid.uuid4())}
    temporary = None
    try:
        CONTROL_FILE.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=CONTROL_FILE.parent, delete=False) as target:
            temporary = target.name
            json.dump(data, target)
            target.flush()
            os.fsync(target.fileno())
        os.replace(temporary, CONTROL_FILE)
    except OSError as exc:
        raise HTTPException(status_code=503, detail="운영 상태를 저장하지 못했습니다. 다시 시도해주세요.") from exc
    finally:
        if temporary:
            try:
                os.unlink(temporary)
            except OSError:
                pass
    return JSONResponse(load_status(), headers={"Cache-Control": "no-store"})


def load_manifest(check_status=True):
    if check_status:
        require_open()
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
