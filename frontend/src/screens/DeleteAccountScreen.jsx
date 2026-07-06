import { useState } from "react"
import { deleteUser } from "../lib/api"

// 회원탈퇴 확인 — 되돌릴 수 없는 작업이라 안내 문구를 먼저 보여주고 명확히 동의해야 버튼이 눌리게 함
export default function DeleteAccountScreen({ user, onBack, onDeleted }) {
  const [agreed, setAgreed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const handleDelete = async () => {
    setError(null)
    setSubmitting(true)
    try {
      await deleteUser(user.id)
      onDeleted()
    } catch (err) {
      setError(err.message || "탈퇴 처리에 실패했어요. 다시 시도해주세요.")
      setSubmitting(false)
    }
  }

  return (
    <div className="pb-4 lg:mx-auto lg:max-w-xl">
      <header className="flex items-center gap-3 px-5 pt-6 pb-4">
        <button onClick={onBack} className="text-2xl text-slate-400">
          ‹
        </button>
        <h1 className="text-lg font-semibold text-slate-900">회원탈퇴</h1>
      </header>

      <div className="px-5">
        <div className="rounded-2xl bg-red-50 p-5">
          <p className="font-semibold text-red-600">탈퇴하면 아래 정보가 모두 삭제되며 복구할 수 없어요.</p>
          <ul className="mt-3 space-y-1.5 text-sm text-red-500">
            <li>· 스탬프·방문 인증 기록</li>
            <li>· 획득한 뱃지</li>
            <li>· 닉네임·프로필 사진</li>
          </ul>
        </div>

        <label className="mt-5 flex items-start gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-red-500"
          />
          위 내용을 확인했으며, 탈퇴에 동의합니다.
        </label>

        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

        <button
          onClick={handleDelete}
          disabled={!agreed || submitting}
          className="mt-8 w-full rounded-xl bg-red-500 py-3.5 font-semibold text-white disabled:bg-slate-200 disabled:text-slate-400"
        >
          {submitting ? "탈퇴 처리 중..." : "회원탈퇴"}
        </button>

        <button
          onClick={onBack}
          className="mt-3 w-full rounded-xl border border-slate-200 py-3 text-sm font-medium text-slate-500"
        >
          취소
        </button>
      </div>
    </div>
  )
}
