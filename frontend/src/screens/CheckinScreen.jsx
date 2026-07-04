import { useEffect, useRef, useState } from "react"
import { purposes } from "../data/mockData"
import { createCheckin } from "../lib/api"

// 방문 인증 — 사진 + 방문목적 선택 → 대기 화면
export default function CheckinScreen({ store, user, onBack, onDone }) {
  const [purpose, setPurpose] = useState(null)
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState(null)

  const fileInputRef = useRef(null)

  // 미리보기 URL 정리 (메모리 누수 방지) — 새 사진 고르거나 화면 나갈 때 해제
  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview)
    }
  }, [photoPreview])

  const handlePhotoPick = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  const canSubmit = photoFile && purpose && !submitting

  const handleSubmit = async () => {
    if (!photoFile || !purpose) return
    setError(null)
    setSubmitting(true)
    try {
      await createCheckin({
        userId: user.id,
        storeId: store.id,
        purpose,
        photoFile,
      })
      setSubmitted(true)
    } catch (err) {
      setError(err.message || "체크인 등록에 실패했어요. 다시 시도해주세요.")
    } finally {
      setSubmitting(false)
    }
  }

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

        {/* 숨겨진 파일 input — capture="environment"로 모바일에서 바로 카메라가 뜸 */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handlePhotoPick}
          className="hidden"
        />

        {/* 사진 촬영 영역 */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="mt-3 flex aspect-square w-full flex-col items-center justify-center overflow-hidden rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50 text-slate-400"
        >
          {photoPreview ? (
            <img src={photoPreview} alt="촬영한 음식 사진" className="h-full w-full object-cover" />
          ) : (
            <>
              <span className="text-5xl">📷</span>
              <span className="mt-2 text-sm">탭해서 음식 사진 촬영</span>
            </>
          )}
        </button>
        {photoPreview && (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="mt-2 text-sm font-medium text-amber-600"
          >
            다시 촬영하기
          </button>
        )}

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

        {error && <p className="mt-4 text-sm text-red-500">{error}</p>}
      </div>

      {/* 제출 (사진 + 방문목적 다 골라야 활성화) */}
      <div className="px-5 pt-8">
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full rounded-2xl bg-amber-500 py-4 font-semibold text-white disabled:bg-slate-200 disabled:text-slate-400"
        >
          {submitting ? "업로드 중..." : "인증 요청 보내기"}
        </button>
      </div>
    </div>
  )
}