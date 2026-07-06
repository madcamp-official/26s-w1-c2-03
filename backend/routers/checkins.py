import uuid
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from deps import CHECKIN_BUCKET, require_supabase

router = APIRouter()

# ---------------------------------------------------------------------
# 체크인 (사진 인증)
# ---------------------------------------------------------------------


@router.get("/checkins")
def get_checkins(store_id: Optional[str] = None, user_id: Optional[str] = None, status: Optional[str] = None):
    db = require_supabase()
    # users(nickname): 사장님 화면에서 "누가 보냈는지" / stores(...): 마이페이지 방문 기록에 매장 정보 같이 보여줄 때 사용
    query = db.table("checkins").select(
        "*, users(nickname), stores(id, name, categories, keywords, address, lat, lng)"
    )
    if store_id:
        query = query.eq("store_id", store_id)
    if user_id:
        query = query.eq("user_id", user_id)
    if status:
        query = query.eq("status", status)
    result = query.order("created_at", desc=True).execute()
    return result.data


@router.post("/checkins")
async def create_checkin(
    user_id: str = Form(...),
    store_id: str = Form(...),
    purpose: Optional[str] = Form(None),
    photo_consent: bool = Form(False),
    file: UploadFile = File(...),
):
    db = require_supabase()

    contents = await file.read()
    extension = (file.filename or "jpg").split(".")[-1]
    storage_path = f"{user_id}/{uuid.uuid4()}.{extension}"

    try:
        db.storage.from_(CHECKIN_BUCKET).upload(
            storage_path,
            contents,
            {"content-type": file.content_type or "image/jpeg"},
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"사진 업로드 실패: {e}")

    public_url_result = db.storage.from_(CHECKIN_BUCKET).get_public_url(storage_path)
    photo_url = (
        public_url_result
        if isinstance(public_url_result, str)
        else public_url_result.get("publicUrl") or public_url_result.get("public_url")
    )

    row = {
        "user_id": user_id,
        "store_id": store_id,
        "photo_url": photo_url,
        "purpose": purpose,
        "status": "pending",
        "photo_consent": photo_consent,
    }
    result = db.table("checkins").insert(row).execute()
    return result.data[0]


class CheckinReview(BaseModel):
    status: str  # 'approved' | 'rejected'


@router.patch("/checkins/{checkin_id}")
def review_checkin(checkin_id: str, payload: CheckinReview):
    if payload.status not in ("approved", "rejected"):
        raise HTTPException(status_code=422, detail="status는 approved 또는 rejected 여야 합니다.")

    db = require_supabase()
    result = (
        db.table("checkins")
        .update({"status": payload.status, "reviewed_at": "now()"})
        .eq("id", checkin_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="체크인을 찾을 수 없습니다.")
    return result.data[0]
