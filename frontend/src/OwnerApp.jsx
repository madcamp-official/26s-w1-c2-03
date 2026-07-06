import { useEffect, useState } from "react"
import OwnerDashboardScreen from "./screens/OwnerDashboardScreen"
import OwnerCheckinsScreen from "./screens/OwnerCheckinsScreen"
import StoreRewardsScreen from "./screens/StoreRewardsScreen"
import { getStores } from "./lib/api"

const STATUS_BADGE = {
  pending: { label: "심사중", className: "bg-amber-50 text-amber-600" },
  approved: { label: "승인됨", className: "bg-emerald-50 text-emerald-600" },
  rejected: { label: "반려됨", className: "bg-red-50 text-red-500" },
}

// 사장님 모드 — 카카오로 로그인한 계정이면 누구나 진입 가능.
// "사장님"이라는 별도 자격이 있는 게 아니라, 이 계정(user.id)으로 인증한 매장이 있으면 그게 사장님인 것.
// 매장 자체는 손님 화면에 카카오 데이터로 이미 노출되고 있고, 여기서 하는 "인증"은
// 체크인 승인·리워드 설정 같은 운영 권한을 가져오는 절차일 뿐임.
//   - 인증한 매장이 하나도 없으면 → 매장 인증하기 버튼만
//   - 있으면 → 매장 목록(심사 상태 표시) + 맨 아래 매장 인증하기 버튼 (여러 개 가능)
//   - 매장을 누르면 → 그 매장으로 온 인증 요청 수락/거절 화면
export default function OwnerApp({ user, onExit }) {
  const [stores, setStores] = useState(null) // null = 로딩 중
  const [selectedStore, setSelectedStore] = useState(null)
  const [storeTab, setStoreTab] = useState("checkins") // checkins | rewards — 매장 선택했을 때만 씀
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
    else if (selectedStore) {
      setSelectedStore(null)
      setStoreTab("checkins")
    } else onExit()
  }

  const headerSubtitle = showRegisterForm
    ? "매장 인증"
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
          <div>
            <div className="flex gap-2 px-5 pt-4">
              <button
                onClick={() => setStoreTab("checkins")}
                className={`rounded-full px-4 py-2 text-sm font-medium ${storeTab === "checkins" ? "bg-amber-500 text-white" : "bg-slate-100 text-slate-600"}`}
              >
                인증 요청
              </button>
              <button
                onClick={() => setStoreTab("rewards")}
                className={`rounded-full px-4 py-2 text-sm font-medium ${storeTab === "rewards" ? "bg-amber-500 text-white" : "bg-slate-100 text-slate-600"}`}
              >
                매장 설정
              </button>
            </div>
            {storeTab === "checkins" ? (
              <OwnerCheckinsScreen storeId={selectedStore.id} />
            ) : (
              <StoreRewardsScreen storeId={selectedStore.id} />
            )}
          </div>
        ) : stores === null ? (
          <p className="px-5 py-10 text-center text-sm text-slate-400">불러오는 중...</p>
        ) : stores.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-8 text-center">
            <p className="text-3xl">🏪</p>
            <p className="mt-3 text-slate-500">아직 인증한 매장이 없어요</p>
            <button
              onClick={() => setShowRegisterForm(true)}
              className="mt-6 w-full rounded-xl bg-amber-500 py-3.5 font-semibold text-white"
            >
              매장 인증하기
            </button>
          </div>
        ) : (
          <div className="px-5 py-6">
            <h2 className="mb-3 text-sm font-semibold text-slate-500">내 매장 ({stores.length})</h2>
            <div className="space-y-2">
              {stores.map((s) => {
                const badge = STATUS_BADGE[s.status] || STATUS_BADGE.approved
                return (
                  <button
                    key={s.id}
                    onClick={() => setSelectedStore(s)}
                    className="flex w-full items-center justify-between rounded-2xl border border-slate-100 bg-white p-4 text-left shadow-sm"
                  >
                    <div>
                      <div className="mb-1 flex items-center gap-2">
                        <p className="font-semibold text-slate-900">{s.name}</p>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.className}`}>
                          {badge.label}
                        </span>
                      </div>
                      <p className="text-sm text-slate-500">
                        {(s.categories || []).join(", ")} · {s.address}
                      </p>
                    </div>
                    <span className="text-slate-300">›</span>
                  </button>
                )
              })}
            </div>

            <button
              onClick={() => setShowRegisterForm(true)}
              className="mt-6 w-full rounded-xl border border-dashed border-slate-300 py-3.5 font-medium text-slate-500"
            >
              + 매장 인증하기
            </button>
          </div>
        )}
      </main>
    </div>
  )
}
