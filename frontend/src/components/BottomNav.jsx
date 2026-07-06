// 화면 맨 아래 탭 바 (홈 / 지도 / 마이) — lg 이상(PC/태블릿 가로)에서는 SideNav가 대신 보이므로 숨김
// myBadgeCount: 내 매장에 온 미확인 인증 요청 개수 — 0보다 크면 "마이" 탭에 카카오톡 알림처럼 빨간 뱃지 표시
export default function BottomNav({ screen, setScreen, myBadgeCount = 0 }) {
  const tabs = [
    { key: "home", label: "홈", icon: "🏠" },
    { key: "map", label: "지도", icon: "🗺️" },
    { key: "my", label: "마이", icon: "🏆" },
  ]

  return (
    <nav className="flex border-t border-slate-100 bg-white lg:hidden">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => setScreen(t.key)}
          className={`flex flex-1 flex-col items-center gap-0.5 py-3 text-xs ${
            screen === t.key ? "text-amber-600" : "text-slate-400"
          }`}
        >
          <span className="relative text-xl">
            {t.icon}
            {t.key === "my" && myBadgeCount > 0 && (
              <span className="absolute -right-2 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
                {myBadgeCount > 99 ? "99+" : myBadgeCount}
              </span>
            )}
          </span>
          {t.label}
        </button>
      ))}
    </nav>
  )
}
