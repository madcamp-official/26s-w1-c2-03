import { useState } from "react"

// 사장님 회원가입 (첫 화면에서만) — 계정 + 가게 이름
// ⚠️ 지금은 임시 방식. 카카오 로그인이 붙으면: 카카오 가입 → 매장 등록(POST /stores)으로 교체.
export default function OwnerSignupScreen({ onOwnerSignup, goLogin }) {
  const [id, setId] = useState("")
  const [pw, setPw] = useState("")
  const [nickname, setNickname] = useState("")
  const [storeName, setStoreName] = useState("")
  const canSubmit = id.trim() && pw.trim() && nickname.trim() && storeName.trim()

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

      <label className="mb-1 block text-sm font-medium text-slate-600">비밀번호</label>
      <input
        type="password"
        value={pw}
        onChange={(e) => setPw(e.target.value)}
        placeholder="비밀번호"
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
        className="mb-6 w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 outline-none focus:border-amber-400"
      />

      <button
        onClick={() => onOwnerSignup(id.trim(), nickname.trim(), storeName.trim())}
        disabled={!canSubmit}
        className="w-full rounded-xl bg-amber-500 py-3.5 font-semibold text-white disabled:bg-slate-200 disabled:text-slate-400"
      >
        사장님으로 가입하기
      </button>

      <p className="mt-6 text-center text-sm text-slate-500">
        <button onClick={goLogin} className="font-medium text-amber-600">
          로그인으로 돌아가기
        </button>
      </p>
    </div>
  )
}
