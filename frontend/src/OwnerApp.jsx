import { useState } from "react"
import OwnerDashboardScreen from "./screens/OwnerDashboardScreen"
import OwnerCheckinsScreen from "./screens/OwnerCheckinsScreen"
import OwnerBottomNav from "./components/OwnerBottomNav"

// 사장님 대시보드는 손님 로그인과 별개 흐름 (사장님 로그인은 아직 백엔드에 없음 — MVP 임시)
export default function OwnerApp({ onExit }) {
  const [ownerScreen, setOwnerScreen] = useState("register") // register | checkins

  return (
    <div className="mx-auto flex h-[100dvh] max-w-[430px] flex-col bg-white">
      <header className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
        <button onClick={onExit} className="text-2xl text-slate-400">
          ‹
        </button>
        <h1 className="text-lg font-semibold text-slate-900">사장님 모드</h1>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        {ownerScreen === "register" && <OwnerDashboardScreen />}
        {ownerScreen === "checkins" && <OwnerCheckinsScreen />}
      </main>

      <OwnerBottomNav screen={ownerScreen} setScreen={setOwnerScreen} />
    </div>
  )
}
