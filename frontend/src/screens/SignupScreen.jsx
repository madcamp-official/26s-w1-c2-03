import { useState } from "react"

// 회원가입 — 아이디 + 비밀번호 + 닉네임
// ⚠️ 지금은 뼈대라 저장 안 함. 실제 가입은 나중에 서버(POST /auth/signup)에서.
export default function SignupScreen({ onSignup, goLogin }) {
  const [id, setId] = useState("")
  const [pw, setPw] = useState("")
  const [nickname, setNickname] = useState("")
  const canSubmit = id.trim() && pw.trim() && nickname.trim()

  return (
    <div className="flex flex-1 flex-col justify-center px-8">
      <div className="mb-8 text-center">
        <img src="/app-icon.svg" alt="맛짱" className="mx-auto mb-4 h-16 w-16" />
        <h1 className="text-3xl font-bold text-slate-900">회원가입</h1>
        <p className="mt-2 text-slate-500">맛짱을 시작해볼까요?</p>
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
        placeholder="지도에 표시될 이름"
        className="mb-6 w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 outline-none focus:border-amber-400"
      />

      <button
        onClick={() => onSignup(id, nickname)}
        disabled={!canSubmit}
        className="w-full rounded-xl bg-amber-500 py-3.5 font-semibold text-white disabled:bg-slate-200 disabled:text-slate-400"
      >
        회원가입
      </button>

      <p className="mt-6 text-center text-sm text-slate-500">
        이미 계정이 있으신가요?{" "}
        <button onClick={goLogin} className="font-medium text-amber-600">
          로그인
        </button>
      </p>
    </div>
  )
}
