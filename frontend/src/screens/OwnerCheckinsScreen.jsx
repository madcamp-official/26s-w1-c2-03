import { useState } from "react"
import { pendingCheckins as initialCheckins } from "../data/mockData"

// 사장님 — 손님이 올린 방문 인증 요청을 수락/거절
// ⚠️ 지금은 목데이터 + 화면 안에서만 상태 변경. 백엔드에 아래 엔드포인트가 생기면 연결:
//    - 목록 조회: GET /stores/{store_id}/checkins?status=pending
//    - 수락/거절: PATCH /checkins/{checkin_id}  body: { status: "approved" | "rejected" }
export default function OwnerCheckinsScreen() {
  const [checkins, setCheckins] = useState(initialCheckins)

  const pending = checkins.filter((c) => c.status === "pending")
  const done = checkins.filter((c) => c.status !== "pending")

  const review = (id, status) => {
    setCheckins((prev) => prev.map((c) => (c.id === id ? { ...c, status } : c)))
  }

  return (
    <div className="px-5 py-6">
      <h2 className="mb-1 text-lg font-semibold text-slate-900">대기 중인 인증 요청</h2>
      <p className="mb-4 text-sm text-slate-500">
        손님이 보낸 방문 사진을 확인하고 수락하면 스탬프가 바로 적립돼요.
      </p>

      {pending.length === 0 && (
        <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
          지금은 대기 중인 요청이 없어요 🎉
        </p>
      )}

      <div className="space-y-3">
        {pending.map((c) => (
          <div key={c.id} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-amber-50 text-2xl">
                {c.photoEmoji}
              </div>
              <div className="flex-1">
                <p className="font-semibold text-slate-900">{c.nickname}</p>
                <p className="text-sm text-slate-500">
                  {c.storeName} · {c.purpose}
                </p>
                <p className="text-xs text-slate-400">{c.requestedAt}</p>
              </div>
            </div>

            <div className="mt-3 flex gap-2">
              <button
                onClick={() => review(c.id, "rejected")}
                className="flex-1 rounded-xl bg-slate-100 py-2.5 text-sm font-medium text-slate-500"
              >
                거절
              </button>
              <button
                onClick={() => review(c.id, "approved")}
                className="flex-1 rounded-xl bg-amber-500 py-2.5 text-sm font-semibold text-white"
              >
                수락
              </button>
            </div>
          </div>
        ))}
      </div>

      {done.length > 0 && (
        <>
          <h3 className="mt-8 mb-2 text-sm font-semibold text-slate-500">처리 완료</h3>
          <div className="space-y-2">
            {done.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3 opacity-70"
              >
                <span className="text-xl">{c.photoEmoji}</span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-700">
                    {c.nickname} · {c.storeName}
                  </p>
                </div>
                <span
                  className={`text-xs font-medium ${
                    c.status === "approved" ? "text-amber-600" : "text-slate-400"
                  }`}
                >
                  {c.status === "approved" ? "✅ 수락됨" : "✕ 거절됨"}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
