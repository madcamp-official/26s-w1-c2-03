from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from deps import require_admin, require_supabase, safe_execute

router = APIRouter()

# ---------------------------------------------------------------------
# 카테고리 / 키워드 선택지 (관리자 페이지에서 추가 — 매장 등록/뱃지 조건 폼에서 선택지로 사용)
# ---------------------------------------------------------------------


class OptionCreate(BaseModel):
    name: str


@router.get("/categories")
def get_categories():
    db = require_supabase()
    result = safe_execute(db.table("category_options").select("*").order("name"), "카테고리 목록 조회 실패")
    return result.data


@router.post("/admin/categories", dependencies=[Depends(require_admin)])
def create_category(payload: OptionCreate):
    db = require_supabase()
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="카테고리 이름을 입력해주세요.")
    result = safe_execute(db.table("category_options").insert({"name": name}), "카테고리 추가 실패 (이미 있는 이름인지 확인)")
    return result.data[0]


@router.delete("/admin/categories/{category_id}", dependencies=[Depends(require_admin)])
def delete_category(category_id: str):
    db = require_supabase()
    result = safe_execute(db.table("category_options").delete().eq("id", category_id), "카테고리 삭제 실패")
    if not result.data:
        raise HTTPException(status_code=404, detail="카테고리를 찾을 수 없습니다.")
    return {"deleted": True}


@router.get("/keywords")
def get_keywords():
    db = require_supabase()
    result = safe_execute(db.table("keyword_options").select("*").order("name"), "키워드 목록 조회 실패")
    return result.data


@router.post("/admin/keywords", dependencies=[Depends(require_admin)])
def create_keyword(payload: OptionCreate):
    db = require_supabase()
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="키워드 이름을 입력해주세요.")
    result = safe_execute(db.table("keyword_options").insert({"name": name}), "키워드 추가 실패 (이미 있는 이름인지 확인)")
    return result.data[0]


@router.delete("/admin/keywords/{keyword_id}", dependencies=[Depends(require_admin)])
def delete_keyword(keyword_id: str):
    db = require_supabase()
    result = safe_execute(db.table("keyword_options").delete().eq("id", keyword_id), "키워드 삭제 실패")
    if not result.data:
        raise HTTPException(status_code=404, detail="키워드를 찾을 수 없습니다.")
    return {"deleted": True}
