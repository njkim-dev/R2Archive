import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
from pathlib import Path
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi import _rate_limit_exceeded_handler
from starlette.middleware.trustedhost import TrustedHostMiddleware

from database import check_database, close_pool, init_pool
from rate_limit import limiter
from security_middleware import BrowserCSRFMiddleware
from routers import songs, comments, perceived, feedback, records, parse_screenshot, auth_oauth, users, rankings, groups, personal_categories, feedback_items, pmang_songs, pmang_user, youtube_candidates, xyx_songs, xyx_categories, xyx_detail, analytics, practice_sections

STATIC_DIR = Path(__file__).parent.parent / "rnr_image"
XYX_STATIC_DIR = Path(__file__).parent.parent / "xyx" / "rnr_image"
PMANG_STATIC_DIR = Path(__file__).parent.parent / "pmang_image"

_default_origins = "http://localhost:5173,http://localhost:3000"
CORS_ORIGINS = [o.strip() for o in os.environ.get("CORS_ORIGINS", _default_origins).split(",")]
_default_trusted_hosts = "music.r2archive.com,xyx.r2archive.com,r2archive.com,localhost,127.0.0.1"
TRUSTED_HOSTS = [h.strip() for h in os.environ.get("TRUSTED_HOSTS", _default_trusted_hosts).split(",") if h.strip()]


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_pool()
    try:
        yield
    finally:
        close_pool()


app = FastAPI(title="R2Beat Archive API", lifespan=lifespan)


@app.get("/api/health/live", include_in_schema=False)
def health_live():
    return {"status": "ok"}


@app.get("/api/health/ready", include_in_schema=False)
def health_ready():
    try:
        if check_database():
            return {"status": "ready"}
    except Exception as exc:
        raise HTTPException(status_code=503, detail="database unavailable") from exc
    raise HTTPException(status_code=503, detail="database unavailable")

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Content-Type"],
)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=TRUSTED_HOSTS)
app.add_middleware(BrowserCSRFMiddleware)

app.include_router(songs.router)
app.include_router(comments.router)
app.include_router(perceived.router)
app.include_router(feedback.router)
app.include_router(records.router)
app.include_router(parse_screenshot.router)
app.include_router(auth_oauth.router)
app.include_router(users.router)
app.include_router(rankings.router)
app.include_router(groups.router)
app.include_router(personal_categories.router)
app.include_router(feedback_items.router)
app.include_router(pmang_songs.router)
app.include_router(pmang_user.router)
app.include_router(xyx_songs.router)
app.include_router(xyx_categories.router)
app.include_router(xyx_detail.router)
app.include_router(youtube_candidates.router)
app.include_router(analytics.router)
app.include_router(practice_sections.router)

if STATIC_DIR.exists():
    app.mount("/static/rnr_image", StaticFiles(directory=str(STATIC_DIR)), name="rnr_image")
if XYX_STATIC_DIR.exists():
    app.mount("/static/xyx/rnr_image", StaticFiles(directory=str(XYX_STATIC_DIR)), name="xyx_rnr_image")
if PMANG_STATIC_DIR.exists():
    app.mount("/static/pmang_image", StaticFiles(directory=str(PMANG_STATIC_DIR)), name="pmang_image")
