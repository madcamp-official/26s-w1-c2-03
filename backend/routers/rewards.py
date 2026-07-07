from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from deps import get_current_user_id, is_admin_user, require_supabase, safe_execute

router = APIRouter()

# ---------------------------------------------------------------------
# 리워드 (사장님이 설정한 스탬프 개수 달성형 혜택 — 메뉴/굿즈 x 무료·증정/할인)
# ---------------------------------------------------------------------


def _require_store_owner(db, store_id: str, current_user_id: str) -> None:
    # 관리자 로그인은 테스트 편의를 위해 매장 등록 여부와 무관하게 리워드를 관리할 수 있음
    if is_admin_user(current_user_id):
        return
    store = safe_execute(db.table("stores").select("owner_id").eq("id", store_id), "매장 조회 실패")
    if not store.data:
        raise HTTPException(status_code=404, detail="매장을 찾을 수 없습니다.")
    if store.data[0]["owner_id"] != current_user_id:
        raise HTTPException(status_code=403, detail="이 매장의 사장님만 할 수 있어요.")


class RewardCreate(BaseModel):
    stamp_threshold: int
    target_type: str  # 'menu' | 'goods'
    target_name: str
    reward_kind: str  # 'free' | 'discount'
    discount_percent: Optional[int] = None


@router.get("/stores/{store_id}/rewards", dependencies=[Depends(get_current_user_id)])
def get_store_rewards(store_id: str):
    db = require_supabase()
    result = safe_execute(
        db.table("rewards").select("*").eq("store_id", store_id).order("stamp_threshold"),
        "리워드 목록 조회 실패",
    )
    return result.data


@router.post("/stores/{store_id}/rewards")
def create_reward(store_id: str, payload: RewardCreate, current_user_id: str = Depends(get_current_user_id)):
    db = require_supabase()
    _require_store_owner(db, store_id, current_user_id)

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
def delete_reward(reward_id: str, current_user_id: str = Depends(get_current_user_id)):
    db = require_supabase()
    reward = safe_execute(db.table("rewards").select("store_id").eq("id", reward_id), "리워드 조회 실패")
    if not reward.data:
        raise HTTPException(status_code=404, detail="리워드를 찾을 수 없습니다.")
    _require_store_owner(db, reward.data[0]["store_id"], current_user_id)

    result = safe_execute(db.table("rewards").delete().eq("id", reward_id), "리워드 삭제 실패")
    if not result.data:
        raise HTTPException(status_code=404, detail="리워드를 찾을 수 없습니다.")
    return {"deleted": True}


@router.get("/users/{user_id}/reward-claims", dependencies=[Depends(get_current_user_id)])
def get_user_reward_claims(user_id: str):
    # 손님 화면에서 "이 리워드 이미 요청했는지/받았는지" 확인할 때 사용 (reward_id별 상태)
    db = require_supabase()
    result = safe_execute(
        db.table("user_rewards").select("reward_id, status").eq("user_id", user_id), "지급 기록 조회 실패"
    )
    return [{"reward_id": r["reward_id"], "status": r["status"]} for r in result.data]


@router.get("/users/{user_id}/available-rewards", dependencies=[Depends(get_current_user_id)])
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


@router.post("/rewards/{reward_id}/claim")
def claim_reward(reward_id: str, current_user_id: str = Depends(get_current_user_id)):
    # 손님이 "수령하기" 버튼을 누르면 호출 — 사장님 승인 전까지는 'pending' 상태로 대기.
    # 수령 주체는 토큰의 신원으로 고정 — 남의 user_id로 리워드를 대신 요청하지 못하게 함.
    db = require_supabase()
    existing = safe_execute(
        db.table("user_rewards").select("id").eq("user_id", current_user_id).eq("reward_id", reward_id),
        "요청 여부 확인 실패",
    )
    if existing.data:
        raise HTTPException(status_code=409, detail="이미 요청했거나 받은 리워드예요.")
    result = safe_execute(
        db.table("user_rewards").insert(
            {"user_id": current_user_id, "reward_id": reward_id, "status": "pending"}
        ),
        "리워드 요청 실패",
    )
    return result.data[0]


@router.get("/stores/{store_id}/reward-requests")
def get_store_reward_requests(store_id: str, status: Optional[str] = None, current_user_id: str = Depends(get_current_user_id)):
    """사장님 화면 — 이 매장의 리워드 목록에 걸린 수령 요청들 (닉네임 포함)."""
    db = require_supabase()
    _require_store_owner(db, store_id, current_user_id)

    rewards_result = safe_execute(
        db.table("rewards").select("id").eq("store_id", store_id), "리워드 목록 조회 실패"
    )
    reward_ids = [r["id"] for r in rewards_result.data]
    if not reward_ids:
        return []

    query = (
        db.table("user_rewards")
        .select("*, rewards(target_type, target_name, reward_kind, discount_percent, stamp_threshold), users(nickname)")
        .in_("reward_id", reward_ids)
    )
    if status:
        query = query.eq("status", status)
    result = safe_execute(query.order("claimed_at"), "리워드 요청 조회 실패")

    requests = []
    for r in result.data:
        reward = r.get("rewards") or {}
        requests.append({
            "id": r["id"],
            "user_id": r["user_id"],
            "nickname": (r.get("users") or {}).get("nickname"),
            "reward_id": r["reward_id"],
            "status": r["status"],
            "requested_at": r.get("claimed_at"),
            "target_type": reward.get("target_type"),
            "target_name": reward.get("target_name"),
            "reward_kind": reward.get("reward_kind"),
            "discount_percent": reward.get("discount_percent"),
            "stamp_threshold": reward.get("stamp_threshold"),
        })
    return requests


class RewardRequestReview(BaseModel):
    action: str  # 'approve' | 'reject'


@router.patch("/user-rewards/{user_reward_id}")
def review_reward_request(
    user_reward_id: str, payload: RewardRequestReview, current_user_id: str = Depends(get_current_user_id)
):
    db = require_supabase()

    # 이 수령 요청이 걸린 리워드 → 매장까지 거슬러 올라가서, 그 매장 사장님만 승인/거절할 수 있게 함
    user_reward = safe_execute(
        db.table("user_rewards").select("reward_id").eq("id", user_reward_id), "요청 조회 실패"
    )
    if not user_reward.data:
        raise HTTPException(status_code=404, detail="요청을 찾을 수 없습니다.")
    reward = safe_execute(
        db.table("rewards").select("store_id").eq("id", user_reward.data[0]["reward_id"]), "리워드 조회 실패"
    )
    if not reward.data:
        raise HTTPException(status_code=404, detail="리워드를 찾을 수 없습니다.")
    _require_store_owner(db, reward.data[0]["store_id"], current_user_id)

    if payload.action == "approve":
        result = safe_execute(
            db.table("user_rewards")
            .update({"status": "approved", "reviewed_at": "now()"})
            .eq("id", user_reward_id),
            "리워드 승인 실패",
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="요청을 찾을 수 없습니다.")
        return result.data[0]
    elif payload.action == "reject":
        result = safe_execute(
            db.table("user_rewards").delete().eq("id", user_reward_id), "리워드 거절 실패"
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="요청을 찾을 수 없습니다.")
        return {"deleted": True}
    else:
        raise HTTPException(status_code=422, detail="action은 approve 또는 reject여야 합니다.")
