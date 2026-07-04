import { useState } from "react"
import AdminBadgeScreen from "./screens/AdminBadgeScreen"
import AdminOptionsScreen from "./screens/AdminOptionsScreen"

const TABS = [
  { key: "badges", label: "뱃지 관리" },
  { key: "options", label: "카테고리·키워드 관리" },
]

// 관리자 페이지 — 뱃지 관리 / 카테고리·키워드 관리 탭 전환
export default function AdminApp() {
  const [tab, setTab] = useState("badges")

  return (
    <div>
      <div className="mx-auto flex max-w-[560px] gap-2 px-5 pt-6">
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
      </div>

      {tab === "badges" ? <AdminBadgeScreen /> : <AdminOptionsScreen />}
    </div>
  )
}
