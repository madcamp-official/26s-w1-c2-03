import { useEffect, useState } from "react"
import { getCheckins, reviewCheckin } from "../lib/api"

// 사장님 — 이 매장(storeId)에 온 방문 인증 요청을 실제 백엔드에서 불러와 수락/거절
export default function OwnerCheckinsScreen({ storeId }) {
  const [checkins, setCheckins] = useState(null) // null = 로딩 중
  const [error, setError] = useState("")
  const [reviewingId, setReviewingId] = useState(null) // 지금 수락/거절 처리 중인 요청

  const load = () => {
    setError("")
    getCheckins({ storeId, status: "pending" })
      .then(setCheckins)
      .catch((e) => setError(e.message || "인증 요청을 불러오지 못했어요"))
  }

  useEffect(load, [storeId])

  const review = async (checkinId, status) => {
    setReviewingId(checkinId)
    try {
      await reviewCheckin({ checkinId, status })
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

            <div className="mt-3 flex gap-2">
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
                {reviewingId === c.id ? "처리 중..." : "수락"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
