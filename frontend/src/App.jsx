import { useState } from "react"
import LoginScreen from "./screens/LoginScreen"
import SignupScreen from "./screens/SignupScreen"
import OwnerSignupScreen from "./screens/OwnerSignupScreen"
import OwnerDashboardScreen from "./screens/OwnerDashboardScreen"
import OwnerCheckinsScreen from "./screens/OwnerCheckinsScreen"
import OwnerBottomNav from "./components/OwnerBottomNav"
import HomeScreen from "./screens/HomeScreen"
import MapScreen from "./screens/MapScreen"
import StoreDetailScreen from "./screens/StoreDetailScreen"
import CheckinScreen from "./screens/CheckinScreen"
import MyPageScreen from "./screens/MyPageScreen"
import BottomNav from "./components/BottomNav"
import { getMyLocation } from "./lib/geo"
import { registerOwner, getOwnerInfo } from "./lib/ownerStore"

// 새로고침해도 로그인 유지되게 localStorage에서 불러옴 (비밀번호는 저장 안 함)
function loadUser() {
  const s = localStorage.getItem("user")
  return s ? JSON.parse(s) : null
}

export default function App() {
  const [user, setUser] = useState(loadUser) // null이면 로그인 안 된 상태
  const [authScreen, setAuthScreen] = useState("login") // login | signup | ownerSignup
  const [ownerMode, setOwnerMode] = useState(false) // 사장님 모드 진입 여부
  const [ownerScreen, setOwnerScreen] = useState("register") // register | checkins

  const [screen, setScreen] = useState("home") // home | map | detail | checkin | my
  const [selectedStore, setSelectedStore] = useState(null)
  const [prevScreen, setPrevScreen] = useState("home")

  // 내 위치는 홈·지도가 함께 사용
  const [myLocation, setMyLocation] = useState(null)
  const [locating, setLocating] = useState(false)

  // --- 인증 (⚠️ 지금은 임시 로그인. 카카오 로그인이 붙으면 이 함수들 내부만 교체) ---
  const saveUser = (u) => {
    setUser(u)
    localStorage.setItem("user", JSON.stringify(u))
  }
  // 로그인 시 이 아이디가 등록된 사장님인지 확인해서 isOwner 부여
  const login = (id) => {
    const owner = getOwnerInfo(id)
    saveUser({ id, nickname: id, isOwner: !!owner, storeName: owner?.storeName || null })
  }
  const signup = (id, nickname) => {
    saveUser({ id, nickname, isOwner: false, storeName: null })
  }
  // 사장님 회원가입: 사장님으로 등록한 뒤 바로 로그인
  const ownerSignup = (id, nickname, storeName) => {
    registerOwner(id, storeName)
    saveUser({ id, nickname, isOwner: true, storeName })
    setAuthScreen("login")
  }
  const logout = () => {
    setUser(null)
    localStorage.removeItem("user")
    setOwnerMode(false)
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

  // 1) 로그인 안 됐으면 로그인/회원가입/사장님가입만
  if (!user) {
    return (
      <div className="mx-auto flex h-[100dvh] max-w-[430px] flex-col bg-white">
        {authScreen === "login" && (
          <LoginScreen onLogin={login} goSignup={() => setAuthScreen("signup")} />
        )}
        {authScreen === "signup" && (
          <SignupScreen onSignup={signup} goLogin={() => setAuthScreen("login")} />
        )}
        {authScreen === "ownerSignup" && (
          <OwnerSignupScreen onOwnerSignup={ownerSignup} goLogin={() => setAuthScreen("login")} />
        )}

        {authScreen !== "ownerSignup" && (
          <button
            onClick={() => setAuthScreen("ownerSignup")}
            className="pb-6 text-center text-xs text-slate-400 underline"
          >
            사장님이신가요? 사장님으로 회원가입
          </button>
        )}
      </div>
    )
  }

  // 2) 로그인 됐고 + 사장님 모드 진입 (등록된 사장님만 진입 가능)
  if (ownerMode && user.isOwner) {
    return (
      <div className="mx-auto flex h-[100dvh] max-w-[430px] flex-col bg-white">
        <header className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
          <button onClick={() => setOwnerMode(false)} className="text-2xl text-slate-400">
            ‹
          </button>
          <div>
            <h1 className="text-lg font-semibold text-slate-900">사장님 모드</h1>
            <p className="text-xs text-slate-400">{user.storeName}</p>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">
          {ownerScreen === "register" && <OwnerDashboardScreen />}
          {ownerScreen === "checkins" && <OwnerCheckinsScreen storeName={user.storeName} />}
        </main>

        <OwnerBottomNav screen={ownerScreen} setScreen={setOwnerScreen} />
      </div>
    )
  }

  // 3) 일반 앱 (손님 화면)
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
        {screen === "my" && (
          <MyPageScreen
            user={user}
            onLogout={logout}
            onEnterOwnerMode={user.isOwner ? () => setOwnerMode(true) : null}
          />
        )}
      </main>

      <BottomNav screen={screen} setScreen={setScreen} />
    </div>
  )
}
