from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class BpmPoint(BaseModel):
    time: float   # seconds
    bpm: float


class SongListItem(BaseModel):
    id: int
    name: str
    artist: str
    level: float
    bpm: float
    combo: int
    time: str
    youtube_url: str
    is_new: bool
    file_order: int
    play_count: int
    is_change: bool
    image: Optional[str] = None
    user_level_avg: Optional[float] = None
    user_level_votes: int = 0
    aliases: list[str] = []


class SongDetail(BaseModel):
    id: int
    name: str
    artist: str
    level: float
    bpm: float
    combo: int
    time: str
    youtube_url: str
    is_new: bool
    play_count: int
    play_count_week: int
    is_change: bool
    image: Optional[str] = None
    bpm_timeline: list[BpmPoint]


class MetaResponse(BaseModel):
    total_count: int
    new_count: int
    played_count: int
    change_count: int
    top_artists: list[str]
    bpm_min: int
    bpm_max: int
    level_min: float
    level_max: float


class PlayLogCreate(BaseModel):
    session_id: str = Field(min_length=8, max_length=64)


class CommentCreate(BaseModel):
    nickname: Optional[str] = Field(default=None, max_length=30)   # Null값을 받으면 서버에서 자동 부여
    content: str = Field(min_length=1, max_length=1000)
    perceived_level: Optional[float] = Field(default=None, ge=0.5, le=12.0)


class CommentResponse(BaseModel):
    id: int
    nickname: str
    content: str
    created_at: datetime
    perceived_level: Optional[float] = None


class PerceivedCreate(BaseModel):
    anon_id: str = Field(min_length=8, max_length=64)
    level: float = Field(ge=0.5, le=12.0)
    opinion: Optional[str] = Field(default=None, max_length=500)


class PerceivedUpdate(BaseModel):
    anon_id: str = Field(min_length=8, max_length=64)
    level: float = Field(ge=0.5, le=12.0)
    opinion: Optional[str] = Field(default=None, max_length=500)


class PerceivedDelete(BaseModel):
    anon_id: str = Field(min_length=8, max_length=64)


class PerceivedStats(BaseModel):
    avg: Optional[float]
    total_votes: int
    bins: list[int]             # 24 bins: 0.5 ~ 12.0 step 0.5
    my_vote: Optional[dict]     # {"level": float, "opinion": str|null}


class FeedbackCreate(BaseModel):
    anon_id: str = Field(min_length=8, max_length=64)
    type: str = Field(max_length=30)   # bpm | combo | time | record_delete | comment_delete
    body: str = Field(min_length=1, max_length=2000)


class RecordCreate(BaseModel):
    # 기존 YouTube URL 기반 등록과, 스크린샷 판정 기반 등록이 같은 테이블을 공유.
    anon_id: Optional[str] = Field(default=None, max_length=64)
    nickname: str = Field(min_length=1, max_length=30)
    score: Optional[int] = Field(default=None, ge=0, le=99_999_999)
    judgment_percent: Optional[float] = Field(default=None, ge=0, le=99.0)
    combo: Optional[int] = Field(default=None, ge=0, le=999_999)
    youtube_url: Optional[str] = Field(default=None, max_length=300)
    memo: Optional[str] = Field(default=None, max_length=500)
    memo_public: bool = False
    # 개인 성과는 서버에 공개 여부를 요청에 담지 않음 -> 서버가 유저의 default_visibility를 사용하고 수신만 허용.
    visibility: Optional[str] = Field(default=None, pattern=r"^(public|anonymous|private)$")


class RecordResponse(BaseModel):
    id: int
    nickname: str
    score: Optional[int]
    judgment_percent: Optional[float] = None
    combo: Optional[int]
    youtube_url: Optional[str]
    youtube_title: Optional[str]
    memo: Optional[str]
    memo_public: bool = False
    visibility: str = "public"
    is_mine: bool = False
    # 스크린샷이 업로드되어 있고 소유자가 공개(show_screenshot=true)한 경우에만 채워짐.
    screenshot_url: Optional[str] = None
    # 소유자가 스크린샷/미디어 공유를 허용했는지 (버튼 노출 판단용)
    owner_show_screenshot: bool = False
    created_at: datetime
