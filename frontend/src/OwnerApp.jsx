import { useEffect, useState } from "react"
import OwnerDashboardScreen from "./screens/OwnerDashboardScreen"
import OwnerCheckinsScreen from "./screens/OwnerCheckinsScreen"
import { getStores } from "./lib/api"

// 사장님 모드 — 카카오로 로그인한 계정이면 누구나 진입 가능.
// "사장님"이라는 별도 자격이 있는 게 아니라, 이 계정(user.id)으로 등록된 매장이 있으면 그게 사장님인 것.
//   - 매장이 하나도 없으면 → 매장 등록하기 버튼만
//   - 매장이 있으면 → 가게 목록 + 맨 아래 매장 등록하기 버튼 (여러 개 가능)
//   - 가게를 누르면 → 그 가게로 온 인증 요청 수락/거절 화면
export default function OwnerApp({ user, onExit }) {
  const [stores, setStores] = useState(null) // null = 로딩 중
  const [selectedStore, setSelectedStore] = useState(null)
  const [showRegisterForm, setShowRegisterForm] = useState(false)

  const loadStores = () => {
    getStores({ ownerId: user.id })
      .then(setStores)
      .catch(() => setStores([]))
  }

  useEffect(loadStores, [user.id])

  const handleRegistered = () => {
    setShowRegisterForm(false)
    setStores(null)
    loadStores()
  }

  // 뒤로가기: 하위 화면부터 한 단계씩 (등록폼 → 목록 → 아예 종료)
  const handleBack = () => {
    if (showRegisterForm) setShowRegisterForm(false)
    else if (selectedStore) setSelectedStore(null)
    else onExit()
  }

  const headerSubtitle = showRegisterForm
    ? "매장 등록"
    : selectedStore
      ? selectedStore.name
      : "사장님 모드"

  return (
    <div className="mx-auto flex h-[100dvh] max-w-[430px] flex-col bg-white">
      <header className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
        <button onClick={handleBack} className="text-2xl text-slate-400">
          ‹
        </button>
        <div>
          <h1 className="text-lg font-semibold text-slate-900">{headerSubtitle}</h1>
          {!showRegisterForm && !selectedStore && <p className="text-xs text-slate-400">{user.nickname}</p>}
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        {showRegisterForm ? (
          <OwnerDashboardScreen ownerId={user.id} onRegistered={handleRegistered} />
        ) : selectedStore ? (
          <OwnerCheckinsScreen storeId={selectedStore.id} />
        ) : stores === null ? (
          <p className="px-5 py-10 text-center text-sm text-slate-400">불러오는 중...</p>
        ) : stores.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-8 text-center">
            <p className="text-3xl">🏪</p>
            <p className="mt-3 text-slate-500">아직 등록된 매장이 없어요</p>
            <button
              onClick={() => setShowRegisterForm(true)}
              className="mt-6 w-full rounded-xl bg-amber-500 py-3.5 font-semibold text-white"
            >
              매장 등록하기
            </button>
          </div>
        ) : (
          <div className="px-5 py-6">
            <h2 className="mb-3 text-sm font-semibold text-slate-500">내 매장 ({stores.length})</h2>
            <div className="space-y-2">
              {stores.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedStore(s)}
                  className="flex w-full items-center justify-between rounded-2xl border border-slate-100 bg-white p-4 text-left shadow-sm"
                >
                  <div>
                    <p className="font-semibold text-slate-900">{s.name}</p>
                    <p className="text-sm text-slate-500">
                      {s.category} · {s.address}
                    </p>
                  </div>
                  <span className="text-slate-300">›</span>
                </button>
              ))}
            </div>

            <button
              onClick={() => setShowRegisterForm(true)}
              className="mt-6 w-full rounded-xl border border-dashed border-slate-300 py-3.5 font-medium text-slate-500"
            >
              + 매장 등록하기
            </button>
          </div>
        )}
      </main>
    </div>
  )
}
