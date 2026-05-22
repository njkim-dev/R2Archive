import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
from pathlib import Path
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi import _rate_limit_exceeded_handler

from database import init_pool
from rate_limit import limiter
from routers import songs, comments, perceived, feedback, records, auth_oauth, users, parse_screenshot, rankings, groups, personal_categories, feedback_items, pmang_songs, pmang_user, youtube_candidates

STATIC_DIR = Path(__file__).parent.parent / "rnr_image"
PMANG_STATIC_DIR = Path(__file__).parent.parent / "pmang_image"

_default_origins = "http://localhost:5173,http://localhost:3000"
CORS_ORIGINS = [o.strip() for o in os.environ.get("CORS_ORIGINS", _default_origins).split(",")]


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_pool()
    yield


app = FastAPI(title="R2Beat Archive API", lifespan=lifespan)

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
app.include_router(youtube_candidates.router)

if STATIC_DIR.exists():
    app.mount("/static/rnr_image", StaticFiles(directory=str(STATIC_DIR)), name="rnr_image")
if PMANG_STATIC_DIR.exists():
    app.mount("/static/pmang_image", StaticFiles(directory=str(PMANG_STATIC_DIR)), name="pmang_image")