import { useEffect, useState } from "react"
import { getCheckins, reviewCheckin, getStoreRewardRequests, reviewRewardRequest } from "../lib/api"

// 리워드 하나를 사람이 읽을 문구로 (StoreRewardsScreen/StoreDetailScreen과 동일한 규칙)
function rewardLabel(r) {
  if (r.reward_kind === "discount") return `${r.target_name} ${r.discount_percent}% 할인`
  return r.target_type === "menu" ? `${r.target_name} 무료` : `${r.target_name} 증정`
}

const MAX_STAMP_COUNT = 3 // 백엔드 review_checkin과 동일한 상한 (checkins.py)

// 사장님 — 이 매장(storeId)에 온 방문 인증 요청 + 리워드 수령 요청을 실제 백엔드에서 불러와 수락/거절.
// isAdmin이면 관리자 로그인(테스트용)이라 스탬프 개수 상한이 없음 — 백엔드도 동일하게 예외 처리함.
export default function OwnerCheckinsScreen({ storeId, isAdmin }) {
  const [checkins, setCheckins] = useState(null) // null = 로딩 중
  const [error, setError] = useState("")
  const [reviewingId, setReviewingId] = useState(null) // 지금 수락/거절 처리 중인 요청
  const [stampCounts, setStampCounts] = useState({}) // checkinId -> 수락 시 줄 스탬프 개수 (기본 1)

  const [rewardRequests, setRewardRequests] = useState(null) // null = 로딩 중
  const [reviewingRewardId, setReviewingRewardId] = useState(null) // 지금 승인/거절 처리 중인 리워드 요청

  const load = () => {
    setError("")
    getCheckins({ storeId, status: "pending" })
      .then(setCheckins)
      .catch((e) => setError(e.message || "인증 요청을 불러오지 못했어요"))
  }

  const loadRewardRequests = () => {
    getStoreRewardRequests(storeId, "pending")
      .then(setRewardRequests)
      .catch(() => setRewardRequests([]))
  }

  useEffect(load, [storeId])
  useEffect(loadRewardRequests, [storeId])

  const getStampCount = (checkinId) => stampCounts[checkinId] ?? 1
  const changeStampCount = (checkinId, delta) => {
    setStampCounts((prev) => {
      const next = Math.max(1, (prev[checkinId] ?? 1) + delta)
      return { ...prev, [checkinId]: isAdmin ? next : Math.min(MAX_STAMP_COUNT, next) }
    })
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

  const reviewReward = async (userRewardId, action) => {
    setReviewingRewardId(userRewardId)
    try {
      await reviewRewardRequest({ userRewardId, action })
      setRewardRequests((prev) => prev.filter((r) => r.id !== userRewardId))
    } catch (e) {
      setError(e.message || "처리에 실패했어요")
    } finally {
      setReviewingRewardId(null)
    }
  }

  return (
    <div className="px-5 py-6">
      {error && <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-500">{error}</p>}

      {/* 리워드 수령 요청 — 손님이 "수령하기"를 누른 것들 */}
      <section className="mb-6">
        <h2 className="mb-1 text-lg font-semibold text-slate-900">리워드 수령 요청</h2>
        <p className="mb-4 text-sm text-slate-500">
          손님이 리워드 수령을 요청하면 여기서 확인하고 승인해주세요.
        </p>

        {rewardRequests === null && <p className="py-6 text-center text-sm text-slate-400">불러오는 중...</p>}

        {rewardRequests?.length === 0 && (
          <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
            지금은 대기 중인 리워드 요청이 없어요 🎁
          </p>
        )}

        <div className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
          {rewardRequests?.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3"
            >
              <div>
                <p className="font-semibold text-slate-900">{r.nickname || "알 수 없음"}</p>
                <p className="text-sm text-amber-800">🎁 {rewardLabel(r)}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => reviewReward(r.id, "reject")}
                  disabled={reviewingRewardId === r.id}
                  className="rounded-full bg-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 disabled:opacity-50"
                >
                  거절
                </button>
                <button
                  onClick={() => reviewReward(r.id, "approve")}
                  disabled={reviewingRewardId === r.id}
                  className="rounded-full bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {reviewingRewardId === r.id ? "처리 중..." : "승인"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 방문 인증 요청 */}
      <h2 className="mb-1 text-lg font-semibold text-slate-900">대기 중인 인증 요청</h2>
      <p className="mb-4 text-sm text-slate-500">
        손님이 보낸 방문 사진을 확인하고 수락하면 스탬프가 바로 적립돼요.
      </p>

      {checkins === null && <p className="py-10 text-center text-sm text-slate-400">불러오는 중...</p>}

      {checkins?.length === 0 && (
        <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
          지금은 대기 중인 요청이 없어요 🎉
        </p>
      )}

      <div className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
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
