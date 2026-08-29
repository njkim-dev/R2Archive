from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class BpmPoint(BaseModel):
    time: float
    bpm: float


class SongServerCounterpart(BaseModel):
    server: str
    id: int
    name: str
    artist: str = ""
    is_removed: bool = False


class SongListItem(BaseModel):
    id: int
    name: str
    korea_name: str = ""
    xyx_name: str = ""
    artist: str
    level: float
    bpm: float
    real_bpm: Optional[float] = None
    combo: int
    combo_warning: bool = False
    time: str
    youtube_url: str
    is_new: bool
    file_order: int
    play_count: int
    favorite_count: int = 0
    is_change: bool
    image: Optional[str] = None
    user_level_avg: Optional[float] = None
    user_level_votes: int = 0
    aliases: list[str] = []
    artist_aliases: list[str] = []
    same_music_group_id: Optional[int] = None


class SongDetail(BaseModel):
    id: int
    name: str
    korea_name: str = ""
    xyx_name: str = ""
    artist: str
    level: float
    bpm: float
    real_bpm: Optional[float] = None
    combo: int
    combo_warning: bool = False
    time: str
    youtube_url: str
    is_new: bool
    play_count: int
    play_count_week: int
    is_change: bool
    image: Optional[str] = None
    bpm_timeline: list[BpmPoint]
    counterpart: Optional[SongServerCounterpart] = None


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
    nickname: Optional[str] = Field(default=None, max_length=30)
    content: str = Field(min_length=1, max_length=1000)
    perceived_level: Optional[float] = Field(default=None, ge=0.5, le=12.0)


class CommentResponse(BaseModel):
    id: int
    nickname: str
    content: str
    created_at: datetime
    perceived_level: Optional[float] = None


class PerceivedCreate(BaseModel):
    anon_id: Optional[str] = Field(default=None, min_length=8, max_length=64)
    level: float = Field(ge=0.5, le=12.0)
    opinion: Optional[str] = Field(default=None, max_length=500)


class PerceivedUpdate(BaseModel):
    anon_id: Optional[str] = Field(default=None, min_length=8, max_length=64)
    level: float = Field(ge=0.5, le=12.0)
    opinion: Optional[str] = Field(default=None, max_length=500)


class PerceivedDelete(BaseModel):
    anon_id: Optional[str] = Field(default=None, min_length=8, max_length=64)


class PerceivedStats(BaseModel):
    avg: Optional[float]
    total_votes: int
    bins: list[int]
    my_vote: Optional[dict]


class FeedbackCreate(BaseModel):
    anon_id: str = Field(min_length=8, max_length=64)
    type: str = Field(max_length=30)
    body: str = Field(min_length=1, max_length=2000)


class RecordCreate(BaseModel):
    anon_id: Optional[str] = Field(default=None, max_length=64)
    nickname: str = Field(min_length=1, max_length=30)
    score: Optional[int] = Field(default=None, ge=0, le=99_999_999)
    judgment_percent: Optional[float] = Field(default=None, ge=0, le=99.0)
    combo: Optional[int] = Field(default=None, ge=0, le=999_999)
    youtube_url: Optional[str] = Field(default=None, max_length=300)
    memo: Optional[str] = Field(default=None, max_length=500)
    memo_public: bool = False
    visibility: Optional[str] = Field(default=None, pattern=r"^(public|group|private)$")
    register_as_play_video: bool = False


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
    is_manual: bool = False
    screenshot_url: Optional[str] = None
    owner_show_screenshot: bool = False
    created_at: datetime


class ManualRecordEntry(BaseModel):
    song_id: int = Field(ge=1)
    judgment_percent: Optional[float] = Field(default=None, ge=0.0, le=99.0)
    youtube_url: Optional[str] = Field(default=None, max_length=300)


class ManualRecordsBulk(BaseModel):
    entries: list[ManualRecordEntry] = Field(default_factory=list, max_length=2000)
