import { currentUser, badges, stores } from "../data/mockData"

// 마이 — 프로필 + 뱃지 + 방문 기록 (정복 지도)
export default function MyPageScreen({ user, onLogout }) {
  const visited = stores
    .filter((s) => s.myStamps > 0)
    .sort((a, b) => b.myStamps - a.myStamps)

  const nickname = user?.nickname ?? currentUser.nickname

  return (
    <div className="pb-4">
      <header className="px-5 pt-6 pb-4">
        <h1 className="text-2xl font-bold text-slate-900">내 정복 지도 🏆</h1>
      </header>

      <div className="px-5">
        {/* 프로필 */}
        <div className="flex items-center gap-4 rounded-2xl bg-slate-900 p-5 text-white">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-500 text-2xl">
            😋
          </div>
          <div>
            <p className="text-lg font-bold">{nickname}</p>
            <p className="text-sm text-slate-300">총 스탬프 {currentUser.totalStamps}개</p>
          </div>
        </div>

        {/* 뱃지 */}
        <section className="mt-6">
          <h3 className="mb-3 font-semibold text-slate-900">내 뱃지</h3>
          <div className="grid grid-cols-4 gap-3">
            {badges.map((b) => (
              <div
                key={b.id}
                className={`flex flex-col items-center gap-1 rounded-2xl p-3 ${
                  b.earned ? "bg-amber-50" : "bg-slate-50 opacity-40"
                }`}
              >
                <span className="text-3xl">{b.icon}</span>
                <span className="text-center text-[11px] leading-tight text-slate-600">{b.name}</span>
              </div>
            ))}
          </div>
        </section>

        {/* 많이 방문한 곳 */}
        <section className="mt-6">
          <h3 className="mb-3 font-semibold text-slate-900">많이 방문한 곳</h3>
          <div className="space-y-2">
            {visited.map((s) => (
              <div key={s.id} className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3">
                <span className="text-xl">{s.image}</span>
                <span className="flex-1 font-medium text-slate-800">{s.name}</span>
                <span className="text-sm text-slate-400">{s.myStamps}회</span>
              </div>
            ))}
          </div>
        </section>

        {/* 로그아웃 */}
        <button
          onClick={onLogout}
          className="mt-6 w-full rounded-xl border border-slate-200 py-3 text-sm font-medium text-slate-500"
        >
          로그아웃
        </button>
      </div>
    </div>
  )
}
