import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from deps import CHECKIN_BUCKET, get_current_user_id, is_admin_user, require_supabase, safe_execute, validate_image_bytes

router = APIRouter()

# ---------------------------------------------------------------------
# 체크인 (사진 인증)
# ---------------------------------------------------------------------


@router.get("/checkins", dependencies=[Depends(get_current_user_id)])
def get_checkins(store_id: Optional[str] = None, user_id: Optional[str] = None, status: Optional[str] = None):
    db = require_supabase()
    # users(nickname): 사장님 화면에서 "누가 보냈는지" / stores(...): 마이페이지 방문 기록에 매장 정보 같이 보여줄 때 사용
    query = db.table("checkins").select(
        "*, users(nickname), stores(id, name, categories, keywords, address, lat, lng, image_url)"
    )
    if store_id:
        query = query.eq("store_id", store_id)
    if user_id:
        query = query.eq("user_id", user_id)
    if status:
        query = query.eq("status", status)
    result = query.order("created_at", desc=True).execute()
    return result.data


CHECKIN_COOLDOWN_HOURS = 24  # 같은 매장은 하루에 한 번만 체크인 가능 — 스탬프 어뷰징 방지


@router.post("/checkins")
async def create_checkin(
    store_id: str = Form(...),
    purpose: Optional[str] = Form(None),
    photo_consent: bool = Form(False),
    file: UploadFile = File(...),
    current_user_id: str = Depends(get_current_user_id),
):
    # 체크인 주체는 폼으로 받는 값이 아니라 세션 토큰의 유저로 고정 — 남의 user_id로 체크인을 남기지 못하게 함
    db = require_supabase()

    # 같은 매장에 심사 대기 중인 체크인이 있거나, 이미 승인받은 지 얼마 안 됐으면 새로 못 남기게 막음
    # (사장님 큐에 같은 체크인을 여러 번 올리거나, 하루에 여러 번 승인받아 스탬프를 부풀리는 걸 방지)
    recent = safe_execute(
        db.table("checkins")
        .select("status, created_at")
        .eq("user_id", current_user_id)
        .eq("store_id", store_id)
        .in_("status", ["pending", "approved"])
        .order("created_at", desc=True)
        .limit(1),
        "체크인 중복 확인 실패",
    )
    if recent.data:
        last = recent.data[0]
        if last["status"] == "pending":
            raise HTTPException(status_code=409, detail="이미 심사 대기 중인 체크인이 있어요. 사장님 확인을 기다려주세요.")
        last_at = datetime.fromisoformat(last["created_at"])
        if datetime.now(timezone.utc) - last_at < timedelta(hours=CHECKIN_COOLDOWN_HOURS):
            raise HTTPException(status_code=409, detail="이 매장은 하루에 한 번만 체크인할 수 있어요.")

    contents = await file.read()
    validate_image_bytes(contents)
    extension = (file.filename or "jpg").split(".")[-1]
    storage_path = f"{current_user_id}/{uuid.uuid4()}.{extension}"

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
        "user_id": current_user_id,
        "store_id": store_id,
        "photo_url": photo_url,
        "purpose": purpose,
        "status": "pending",
        "photo_consent": photo_consent,
    }
    result = db.table("checkins").insert(row).execute()
    return result.data[0]


MAX_STAMP_COUNT = 3  # 사장님이 체크인 1건 승인할 때 한 번에 줄 수 있는 스탬프 개수 상한 (티어 인플레 방지)


class CheckinReview(BaseModel):
    status: str  # 'approved' | 'rejected'
    stamp_count: int = 1  # 수락할 때만 의미 있음 — 사장님이 +/-로 정한 스탬프 개수 (기본 1, 최대 3)


@router.patch("/checkins/{checkin_id}")
def review_checkin(checkin_id: str, payload: CheckinReview, current_user_id: str = Depends(get_current_user_id)):
    if payload.status not in ("approved", "rejected"):
        raise HTTPException(status_code=422, detail="status는 approved 또는 rejected 여야 합니다.")
    if not (1 <= payload.stamp_count <= MAX_STAMP_COUNT):
        raise HTTPException(status_code=422, detail=f"스탬프 개수는 1~{MAX_STAMP_COUNT}개 사이여야 합니다.")

    db = require_supabase()

    # 이 체크인이 걸린 매장의 실제 사장님(owner_id)만 승인/거절할 수 있음 — 아니면 손님이 자기 체크인을
    # 직접 승인해 스탬프를 무제한으로 채울 수 있었던 구멍이 그대로 남음
    checkin = safe_execute(
        db.table("checkins").select("store_id, stores(owner_id)").eq("id", checkin_id), "체크인 조회 실패"
    )
    if not checkin.data:
        raise HTTPException(status_code=404, detail="체크인을 찾을 수 없습니다.")
    owner_id = (checkin.data[0].get("stores") or {}).get("owner_id")
    # 관리자 로그인은 테스트 편의를 위해 매장 등록 여부와 무관하게 모든 체크인을 승인/거절할 수 있음
    if owner_id != current_user_id and not is_admin_user(current_user_id):
        raise HTTPException(status_code=403, detail="이 매장의 사장님만 체크인을 승인/거절할 수 있어요.")

    update_row = {"status": payload.status, "reviewed_at": "now()"}
    if payload.status == "approved":
        update_row["stamp_count"] = payload.stamp_count

    result = (
        db.table("checkins")
        .update(update_row)
        .eq("id", checkin_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="체크인을 찾을 수 없습니다.")
    return result.data[0]
