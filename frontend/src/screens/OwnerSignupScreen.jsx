import { useState } from "react"
import { signupUser } from "../lib/api"

// 사장님 회원가입 (첫 화면에서만) — 실제 계정(POST /users/signup) + 가게 이름
// ⚠️ "사장님" 여부 자체는 아직 백엔드 개념이 없어서 브라우저(ownerStore.js)에 임시로 기록.
//    나중에 백엔드에 owners 테이블 연동 로그인이 생기면 registerOwner 호출만 없애면 됨.
export default function OwnerSignupScreen({ onOwnerSignup, goLogin }) {
  const [id, setId] = useState("")
  const [nickname, setNickname] = useState("")
  const [storeName, setStoreName] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const canSubmit = id.trim() && nickname.trim() && storeName.trim() && !submitting

  const handleSubmit = async () => {
    setSubmitting(true)
    setError("")
    try {
      const user = await signupUser({ loginId: id.trim(), nickname: nickname.trim() })
      onOwnerSignup(user, storeName.trim())
    } catch (e) {
      setError(e.message || "가입에 실패했어요")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col justify-center px-8">
      <div className="mb-8 text-center">
        <img src="/app-icon.svg" alt="맛짱" className="mx-auto mb-4 h-16 w-16" />
        <h1 className="text-3xl font-bold text-slate-900">사장님 회원가입</h1>
        <p className="mt-2 text-slate-500">가게를 등록하고 단골을 관리해보세요</p>
      </div>

      <label className="mb-1 block text-sm font-medium text-slate-600">아이디</label>
      <input
        value={id}
        onChange={(e) => setId(e.target.value)}
        placeholder="사용할 아이디"
        className="mb-4 w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 outline-none focus:border-amber-400"
      />

      <label className="mb-1 block text-sm font-medium text-slate-600">닉네임</label>
      <input
        value={nickname}
        onChange={(e) => setNickname(e.target.value)}
        placeholder="표시될 이름"
        className="mb-4 w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 outline-none focus:border-amber-400"
      />

      <label className="mb-1 block text-sm font-medium text-slate-600">가게 이름</label>
      <input
        value={storeName}
        onChange={(e) => setStoreName(e.target.value)}
        placeholder="예: 성수동 감성카페"
        className="mb-1 w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 outline-none focus:border-amber-400"
      />
      <p className="mb-6 text-xs text-slate-400">
        매장 상세 정보(주소·카테고리 등)는 가입 후 사장님 모드에서 등록해요
      </p>

      {error && <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-500">{error}</p>}

      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="w-full rounded-xl bg-amber-500 py-3.5 font-semibold text-white disabled:bg-slate-200 disabled:text-slate-400"
      >
        {submitting ? "가입 중..." : "사장님으로 가입하기"}
      </button>

      <p className="mt-6 text-center text-sm text-slate-500">
        <button onClick={goLogin} className="font-medium text-amber-600">
          로그인으로 돌아가기
        </button>
      </p>
    </div>
  )
}
