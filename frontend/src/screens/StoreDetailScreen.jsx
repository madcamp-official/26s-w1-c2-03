// 매장 상세 — 정보 + 내 스탬프 + 방문 랭킹 + 리워드 + 인증 버튼
export default function StoreDetailScreen({ store, onBack, onCheckin }) {
  if (!store) return null

  return (
    <div className="pb-4">
      <header className="flex items-center gap-3 px-5 pt-6 pb-4">
        <button onClick={onBack} className="text-2xl text-slate-400">
          ‹
        </button>
        <h1 className="text-lg font-semibold text-slate-900">매장 정보</h1>
      </header>

      <div className="px-5">
        <div className="flex items-center justify-center rounded-3xl bg-amber-50 py-10 text-6xl">
          {store.image}
        </div>

        <h2 className="mt-4 text-2xl font-bold text-slate-900">{store.name}</h2>
        <p className="text-slate-500">
          {store.category} · {store.address}
        </p>
        <div className="mt-2 flex flex-wrap gap-1">
          {store.keywords.map((k) => (
            <span key={k} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
              #{k}
            </span>
          ))}
        </div>

        {/* 내 스탬프 */}
        <div className="mt-5 rounded-2xl bg-amber-500 p-4 text-white">
          <p className="text-sm opacity-90">내 스탬프</p>
          <p className="text-2xl font-bold">
            {store.myStamps}개
            {store.myRank ? ` · 현재 ${store.myRank}위 🏅` : ""}
          </p>
        </div>

        {/* 방문 랭킹 */}
        <section className="mt-6">
          <h3 className="mb-2 font-semibold text-slate-900">방문 랭킹</h3>
          <div className="space-y-1.5">
            {store.topVisitors.map((v) => (
              <div key={v.rank} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-2.5">
                <span className="text-slate-700">
                  <b className="mr-2 text-amber-600">{v.rank}위</b>
                  {v.nickname}
                </span>
                <span className="text-sm text-slate-400">{v.count}회</span>
              </div>
            ))}
          </div>
        </section>

        {/* 사장님 리워드 */}
        <section className="mt-6">
          <h3 className="mb-2 font-semibold text-slate-900">사장님 리워드 🎁</h3>
          {store.rewards.map((r, i) => (
            <div key={i} className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="font-medium text-amber-800">{r.title}</p>
              <p className="text-sm text-amber-600">{r.desc}</p>
            </div>
          ))}
        </section>
      </div>

      {/* 인증 버튼 */}
      <div className="px-5 pt-6">
        <button
          onClick={onCheckin}
          className="w-full rounded-2xl bg-amber-500 py-4 font-semibold text-white active:bg-amber-600"
        >
          📸 방문 인증하기
        </button>
      </div>
    </div>
  )
}
