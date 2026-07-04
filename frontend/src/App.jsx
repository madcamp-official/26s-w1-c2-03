import { useState } from "react"
import LoginScreen from "./screens/LoginScreen"
import SignupScreen from "./screens/SignupScreen"
import OwnerDashboardScreen from "./screens/OwnerDashboardScreen"
import HomeScreen from "./screens/HomeScreen"
import MapScreen from "./screens/MapScreen"
import StoreDetailScreen from "./screens/StoreDetailScreen"
import CheckinScreen from "./screens/CheckinScreen"
import MyPageScreen from "./screens/MyPageScreen"
import BottomNav from "./components/BottomNav"
import { getMyLocation } from "./lib/geo"

// 새로고침해도 로그인 유지되게 localStorage에서 불러옴 (비밀번호는 저장 안 함)
function loadUser() {
  const s = localStorage.getItem("user")
  return s ? JSON.parse(s) : null
}

export default function App() {
  const [user, setUser] = useState(loadUser) // null이면 로그인 안 된 상태
  const [authScreen, setAuthScreen] = useState("login") // login | signup
  const [ownerMode, setOwnerMode] = useState(false) // 사장님 대시보드 진입 여부

  const [screen, setScreen] = useState("home") // home | map | detail | checkin | my
  const [selectedStore, setSelectedStore] = useState(null)
  const [prevScreen, setPrevScreen] = useState("home")

  // 내 위치는 홈·지도가 함께 사용
  const [myLocation, setMyLocation] = useState(null)
  const [locating, setLocating] = useState(false)

  // --- 인증 ---
  const login = (id) => {
    const u = { id, nickname: id }
    setUser(u)
    localStorage.setItem("user", JSON.stringify(u))
  }
  const signup = (id, nickname) => {
    const u = { id, nickname }
    setUser(u)
    localStorage.setItem("user", JSON.stringify(u))
  }
  const logout = () => {
    setUser(null)
    localStorage.removeItem("user")
    setScreen("home")
  }

  const openStore = (store) => {
    if (screen === "home" || screen === "map") setPrevScreen(screen)
    setSelectedStore(store)
    setScreen("detail")
  }

  const locateMe = async () => {
    setLocating(true)
    const loc = await getMyLocation()
    setMyLocation(loc)
    setLocating(false)
    return loc
  }

  // 사장님 대시보드는 손님 로그인과 별개 흐름 (사장님 로그인은 아직 백엔드에 없음 — MVP 임시)
  if (ownerMode) {
    return <OwnerDashboardScreen onBack={() => setOwnerMode(false)} />
  }

  // 로그인 안 됐으면 로그인/회원가입만 보여줌
  if (!user) {
    return (
      <div className="mx-auto flex h-[100dvh] max-w-[430px] flex-col bg-white">
        {authScreen === "login" ? (
          <LoginScreen onLogin={login} goSignup={() => setAuthScreen("signup")} />
        ) : (
          <SignupScreen onSignup={signup} goLogin={() => setAuthScreen("login")} />
        )}
        <button
          onClick={() => setOwnerMode(true)}
          className="pb-6 text-center text-xs text-slate-400 underline"
        >
          사장님이신가요? 매장 등록하기
        </button>
      </div>
    )
  }

  // 로그인 됐으면 앱 본체
  return (
    <div className="mx-auto flex h-[100dvh] max-w-[430px] flex-col bg-white">
      <main className="min-h-0 flex-1 overflow-y-auto">
        {screen === "home" && (
          <HomeScreen onSelectStore={openStore} myLocation={myLocation} locating={locating} onLocate={locateMe} />
        )}
        {screen === "map" && (
          <MapScreen onSelectStore={openStore} myLocation={myLocation} locating={locating} onLocate={locateMe} />
        )}
        {screen === "detail" && (
          <StoreDetailScreen
            store={selectedStore}
            onBack={() => setScreen(prevScreen)}
            onCheckin={() => setScreen("checkin")}
          />
        )}
        {screen === "checkin" && (
          <CheckinScreen
            store={selectedStore}
            onBack={() => setScreen("detail")}
            onDone={() => setScreen("home")}
          />
        )}
        {screen === "my" && <MyPageScreen user={user} onLogout={logout} />}
      </main>

      <BottomNav screen={screen} setScreen={setScreen} />
    </div>
  )
}
