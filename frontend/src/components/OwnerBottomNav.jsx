// 사장님 모드 하단 탭 (매장 등록 / 인증 수락)
export default function OwnerBottomNav({ screen, setScreen }) {
  const tabs = [
    { key: "register", label: "매장 등록", icon: "🏪" },
    { key: "checkins", label: "인증 수락", icon: "✅" },
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
