// PC/태블릿 큰 화면에서 BottomNav 대신 보여주는 세로 사이드바 (lg 이상에서만 표시)
// myBadgeCount: 내 매장에 온 미확인 인증 요청 개수 — 0보다 크면 "마이" 항목에 카카오톡 알림처럼 빨간 뱃지 표시
export default function SideNav({ screen, setScreen, myBadgeCount = 0 }) {
  const tabs = [
    { key: "home", label: "홈", icon: "🏠" },
    { key: "map", label: "지도", icon: "🗺️" },
    { key: "my", label: "마이", icon: "🏆" },
  ]

  return (
    <nav className="hidden w-56 shrink-0 flex-col border-r border-slate-100 bg-white px-3 py-6 lg:flex">
      <div className="mb-6 flex items-center gap-2 px-3">
        <img src="/app-icon.svg" alt="" className="h-8 w-8" />
        <span className="text-xl font-bold text-slate-900">맛짱</span>
      </div>

      <div className="flex flex-col gap-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setScreen(t.key)}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ${
              screen === t.key ? "bg-amber-50 text-amber-600" : "text-slate-500 hover:bg-slate-50"
            }`}
          >
            <span className="text-xl">{t.icon}</span>
            {t.label}
            {t.key === "my" && myBadgeCount > 0 && (
              <span className="ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white">
                {myBadgeCount > 99 ? "99+" : myBadgeCount}
              </span>
            )}
          </button>
        ))}
      </div>
    </nav>
  )
}
