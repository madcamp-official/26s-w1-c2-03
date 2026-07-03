import { useState } from "react"
import { purposes } from "../data/mockData"

// 방문 인증 — 사진 + 방문목적 선택 → 대기 화면
export default function CheckinScreen({ store, onBack, onDone }) {
  const [purpose, setPurpose] = useState(null)
  const [submitted, setSubmitted] = useState(false)

  // 인증 요청을 보낸 뒤: 사장님 수락 대기 화면
  if (submitted) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center px-8 text-center">
        <div className="text-6xl">⏳</div>
        <h2 className="mt-4 text-xl font-bold text-slate-900">사장님 확인을 기다리는 중...</h2>
        <p className="mt-2 text-slate-500">사장님이 수락하면 스탬프가 적립돼요!</p>
        <button
          onClick={onDone}
          className="mt-8 rounded-2xl bg-slate-100 px-6 py-3 font-medium text-slate-600"
        >
          홈으로
        </button>
      </div>
    )
  }

  return (
    <div className="pb-4">
      <header className="flex items-center gap-3 px-5 pt-6 pb-4">
        <button onClick={onBack} className="text-2xl text-slate-400">
          ‹
        </button>
        <h1 className="text-lg font-semibold text-slate-900">방문 인증</h1>
      </header>

      <div className="px-5">
        <p className="text-slate-500">{store?.name}</p>

        {/* 사진 촬영 영역 (아직 기능 없음, 자리만) */}
        <button className="mt-3 flex aspect-square w-full flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50 text-slate-400">
          <span className="text-5xl">📷</span>
          <span className="mt-2 text-sm">탭해서 음식 사진 촬영</span>
        </button>

        {/* 방문 목적 선택 */}
        <h3 className="mt-6 mb-2 font-semibold text-slate-900">오늘 방문 목적은?</h3>
        <div className="flex flex-wrap gap-2">
          {purposes.map((p) => (
            <button
              key={p}
              onClick={() => setPurpose(p)}
              className={`rounded-full px-4 py-2 text-sm ${
                purpose === p ? "bg-amber-500 text-white" : "bg-slate-100 text-slate-600"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* 제출 (방문목적 골라야 활성화) */}
      <div className="px-5 pt-8">
        <button
          onClick={() => setSubmitted(true)}
          disabled={!purpose}
          className="w-full rounded-2xl bg-amber-500 py-4 font-semibold text-white disabled:bg-slate-200 disabled:text-slate-400"
        >
          인증 요청 보내기
        </button>
      </div>
    </div>
  )
}
