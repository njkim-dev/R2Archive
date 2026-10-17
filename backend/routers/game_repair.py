import json
import os
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, JSONResponse

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
    root = (REPAIR_DIR / snapshot).resolve()
    target = (root / filename).resolve()
    if target.parent != root or not target.is_file():
        raise HTTPException(status_code=404, detail="file not found")
    if target.stat().st_size != entry["size"]:
        raise HTTPException(status_code=503, detail="복구 기준 파일을 확인 중입니다.")
    return FileResponse(target, filename=filename, media_type="application/octet-stream", headers={"Cache-Control": "no-store"})
