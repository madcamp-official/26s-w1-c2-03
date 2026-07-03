import { useState } from "react"

// 로그인 — 아이디 + 비밀번호
// ⚠️ 지금은 뼈대라 입력값만 채우면 통과. 실제 검증은 나중에 서버(POST /auth/login)에서.
export default function LoginScreen({ onLogin, goSignup }) {
  const [id, setId] = useState("")
  const [pw, setPw] = useState("")
  const canSubmit = id.trim() && pw.trim()

  return (
    <div className="flex flex-1 flex-col justify-center px-8">
      <div className="mb-10 text-center">
        <img src="/app-icon.svg" alt="맛짱" className="mx-auto mb-4 h-24 w-24" />
        <h1 className="text-3xl font-bold text-slate-900">맛짱</h1>
        <p className="text-sm font-medium tracking-widest text-amber-500">MATZZANG</p>
        <p className="mt-2 text-slate-500">로그인하고 맛집을 정복해보세요</p>
      </div>

      <label className="mb-1 block text-sm font-medium text-slate-600">아이디</label>
      <input
        value={id}
        onChange={(e) => setId(e.target.value)}
        placeholder="아이디를 입력하세요"
        className="mb-4 w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 outline-none focus:border-amber-400"
      />

      <label className="mb-1 block text-sm font-medium text-slate-600">비밀번호</label>
      <input
        type="password"
        value={pw}
        onChange={(e) => setPw(e.target.value)}
        placeholder="비밀번호를 입력하세요"
        className="mb-6 w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 outline-none focus:border-amber-400"
      />

      <button
        onClick={() => onLogin(id)}
        disabled={!canSubmit}
        className="w-full rounded-xl bg-amber-500 py-3.5 font-semibold text-white disabled:bg-slate-200 disabled:text-slate-400"
      >
        로그인
      </button>

      <p className="mt-6 text-center text-sm text-slate-500">
        계정이 없으신가요?{" "}
        <button onClick={goSignup} className="font-medium text-amber-600">
          회원가입
        </button>
      </p>
    </div>
  )
}
