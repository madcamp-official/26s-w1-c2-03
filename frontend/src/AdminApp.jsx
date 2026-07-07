import { useState } from "react"
import AdminBadgeScreen from "./screens/AdminBadgeScreen"
import AdminOptionsScreen from "./screens/AdminOptionsScreen"
import AdminStoreApprovalScreen from "./screens/AdminStoreApprovalScreen"

const TABS = [
  { key: "stores", label: "매장 승인" },
  { key: "badges", label: "뱃지 관리" },
  { key: "options", label: "카테고리·키워드 관리" },
]

// 관리자 키 입력 게이트 — 예전엔 /admin URL만 알면 누구나 뱃지·카테고리·매장 승인을 건드릴 수 있었어서 추가함.
// 백엔드가 이 키를 X-Admin-Key 헤더로 검증하므로, 여기서 틀린 키를 넣으면 각 화면의 액션이 401로 실패함.
function AdminKeyGate({ onUnlock }) {
  const [input, setInput] = useState("")

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!input.trim()) return
    localStorage.setItem("admin_key", input.trim())
    onUnlock()
  }

  return (
    <div className="mx-auto max-w-sm px-5 pt-24 text-center">
      <h1 className="mb-2 text-xl font-bold text-slate-900">🔒 관리자 키 입력</h1>
      <p className="mb-5 text-sm text-slate-500">팀에서 공유한 관리자 키를 입력해야 관리자 화면을 쓸 수 있어요.</p>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="password"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="관리자 키"
          autoFocus
          className="flex-1 rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-amber-400"
        />
        <button type="submit" className="rounded-xl bg-amber-500 px-4 py-3 font-semibold text-white">
          확인
        </button>
      </form>
    </div>
  )
}

// 관리자 페이지 — 매장 승인 / 뱃지 관리 / 카테고리·키워드 관리 탭 전환
export default function AdminApp() {
  const [tab, setTab] = useState("stores")
  const [adminKey, setAdminKey] = useState(() => localStorage.getItem("admin_key"))

  if (!adminKey) {
    return <AdminKeyGate onUnlock={() => setAdminKey(localStorage.getItem("admin_key"))} />
  }

  return (
    <div>
      <div className="mx-auto flex max-w-[560px] items-center gap-2 px-5 pt-6 lg:max-w-4xl xl:max-w-5xl 2xl:max-w-6xl">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-full px-4 py-2 text-sm font-medium ${
              tab === t.key ? "bg-amber-500 text-white" : "bg-slate-100 text-slate-600"
            }`}
          >
            {t.label}
          </button>
        ))}
        <button
          onClick={() => {
            localStorage.removeItem("admin_key")
            setAdminKey(null)
          }}
          className="ml-auto text-xs text-slate-300 underline"
        >
          키 재입력
        </button>
      </div>

      {tab === "stores" ? (
        <AdminStoreApprovalScreen />
      ) : tab === "badges" ? (
        <AdminBadgeScreen />
      ) : (
        <AdminOptionsScreen />
      )}
    </div>
  )
}
