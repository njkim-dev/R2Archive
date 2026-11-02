from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse, JSONResponse, Response
from io import BytesIO
from pydantic import BaseModel, Field, ConfigDict

from auth import require_admin, get_current_user_id
from rate_limit import limiter, user_key
from routers.shop import favorite_user
import shop_image_history as history
from work_capacity import WorkCapacity, run_blocking


router = APIRouter(prefix='/api/shop/image-search/history', tags=['shop'], dependencies=[Depends(favorite_user)])
admin_router = APIRouter(prefix='/api/shop/image-search/admin', tags=['admin'], dependencies=[Depends(require_admin)])
public_router = APIRouter(prefix='/api/shop/image-search/shared', tags=['shop'])
PRIVATE = {'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow'}
review_capacity = WorkCapacity(1)


class Vote(BaseModel):
    model_config = ConfigDict(extra='forbid')
    slot: Literal['hair','top','bottom','shoes']
    item_id: str = Field(pattern=r'^[1-9][0-9]{0,17}$')
    value: int = Field(ge=-1, le=1, strict=True)


class Action(BaseModel):
    model_config = ConfigDict(extra='forbid')
    action: Literal['select','deselect','preview','favorite']
    item_ids: list[Annotated[str, Field(pattern=r'^[1-9][0-9]{0,17}$')]] = Field(min_length=1,max_length=4)


class Label(BaseModel):
    model_config = ConfigDict(extra='forbid')
    item_id: str = Field(pattern=r'^[1-9][0-9]{0,17}$')
    region: dict | None = None


class Publish(BaseModel):
    model_config = ConfigDict(extra='forbid')
    selected_ids: list[Annotated[str, Field(pattern=r'^[1-9][0-9]{0,17}$')]] = Field(default_factory=list,max_length=4)


@router.post('/{search_id}/share')
@limiter.limit('30/minute', key_func=user_key)
def publish(request: Request, search_id: UUID, body: Publish, uid: int = Depends(favorite_user)):
    return JSONResponse(history.publish(search_id,uid,body.selected_ids),headers=PRIVATE)


@public_router.get('/{token}')
@limiter.limit('120/minute')
def shared(request: Request, token: str):
    return JSONResponse(history.shared(token,get_current_user_id(request)),headers=PRIVATE)


@public_router.get('/{token}/image')
@limiter.limit('120/minute')
def shared_image(request: Request, token: str):
    path,media_type = history.shared_image_path(token)
    return FileResponse(path,media_type=media_type,headers=PRIVATE)


class Review(BaseModel):
    model_config = ConfigDict(extra='forbid')
    decision: Literal['approved','excluded']
    expected_version: int = Field(ge=0,strict=True)
    labels: dict[str,Label] = Field(default_factory=dict,max_length=4)
    notes: str = Field(default='',max_length=2000)


@router.put('/{search_id}/votes')
@limiter.limit('120/minute', key_func=user_key)
def vote(request: Request, search_id: UUID, body: Vote, uid: int = Depends(favorite_user)):
    return JSONResponse(history.vote(search_id,uid,body.slot,body.item_id,body.value),headers=PRIVATE)


@router.post('/{search_id}/actions')
@limiter.limit('120/minute', key_func=user_key)
def action(request: Request, search_id: UUID, body: Action, uid: int = Depends(favorite_user)):
    if any(not item.isascii() or not item.isdigit() or not 0<int(item)<10**18 for item in body.item_ids):
        raise HTTPException(422, '아이템 번호가 올바르지 않습니다.')
    return JSONResponse(history.action(search_id,uid,body.action,list(dict.fromkeys(body.item_ids))),headers=PRIVATE)


@admin_router.get('/history')
def listing(status: Literal['','pending','approved','excluded'] = '', sex: Literal['','male','female'] = '',
            slot: Literal['','all','hair','top','bottom','shoes'] = '', vote: Literal['','like','dislike'] = '',
            before: UUID | None = None, limit: int = Query(24,ge=1,le=60)):
    return JSONResponse(history.listing(status,sex,slot,vote,before,limit),headers=PRIVATE)


@admin_router.get('/history/{search_id}')
def detail(search_id: UUID):
    return JSONResponse(history.detail(search_id),headers=PRIVATE)


@admin_router.get('/history/{search_id}/image')
def image(search_id: UUID, thumbnail: bool = False):
    path,media_type = history.image_path(search_id)
    if thumbnail:
        from shop_image_search import decode_image
        with decode_image(path.read_bytes()) as source:
            source.thumbnail((240,360))
            stream = BytesIO()
            source.save(stream,format='WEBP',quality=75)
        return Response(stream.getvalue(),media_type='image/webp',headers=PRIVATE)
    return FileResponse(path,media_type=media_type,headers=PRIVATE)


@admin_router.put('/history/{search_id}/review')
async def review(search_id: UUID, body: Review, admin: dict = Depends(require_admin)):
    with review_capacity.enter(admin['id']):
        result = await run_blocking(history.review,search_id,admin['id'],body.decision,body.expected_version,
                                    {slot:label.model_dump() for slot,label in body.labels.items()},body.notes)
    return JSONResponse(result,headers=PRIVATE)


@admin_router.delete('/history/{search_id}')
def delete(search_id: UUID):
    return JSONResponse(history.delete(search_id),headers=PRIVATE)
