import { useEffect, useRef, useState } from "react"
import LoginScreen from "./screens/LoginScreen"
import SignupScreen from "./screens/SignupScreen"
import OwnerSignupScreen from "./screens/OwnerSignupScreen"
import HomeScreen from "./screens/HomeScreen"
import MapScreen from "./screens/MapScreen"
import StoreDetailScreen from "./screens/StoreDetailScreen"
import CheckinScreen from "./screens/CheckinScreen"
import MyPageScreen from "./screens/MyPageScreen"
import BottomNav from "./components/BottomNav"
import { getMyLocation } from "./lib/geo"
import { loginUser, signupUser, loginWithKakao } from "./lib/api"
import { registerOwner, getOwnerInfo } from "./lib/ownerStore"

function loadUser() {
  const s = localStorage.getItem("user")
  return s ? JSON.parse(s) : null
}

// 실제 백엔드 user에 "이 계정이 사장님인지"를 덧붙임 (로그인 방식과 무관하게 user.id로 확인)
function attachOwnerInfo(user) {
  const owner = getOwnerInfo(user.id)
  return { ...user, isOwner: !!owner, storeName: owner?.storeName || null }
}

export default function CustomerApp({ onGoOwner }) {
  const [user, setUser] = useState(loadUser)
  const [authScreen, setAuthScreen] = useState("login") // login | signup | ownerSignup
  const [authError, setAuthError] = useState(null)
  const [kakaoLoading, setKakaoLoading] = useState(false)
  const handledKakaoCode = useRef(false) // StrictMode에서 이펙트가 2번 도는 것 방지

  const [screen, setScreen] = useState("home")
  const [selectedStore, setSelectedStore] = useState(null)
  const [prevScreen, setPrevScreen] = useState("home")

  const [myLocation, setMyLocation] = useState(null)
  const [locating, setLocating] = useState(false)

  const saveUser = (u) => {
    const withOwner = attachOwnerInfo(u)
    setUser(withOwner)
    localStorage.setItem("user", JSON.stringify(withOwner))
  }

  // 카카오 JS SDK 초기화 (스크립트는 index.html 에서 로드됨)
  // ⚠️ VITE_KAKAO_JS_KEY가 없는 상태에서 Kakao.init(undefined)를 부르면 SDK 내부에서
  //    예외가 터져 앱 전체가 하얗게 죽어버림 → 키가 있을 때만 초기화하고, 없으면 경고만 남김.
  useEffect(() => {
    const kakaoKey = import.meta.env.VITE_KAKAO_JS_KEY
    if (!window.Kakao) return
    if (!kakaoKey) {
      console.warn("VITE_KAKAO_JS_KEY가 설정되지 않아 카카오 로그인을 사용할 수 없어요 (frontend/.env 확인)")
      return
    }
    if (!window.Kakao.isInitialized()) {
      window.Kakao.init(kakaoKey)
    }
  }, [])

  // 카카오 로그인 후 리다이렉트되어 돌아왔을 때 (?code=... 처리)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get("code")
    const kakaoAuthError = params.get("error")

    if (kakaoAuthError) {
      setAuthError("카카오 로그인이 취소되었어요.")
      window.history.replaceState({}, "", window.location.pathname)
      return
    }

    if (code && !handledKakaoCode.current) {
      handledKakaoCode.current = true
      setKakaoLoading(true)
      loginWithKakao({ code, redirectUri: window.location.origin })
        .then((u) => saveUser(u))
        .catch((err) => setAuthError(err.message))
        .finally(() => {
          setKakaoLoading(false)
          window.history.replaceState({}, "", window.location.pathname)
        })
    }
  }, [])

  const startKakaoLogin = () => {
    setAuthError(null)
    if (!window.Kakao) {
      setAuthError("카카오 SDK를 불러오지 못했어요. index.html을 확인해주세요.")
      return
    }
    window.Kakao.Auth.authorize({ redirectUri: window.location.origin })
  }

  // --- 기존 간단 로그인 (백업용으로 유지) ---
  const login = async (id) => {
    setAuthError(null)
    try {
      const u = await loginUser({ loginId: id })
      saveUser(u)
    } catch (err) {
      setAuthError(err.message)
    }
  }

  const signup = async (id, nickname) => {
    setAuthError(null)
    try {
      const u = await signupUser({ loginId: id, nickname })
      saveUser(u)
    } catch (err) {
      setAuthError(err.message)
    }
  }

  // 사장님 회원가입: 실제 계정 생성 + 이 계정을 사장님으로 등록 → 바로 로그인
  const ownerSignup = (newUser, storeName) => {
    registerOwner(newUser.id, storeName)
    saveUser(newUser)
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

  if (!user) {
    return (
      <div className="mx-auto flex h-[100dvh] max-w-[430px] flex-col bg-white">
        {authError && (
          <p className="bg-red-50 px-5 py-2 text-center text-sm text-red-500">{authError}</p>
        )}

        {authScreen !== "ownerSignup" && (
          <div className="px-5 pt-8">
            <button
              onClick={startKakaoLogin}
              disabled={kakaoLoading}
              className="w-full rounded-xl bg-[#FEE500] py-3 text-sm font-semibold text-[#191919] shadow-sm"
            >
              {kakaoLoading ? "로그인 처리 중..." : "💬 카카오로 시작하기"}
            </button>

            <div className="my-4 flex items-center gap-3 text-xs text-slate-400">
              <div className="h-px flex-1 bg-slate-200" />
              또는
              <div className="h-px flex-1 bg-slate-200" />
            </div>
          </div>
        )}

        {authScreen === "login" && (
          <LoginScreen
            onLogin={login}
            goSignup={() => setAuthScreen("signup")}
            goOwner={() => setAuthScreen("ownerSignup")}
          />
        )}
        {authScreen === "signup" && (
          <SignupScreen onSignup={signup} goLogin={() => setAuthScreen("login")} />
        )}
        {authScreen === "ownerSignup" && (
          <OwnerSignupScreen onOwnerSignup={ownerSignup} goLogin={() => setAuthScreen("login")} />
        )}
      </div>
    )
  }

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
            user={user}
            onBack={() => setScreen("detail")}
            onDone={() => setScreen("home")}
          />
        )}
        {screen === "my" && (
          <MyPageScreen
            user={user}
            onLogout={logout}
            onEnterOwnerMode={user.isOwner ? () => onGoOwner(user.storeName) : null}
          />
        )}
      </main>

      <BottomNav screen={screen} setScreen={setScreen} />
    </div>
  )
}
