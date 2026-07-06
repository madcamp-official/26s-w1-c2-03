import { useEffect, useState } from "react"
import { getCheckins, reviewCheckin, getStoreRewards, getUserRewardClaims, claimReward } from "../lib/api"

// 리워드 하나를 사람이 읽을 문구로 (StoreRewardsScreen/StoreDetailScreen과 동일한 규칙)
function rewardLabel(r) {
  if (r.reward_kind === "discount") return `${r.target_name} ${r.discount_percent}% 할인`
  return r.target_type === "menu" ? `${r.target_name} 무료` : `${r.target_name} 증정`
}

// 사장님 — 이 매장(storeId)에 온 방문 인증 요청을 실제 백엔드에서 불러와 수락/거절
export default function OwnerCheckinsScreen({ storeId }) {
  const [checkins, setCheckins] = useState(null) // null = 로딩 중
  const [error, setError] = useState("")
  const [reviewingId, setReviewingId] = useState(null) // 지금 수락/거절 처리 중인 요청
  const [stampCounts, setStampCounts] = useState({}) // checkinId -> 수락 시 줄 스탬프 개수 (기본 1)

  const [rewards, setRewards] = useState([]) // 이 매장의 리워드 기준
  const [approvedStamps, setApprovedStamps] = useState({}) // userId -> 이미 승인된 스탬프 합
  const [claimedRewardIds, setClaimedRewardIds] = useState({}) // userId -> Set(이미 받은 reward id)
  const [claimingKey, setClaimingKey] = useState(null) // 지금 지급 처리 중인 "userId:rewardId"

  const load = () => {
    setError("")
    getCheckins({ storeId, status: "pending" })
      .then(setCheckins)
      .catch((e) => setError(e.message || "인증 요청을 불러오지 못했어요"))
  }

  useEffect(load, [storeId])

  useEffect(() => {
    getStoreRewards(storeId)
      .then(setRewards)
      .catch(() => setRewards([]))
  }, [storeId])

  // 대기 중인 요청을 보낸 유저들의 "이미 승인된 스탬프 합"과 "이미 받은 리워드"를 미리 조회
  // (스탬프를 더 주면 리워드 기준을 넘는지 계산해서, 수락 화면에서 바로 지급할 수 있게 하기 위함)
  useEffect(() => {
    if (!checkins || checkins.length === 0) return
    const userIds = [...new Set(checkins.map((c) => c.user_id))]
    userIds.forEach((userId) => {
      getCheckins({ storeId, userId, status: "approved" })
        .then((approved) => {
          const sum = approved.reduce((total, c) => total + (c.stamp_count ?? 1), 0)
          setApprovedStamps((prev) => ({ ...prev, [userId]: sum }))
        })
        .catch(() => {})
      getUserRewardClaims(userId)
        .then((ids) => setClaimedRewardIds((prev) => ({ ...prev, [userId]: new Set(ids) })))
        .catch(() => {})
    })
  }, [checkins, storeId])

  const getStampCount = (checkinId) => stampCounts[checkinId] ?? 1
  const changeStampCount = (checkinId, delta) => {
    setStampCounts((prev) => ({ ...prev, [checkinId]: Math.max(1, (prev[checkinId] ?? 1) + delta) }))
  }

  // 이 체크인을 (지금 정한 스탬프 개수로) 수락하면 새로 달성하게 될 리워드들 — 이미 받은 건 제외
  const achievableRewards = (checkin) => {
    const projectedTotal = (approvedStamps[checkin.user_id] ?? 0) + getStampCount(checkin.id)
    const claimed = claimedRewardIds[checkin.user_id] ?? new Set()
    return rewards.filter((r) => projectedTotal >= r.stamp_threshold && !claimed.has(r.id))
  }

  const handleClaim = async (userId, reward) => {
    const key = `${userId}:${reward.id}`
    setClaimingKey(key)
    try {
      await claimReward({ rewardId: reward.id, userId })
      setClaimedRewardIds((prev) => ({
        ...prev,
        [userId]: new Set([...(prev[userId] ?? []), reward.id]),
      }))
    } catch (e) {
      setError(e.message || "리워드 지급에 실패했어요")
    } finally {
      setClaimingKey(null)
    }
  }

  const review = async (checkinId, status) => {
    setReviewingId(checkinId)
    try {
      await reviewCheckin({ checkinId, status, stampCount: getStampCount(checkinId) })
      // 처리된 건 대기 목록에서 바로 제거 (재조회 없이 즉시 반영)
      setCheckins((prev) => prev.filter((c) => c.id !== checkinId))
    } catch (e) {
      setError(e.message || "처리에 실패했어요")
    } finally {
      setReviewingId(null)
    }
  }

  return (
    <div className="px-5 py-6">
      <h2 className="mb-1 text-lg font-semibold text-slate-900">대기 중인 인증 요청</h2>
      <p className="mb-4 text-sm text-slate-500">
        손님이 보낸 방문 사진을 확인하고 수락하면 스탬프가 바로 적립돼요.
      </p>

      {error && <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-500">{error}</p>}

      {checkins === null && <p className="py-10 text-center text-sm text-slate-400">불러오는 중...</p>}

      {checkins?.length === 0 && (
        <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
          지금은 대기 중인 요청이 없어요 🎉
        </p>
      )}

      <div className="space-y-3">
        {checkins?.map((c) => (
          <div key={c.id} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              {c.photo_url ? (
                <img
                  src={c.photo_url}
                  alt="방문 인증 사진"
                  className="h-16 w-16 shrink-0 rounded-xl object-cover"
                />
              ) : (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-2xl">
                  📷
                </div>
              )}
              <div className="flex-1">
                <p className="font-semibold text-slate-900">{c.users?.nickname || "알 수 없음"}</p>
                <p className="text-sm text-slate-500">{c.purpose || "방문 목적 미지정"}</p>
                <p className="text-xs text-slate-400">{new Date(c.created_at).toLocaleString("ko-KR")}</p>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
              <span className="text-sm text-slate-500">수락 시 지급할 스탬프</span>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => changeStampCount(c.id, -1)}
                  disabled={reviewingId === c.id}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-200 text-slate-600 disabled:opacity-50"
                >
                  −
                </button>
                <span className="w-4 text-center font-semibold text-slate-900">{getStampCount(c.id)}</span>
                <button
                  onClick={() => changeStampCount(c.id, 1)}
                  disabled={reviewingId === c.id}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-200 text-slate-600 disabled:opacity-50"
                >
                  +
                </button>
              </div>
            </div>

            {/* 이 스탬프 개수로 수락하면 달성하게 될 리워드 — 여기서 바로 지급 처리 가능 */}
            {achievableRewards(c).map((r) => {
              const key = `${c.user_id}:${r.id}`
              return (
                <div
                  key={r.id}
                  className="mt-2 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-3 py-2"
                >
                  <span className="text-sm text-amber-800">🎁 {rewardLabel(r)} 달성</span>
                  <button
                    onClick={() => handleClaim(c.user_id, r)}
                    disabled={claimingKey === key}
                    className="rounded-full bg-amber-500 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {claimingKey === key ? "처리 중..." : "지급하기"}
                  </button>
                </div>
              )
            })}

            <div className="mt-2 flex gap-2">
              <button
                onClick={() => review(c.id, "rejected")}
                disabled={reviewingId === c.id}
                className="flex-1 rounded-xl bg-slate-100 py-2.5 text-sm font-medium text-slate-500 disabled:opacity-50"
              >
                거절
              </button>
              <button
                onClick={() => review(c.id, "approved")}
                disabled={reviewingId === c.id}
                className="flex-1 rounded-xl bg-amber-500 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {reviewingId === c.id ? "처리 중..." : `스탬프 ${getStampCount(c.id)}개 주고 수락`}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
