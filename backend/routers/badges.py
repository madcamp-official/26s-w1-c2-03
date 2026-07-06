import json
import uuid
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from deps import BADGE_BUCKET, require_supabase, safe_execute

router = APIRouter()

# ---------------------------------------------------------------------
# 뱃지 (관리자 페이지에서 생성 — 조건 = (키워드|카테고리) x 방문수, 뱃지 하나에 여러 조건 AND)
# ---------------------------------------------------------------------


@router.get("/badges")
def get_badges():
    db = require_supabase()
    result = safe_execute(db.table("badges").select("*, badge_conditions(*)"), "뱃지 목록 조회 실패")
    return result.data


@router.post("/admin/badges")
async def create_badge(
    name: str = Form(...),
    description: Optional[str] = Form(None),
    emoji: Optional[str] = Form(None),
    conditions: str = Form(...),  # JSON 문자열: [{"type":"keyword","value":"조용한","min_count":5}, ...]
    image: Optional[UploadFile] = File(None),
):
    db = require_supabase()

    try:
        condition_list = json.loads(conditions)
    except (json.JSONDecodeError, TypeError):
        raise HTTPException(status_code=422, detail="conditions는 JSON 배열이어야 합니다.")
    if not condition_list:
        raise HTTPException(status_code=422, detail="조건을 최소 1개 이상 입력해주세요.")

    image_url = None
    if image is not None:
        contents = await image.read()
        extension = (image.filename or "png").split(".")[-1]
        storage_path = f"{uuid.uuid4()}.{extension}"
        try:
            db.storage.from_(BADGE_BUCKET).upload(
                storage_path, contents, {"content-type": image.content_type or "image/png"}
            )
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"뱃지 이미지 업로드 실패: {e}")
        public_url_result = db.storage.from_(BADGE_BUCKET).get_public_url(storage_path)
        image_url = (
            public_url_result
            if isinstance(public_url_result, str)
            else public_url_result.get("publicUrl") or public_url_result.get("public_url")
        )

    badge_result = safe_execute(
        db.table("badges").insert(
            {"name": name, "description": description, "emoji": emoji, "image_url": image_url}
        ),
        "뱃지 생성 실패",
    )
    badge = badge_result.data[0]

    condition_rows = []
    for c in condition_list:
        c_type = c.get("type")
        c_value = c.get("value")
        c_min = c.get("min_count")
        if c_type not in ("keyword", "category") or not c_value or not c_min:
            raise HTTPException(
                status_code=422, detail="조건은 type(keyword|category), value, min_count가 모두 필요해요."
            )
        option_table = "keyword_options" if c_type == "keyword" else "category_options"
        existing_option = safe_execute(
            db.table(option_table).select("id").eq("name", c_value), "선택지 확인 실패"
        )
        if not existing_option.data:
            raise HTTPException(status_code=422, detail=f"등록되지 않은 선택지예요: {c_value}")
        condition_rows.append(
            {"badge_id": badge["id"], "condition_type": c_type, "condition_value": c_value, "min_count": int(c_min)}
        )

    cond_result = safe_execute(db.table("badge_conditions").insert(condition_rows), "뱃지 조건 생성 실패")

    badge["badge_conditions"] = cond_result.data
    return badge


def _compute_earned_badges(db, user_id: str):
    # 유저의 "수락된" 체크인을 매장 정보(키워드·카테고리)와 함께 가져와 방문 횟수를 센 다음,
    # 각 뱃지가 가진 조건을 전부(AND) 만족하는지 확인한다.
    checkins_result = safe_execute(
        db.table("checkins")
        .select("*, stores(categories, keywords)")
        .eq("user_id", user_id)
        .eq("status", "approved"),
        "체크인 조회 실패",
    )

    keyword_counts: dict[str, int] = {}
    category_counts: dict[str, int] = {}
    for c in checkins_result.data:
        store = c.get("stores") or {}
        for kw in store.get("keywords") or []:
            keyword_counts[kw] = keyword_counts.get(kw, 0) + 1
        for category in store.get("categories") or []:
            category_counts[category] = category_counts.get(category, 0) + 1

    badges_result = safe_execute(db.table("badges").select("*, badge_conditions(*)"), "뱃지 목록 조회 실패")

    earned_badges = []
    for badge in badges_result.data:
        conditions = badge.get("badge_conditions") or []
        if not conditions:
            continue
        all_met = True
        for cond in conditions:
            counts = keyword_counts if cond["condition_type"] == "keyword" else category_counts
            if counts.get(cond["condition_value"], 0) < cond["min_count"]:
                all_met = False
                break
        earned_badges.append({**badge, "earned": all_met})

    return earned_badges


@router.get("/users/{user_id}/badges")
def get_user_badges(user_id: str):
    db = require_supabase()
    return _compute_earned_badges(db, user_id)


@router.delete("/admin/badges/{badge_id}")
def delete_badge(badge_id: str):
    db = require_supabase()
    # badge_conditions는 on delete cascade라 badges만 지우면 조건도 같이 삭제됨
    result = safe_execute(db.table("badges").delete().eq("id", badge_id), "뱃지 삭제 실패")
    if not result.data:
        raise HTTPException(status_code=404, detail="뱃지를 찾을 수 없습니다.")
    return {"deleted": True}
