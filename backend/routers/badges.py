import json
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from deps import BADGE_BUCKET, require_admin, require_supabase, safe_execute

router = APIRouter()

# ---------------------------------------------------------------------
# 뱃지 (관리자 페이지에서 생성 — 조건 = (키워드|카테고리) x 방문수, 뱃지 하나에 여러 조건 AND)
# ---------------------------------------------------------------------


@router.get("/badges")
def get_badges():
    db = require_supabase()
    result = safe_execute(db.table("badges").select("*, badge_conditions(*)"), "뱃지 목록 조회 실패")
    return result.data


@router.post("/admin/badges", dependencies=[Depends(require_admin)])
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

    # 뱃지 행을 만들기 전에 조건을 전부 검증 — supabase 쓰기가 트랜잭션으로 안 묶여 있어서, 뱃지부터
    # 만들고 조건 검증을 나중에 하면 조건이 잘못됐을 때 조건 없는 고아 뱃지가 그대로 남는 문제가 있었음.
    # 카테고리 성취는 /users/{user_id}/category-tiers의 자동 티어 뱃지로만 나타냄 —
    # 관리자가 만드는 일회성 뱃지는 키워드 조건만 허용해 두 체계가 섞이지 않게 한다.
    validated_conditions = []
    for c in condition_list:
        c_type = c.get("type")
        c_value = c.get("value")
        c_min = c.get("min_count")
        if c_type != "keyword" or not c_value or not c_min:
            raise HTTPException(
                status_code=422,
                detail="조건은 type(keyword), value, min_count가 모두 필요해요. 카테고리 성취는 티어 뱃지로 자동 표시돼요.",
            )
        existing_option = safe_execute(
            db.table("keyword_options").select("id").eq("name", c_value), "선택지 확인 실패"
        )
        if not existing_option.data:
            raise HTTPException(status_code=422, detail=f"등록되지 않은 선택지예요: {c_value}")
        validated_conditions.append({"condition_type": c_type, "condition_value": c_value, "min_count": int(c_min)})

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

    condition_rows = [{**c, "badge_id": badge["id"]} for c in validated_conditions]
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


@router.delete("/admin/badges/{badge_id}", dependencies=[Depends(require_admin)])
def delete_badge(badge_id: str):
    db = require_supabase()
    # badge_conditions는 on delete cascade라 badges만 지우면 조건도 같이 삭제됨
    result = safe_execute(db.table("badges").delete().eq("id", badge_id), "뱃지 삭제 실패")
    if not result.data:
        raise HTTPException(status_code=404, detail="뱃지를 찾을 수 없습니다.")
    return {"deleted": True}


# ---------------------------------------------------------------------
# 스탬프 티어 (매장이 아니라 카테고리 단위 — 한식 브론즈, 일식 실버 같은 식)
# 브론즈~다이아몬드는 해당 카테고리 누적 스탬프 개수 기준, 챌린저는 그중 카테고리 내 상위 10명
# ---------------------------------------------------------------------

CATEGORY_TIER_THRESHOLDS = [
    ("diamond", 25),
    ("platinum", 15),
    ("gold", 10),
    ("silver", 5),
    ("bronze", 1),
]


def _tier_for(total: int, is_top10: bool) -> Optional[str]:
    if total >= 25 and is_top10:
        return "challenger"
    for tier, threshold in CATEGORY_TIER_THRESHOLDS:
        if total >= threshold:
            return tier
    return None


def _fetch_approved_checkins_with_categories(db):
    return safe_execute(
        db.table("checkins")
        .select("user_id, stamp_count, users(nickname, profile_image_url), stores(categories)")
        .eq("status", "approved"),
        "체크인 조회 실패",
    ).data


def _category_totals(checkins):
    """체크인 목록 → {카테고리: {user_id: 누적 스탬프}} (매장이 여러 카테고리면 각 카테고리에 모두 반영)"""
    totals: dict[str, dict[str, int]] = {}
    for c in checkins:
        store = c.get("stores") or {}
        stamps = c.get("stamp_count") or 1
        uid = c["user_id"]
        for category in store.get("categories") or []:
            totals.setdefault(category, {})
            totals[category][uid] = totals[category].get(uid, 0) + stamps
    return totals


@router.get("/leaderboard/stamps")
def get_stamp_leaderboard(category: str, limit: int = 10):
    """
    카테고리별 누적 스탬프 순위표.
    프론트가 이 목록에 내 user_id가 있는지로 "챌린저" 자격(카테고리 내 상위 N명)을 판단함.
    """
    db = require_supabase()
    checkins = _fetch_approved_checkins_with_categories(db)

    info: dict[str, dict] = {}
    for c in checkins:
        u = c.get("users") or {}
        info[c["user_id"]] = {"nickname": u.get("nickname"), "profile_image_url": u.get("profile_image_url")}

    totals = _category_totals(checkins).get(category, {})
    ranking = sorted(totals.items(), key=lambda kv: kv[1], reverse=True)[: max(1, min(limit, 100))]
    return [
        {
            "user_id": uid,
            "nickname": info.get(uid, {}).get("nickname"),
            "profile_image_url": info.get(uid, {}).get("profile_image_url"),
            "total_stamps": total,
        }
        for uid, total in ranking
    ]


@router.get("/users/{user_id}/category-tiers")
def get_user_category_tiers(user_id: str):
    """
    전체 카테고리 목록 기준 티어 (예: 한식 브론즈, 일식 실버).
    아직 브론즈(1개)도 못 채운 카테고리는 tier: null로 내려가고, 프론트는 이를 잠긴 브론즈 뱃지로 흐리게 표시한다.
    """
    db = require_supabase()
    all_categories = safe_execute(db.table("category_options").select("name"), "카테고리 목록 조회 실패")
    totals_by_category = _category_totals(_fetch_approved_checkins_with_categories(db))

    tiers = []
    for row in all_categories.data:
        category = row["name"]
        totals = totals_by_category.get(category, {})
        total = totals.get(user_id, 0)
        tier = None
        if total > 0:
            top10_ids = {uid for uid, _ in sorted(totals.items(), key=lambda kv: kv[1], reverse=True)[:10]}
            tier = _tier_for(total, user_id in top10_ids)
        tiers.append({"category": category, "total_stamps": total, "tier": tier})

    tiers.sort(key=lambda t: t["total_stamps"], reverse=True)
    return tiers
