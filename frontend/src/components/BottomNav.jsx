// 화면 맨 아래 탭 바 (홈 / 지도 / 마이)
export default function BottomNav({ screen, setScreen }) {
  const tabs = [
    { key: "home", label: "홈", icon: "🏠" },
    { key: "map", label: "지도", icon: "🗺️" },
    { key: "my", label: "마이", icon: "🏆" },
  ]

  return (
    <nav className="flex border-t border-slate-100 bg-white">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => setScreen(t.key)}
          className={`flex flex-1 flex-col items-center gap-0.5 py-3 text-xs ${
            screen === t.key ? "text-amber-600" : "text-slate-400"
          }`}
        >
          <span className="text-xl">{t.icon}</span>
          {t.label}
        </button>
      ))}
    </nav>
  )
}
