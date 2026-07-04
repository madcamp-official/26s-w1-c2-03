import { useState } from "react"
import OwnerDashboardScreen from "./screens/OwnerDashboardScreen"
import OwnerCheckinsScreen from "./screens/OwnerCheckinsScreen"
import OwnerBottomNav from "./components/OwnerBottomNav"

// 사장님 대시보드는 손님 로그인과 별개 흐름.
// CustomerApp에서 로그인된 "등록된 사장님"만 storeName을 들고 여기로 넘어올 수 있음 (App.jsx 참고).
export default function OwnerApp({ storeName, onExit }) {
  const [ownerScreen, setOwnerScreen] = useState("register") // register | checkins

  return (
    <div className="mx-auto flex h-[100dvh] max-w-[430px] flex-col bg-white">
      <header className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
        <button onClick={onExit} className="text-2xl text-slate-400">
          ‹
        </button>
        <div>
          <h1 className="text-lg font-semibold text-slate-900">사장님 모드</h1>
          {storeName && <p className="text-xs text-slate-400">{storeName}</p>}
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        {ownerScreen === "register" && <OwnerDashboardScreen />}
        {ownerScreen === "checkins" && <OwnerCheckinsScreen storeName={storeName} />}
      </main>

      <OwnerBottomNav screen={ownerScreen} setScreen={setOwnerScreen} />
    </div>
  )
}
