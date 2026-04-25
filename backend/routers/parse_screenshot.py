"""스크린샷에서 판정을 OCR로 추출.

R2Beat 결과 화면에서 판정이 표시되는 영역 (화면 전체 비율 기준):
  x: 77% ~ 100%
  y: 60% ~ 75%

Tesseract 한 줄(PSM 7) + 숫자/점 화이트리스트로 인식 후,
정규식으로 ##.### 패턴을 뽑아 0 <= x <= 99.000 범위로 클램프.
"""
import io
import logging
import re
from typing import Optional

from fastapi import APIRouter, File, Request, UploadFile
from PIL import Image, ImageOps
import pytesseract

from auth import require_user_id
from rate_limit import limiter

logger = logging.getLogger("ocr.screenshot")

router = APIRouter(prefix="/api", tags=["screenshot"])

_MAX_BYTES = 10 * 1024 * 1024
_MAX_DIMENSION = 4000          # 가로/세로 각각의 한도
_MAX_PIXELS = 16 * 1024 * 1024  # 16MP — decompression bomb 방지

# 판정값은 "XX.XXX%" 형태 (소수점 3자리)
# OCR 노이즈로 뒤에 숫자가 붙어도 매칭되도록 lookahead 미사용.
_PERCENT_RE = re.compile(r'(\d{1,2})[.,](\d{3})')


def _crop_box_for(w: int, h: int) -> tuple[int, int, int, int]:
    """종횡비별로 판정 패널 영역만 타이트하게 크롭.
    너무 넓게 잡으면 캐릭터/배경이 OCR 노이즈로 들어감.
    """
    aspect = w / h if h else 1.0
    if aspect > 1.5:
        # 16:9 (1920x1080 등): 판정 패널 ≈ x 77-100%, y 72-85%
        return (int(w * 0.77), int(h * 0.72), w, int(h * 0.85))
    # 4:3 (800x600, 1024x768 등): 판정 패널 ≈ x 65-100%, y 55-70%
    return (int(w * 0.65), int(h * 0.55), w, int(h * 0.72))

_TESS_CONFIGS = [
    r'--oem 3 --psm 7 -c tessedit_char_whitelist=0123456789.',
    r'--oem 3 --psm 6 -c tessedit_char_whitelist=0123456789.',
]


def _extract_percent(text: str) -> Optional[float]:
    cleaned = text.replace(' ', '').replace('\n', '')
    candidates: list[float] = []
    for m in _PERCENT_RE.finditer(cleaned):
        whole = m.group(1)
        frac = m.group(2)[:3].ljust(3, '0')
        try:
            val = float(f"{whole}.{frac}")
        except ValueError:
            continue
        if 0 <= val <= 99.0:
            candidates.append(val)
    if not candidates:
        return None
    return max(candidates)


def _binarize(gray: Image.Image, inverted: bool) -> Image.Image:
    """gray(L 모드) → 이진화. inverted=True 면 어두운 글자(밝은 배경)를 흰색 글자로 뒤집음"""
    contrasted = ImageOps.autocontrast(gray)
    if inverted:
        threshold = 128
        bw = contrasted.point(lambda p: 0 if p > threshold else 255)
    else:
        threshold = 160
        bw = contrasted.point(lambda p: 255 if p > threshold else 0)
    bw = bw.resize((bw.width * 3, bw.height * 3), Image.LANCZOS)
    return bw


def _crop(img: Image.Image) -> Image.Image:
    w, h = img.size
    box = _crop_box_for(w, h)
    return img.crop(box).convert('L')


@router.post("/parse-screenshot")
@limiter.limit("60/hour")
async def parse_screenshot(request: Request, image: UploadFile = File(...)):
    # 로그인 필수 — Pillow 공격 표면 축소. 기록 업로드 흐름에서만 호출됨.
    require_user_id(request)

    content = await image.read()
    if len(content) > _MAX_BYTES:
        return {"judgment_percent": None, "error": "파일 용량이 너무 큽니다"}

    try:
        img = Image.open(io.BytesIO(content))
        # 픽셀 디코드 전에 헤더의 dimension부터 검사 — decompression bomb 방어.
        w, h = img.size
        if w > _MAX_DIMENSION or h > _MAX_DIMENSION or (w * h) > _MAX_PIXELS:
            return {"judgment_percent": None, "error": "이미지 크기가 너무 큽니다"}
        img.load()
    except Exception:
        return {"judgment_percent": None, "error": "잘못된 이미지입니다"}

    try:
        gray = _crop(img)
    except Exception as e:
        logger.exception("[ocr] 크롭 실패")
        return {"judgment_percent": None, "error": f"이미지 크롭 실패: {type(e).__name__}"}

    raws: list[str] = []
    best_pct: Optional[float] = None

    for inverted in (False, True):
        try:
            bw = _binarize(gray, inverted)
        except Exception:
            continue
        for cfg in _TESS_CONFIGS:
            try:
                text = pytesseract.image_to_string(bw, config=cfg)
            except Exception as e:
                logger.warning("[ocr] tesseract 실패 (inv=%s cfg=%s): %s", inverted, cfg, e)
                continue
            raws.append(text.strip())
            pct = _extract_percent(text)
            if pct is None:
                continue
            if pct > 99.0:
                pct = 99.0
            if best_pct is None or pct > best_pct:
                best_pct = pct

    if best_pct is None:
        logger.info("[ocr] 판정% 추출 실패; raws=%s", raws)
        return {"judgment_percent": None, "raw": " | ".join(raws)[:200]}

    return {"judgment_percent": round(best_pct, 3), "raw": " | ".join(raws)[:200]}
