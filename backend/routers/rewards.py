from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from deps import require_supabase, safe_execute

router = APIRouter()

# ---------------------------------------------------------------------
# 리워드 (사장님이 설정한 스탬프 개수 달성형 혜택 — 메뉴/굿즈 x 무료·증정/할인)
# ---------------------------------------------------------------------


class RewardCreate(BaseModel):
    stamp_threshold: int
    target_type: str  # 'menu' | 'goods'
    target_name: str
    reward_kind: str  # 'free' | 'discount'
    discount_percent: Optional[int] = None


@router.get("/stores/{store_id}/rewards")
def get_store_rewards(store_id: str):
    db = require_supabase()
    result = safe_execute(
        db.table("rewards").select("*").eq("store_id", store_id).order("stamp_threshold"),
        "리워드 목록 조회 실패",
    )
    return result.data


@router.post("/stores/{store_id}/rewards")
def create_reward(store_id: str, payload: RewardCreate):
    if payload.target_type not in ("menu", "goods"):
        raise HTTPException(status_code=422, detail="target_type은 menu 또는 goods여야 합니다.")
    if payload.reward_kind not in ("free", "discount"):
        raise HTTPException(status_code=422, detail="reward_kind는 free 또는 discount여야 합니다.")
    if payload.stamp_threshold < 1:
        raise HTTPException(status_code=422, detail="스탬프 개수는 1개 이상이어야 합니다.")
    if not payload.target_name.strip():
        raise HTTPException(status_code=422, detail="메뉴/굿즈 이름을 입력해주세요.")
    if payload.reward_kind == "discount" and not payload.discount_percent:
        raise HTTPException(status_code=422, detail="할인율을 입력해주세요.")

    db = require_supabase()
    row = {
        "store_id": store_id,
        "stamp_threshold": payload.stamp_threshold,
        "target_type": payload.target_type,
        "target_name": payload.target_name.strip(),
        "reward_kind": payload.reward_kind,
        "discount_percent": payload.discount_percent if payload.reward_kind == "discount" else None,
    }
    result = safe_execute(db.table("rewards").insert(row), "리워드 생성 실패")
    return result.data[0]


@router.delete("/rewards/{reward_id}")
def delete_reward(reward_id: str):
    db = require_supabase()
    result = safe_execute(db.table("rewards").delete().eq("id", reward_id), "리워드 삭제 실패")
    if not result.data:
        raise HTTPException(status_code=404, detail="리워드를 찾을 수 없습니다.")
    return {"deleted": True}


@router.get("/users/{user_id}/reward-claims")
def get_user_reward_claims(user_id: str):
    # 사장님 인증 수락 화면에서, 이 유저에게 어떤 리워드를 이미 줬는지 확인할 때 사용
    db = require_supabase()
    result = safe_execute(
        db.table("user_rewards").select("reward_id").eq("user_id", user_id), "지급 기록 조회 실패"
    )
    return [r["reward_id"] for r in result.data]


@router.get("/users/{user_id}/available-rewards")
def get_available_rewards(user_id: str):
    """
    유저가 스탬프 기준을 달성했지만 아직 지급받지 않은 리워드 목록 (매장 무관 전체 조회).
    홈 화면 매장 리스트에 "리워드 수령 가능" 표시할 때 사용.
    """
    db = require_supabase()

    checkins_result = safe_execute(
        db.table("checkins")
        .select("store_id, stamp_count")
        .eq("user_id", user_id)
        .eq("status", "approved"),
        "체크인 조회 실패",
    )
    stamps_by_store: dict[str, int] = {}
    for c in checkins_result.data:
        stamps_by_store[c["store_id"]] = stamps_by_store.get(c["store_id"], 0) + (c.get("stamp_count") or 1)

    if not stamps_by_store:
        return []

    rewards_result = safe_execute(
        db.table("rewards").select("*, stores(name)").in_("store_id", list(stamps_by_store.keys())),
        "리워드 목록 조회 실패",
    )

    claims_result = safe_execute(
        db.table("user_rewards").select("reward_id").eq("user_id", user_id), "지급 기록 조회 실패"
    )
    claimed_ids = {r["reward_id"] for r in claims_result.data}

    available = []
    for r in rewards_result.data:
        if r["id"] in claimed_ids:
            continue
        if stamps_by_store.get(r["store_id"], 0) < r["stamp_threshold"]:
            continue
        available.append({
            "reward_id": r["id"],
            "store_id": r["store_id"],
            "store_name": (r.get("stores") or {}).get("name"),
            "stamp_threshold": r["stamp_threshold"],
            "target_type": r["target_type"],
            "target_name": r["target_name"],
            "reward_kind": r["reward_kind"],
            "discount_percent": r["discount_percent"],
        })
    return available


class RewardClaim(BaseModel):
    user_id: str


@router.post("/rewards/{reward_id}/claim")
def claim_reward(reward_id: str, payload: RewardClaim):
    # 사장님이 인증 수락 화면에서 "지급하기"를 누르면 호출 — 같은 유저에게 같은 리워드는 한 번만 지급됨
    db = require_supabase()
    existing = safe_execute(
        db.table("user_rewards").select("id").eq("user_id", payload.user_id).eq("reward_id", reward_id),
        "지급 여부 확인 실패",
    )
    if existing.data:
        raise HTTPException(status_code=409, detail="이미 지급된 리워드예요.")
    result = safe_execute(
        db.table("user_rewards").insert({"user_id": payload.user_id, "reward_id": reward_id}),
        "리워드 지급 실패",
    )
    return result.data[0]
