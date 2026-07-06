import { useEffect, useRef, useState } from "react"
import HomeScreen from "./screens/HomeScreen"
import MapScreen from "./screens/MapScreen"
import StoreDetailScreen from "./screens/StoreDetailScreen"
import CheckinScreen from "./screens/CheckinScreen"
import MyPageScreen from "./screens/MyPageScreen"
import UserProfileScreen from "./screens/UserProfileScreen"
import BottomNav from "./components/BottomNav"
import { getMyLocation } from "./lib/geo"
import { loginWithKakao, loginWithGoogle } from "./lib/api"

function loadUser() {
  const s = localStorage.getItem("user")
  return s ? JSON.parse(s) : null
}

export default function CustomerApp({ onGoOwner }) {
  const [user, setUser] = useState(loadUser)
  const [authError, setAuthError] = useState(null)
  const [authLoading, setAuthLoading] = useState(false) // 카카오/구글 로그인 공용 로딩 상태
  const handledAuthCode = useRef(false) // StrictMode에서 이펙트가 2번 도는 것 방지

  const [screen, setScreen] = useState("home")
  const [selectedStore, setSelectedStore] = useState(null)
  const [prevScreen, setPrevScreen] = useState("home") // 매장 상세에서 뒤로가기 시 돌아갈 곳(홈/지도)
  const [checkinReturnTo, setCheckinReturnTo] = useState("detail") // 인증 화면에서 뒤로가기 시 돌아갈 곳
  const [selectedProfileUser, setSelectedProfileUser] = useState(null) // 방문 랭킹에서 클릭한 유저

  const [myLocation, setMyLocation] = useState(null)
  const [locating, setLocating] = useState(false)

  const saveUser = (u) => {
    setUser(u)
    localStorage.setItem("user", JSON.stringify(u))
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

  // 카카오/구글 로그인 후 리다이렉트되어 돌아왔을 때 (?code=...&state=kakao|google 처리)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get("code")
    const state = params.get("state")
    const oauthError = params.get("error")

    if (oauthError) {
      setAuthError("로그인이 취소되었어요.")
      window.history.replaceState({}, "", window.location.pathname)
      return
    }

    if (code && !handledAuthCode.current) {
      handledAuthCode.current = true
      setAuthLoading(true)
      const login = state === "google" ? loginWithGoogle : loginWithKakao
      login({ code, redirectUri: window.location.origin })
        .then((u) => saveUser(u))
        .catch((err) => setAuthError(err.message))
        .finally(() => {
          setAuthLoading(false)
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
    window.Kakao.Auth.authorize({ redirectUri: window.location.origin, state: "kakao" })
  }

  // 구글은 별도 SDK 없이 OAuth 2.0 authorization code 플로우로 직접 리다이렉트
  const startGoogleLogin = () => {
    setAuthError(null)
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
    if (!clientId) {
      setAuthError("VITE_GOOGLE_CLIENT_ID가 설정되지 않았어요 (frontend/.env 확인)")
      return
    }
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: window.location.origin,
      response_type: "code",
      scope: "openid email profile",
      state: "google",
    })
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
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

  // 매장 상세를 거쳐서 인증하러 갈 때
  const openCheckinFromDetail = () => {
    setCheckinReturnTo("detail")
    setScreen("checkin")
  }

  // 마이페이지의 "내가 방문한 곳"에서 바로 인증하러 갈 때 (상세 화면 건너뜀)
  const openCheckinDirect = (store) => {
    setSelectedStore(store)
    setCheckinReturnTo("my")
    setScreen("checkin")
  }

  // 매장 상세의 방문 랭킹에서 다른 유저 프로필(획득 뱃지) 보러 갈 때
  const openProfile = (rankingEntry) => {
    setSelectedProfileUser(rankingEntry)
    setScreen("profile")
  }

  const locateMe = async () => {
    setLocating(true)
    const loc = await getMyLocation()
    setMyLocation(loc)
    setLocating(false)
    return loc
  }

  // 로그인은 카카오/구글 둘 중 하나 (아이디/비번 로그인은 더 이상 노출 안 함)
  if (!user) {
    return (
      <div className="mx-auto flex h-[100dvh] max-w-[430px] flex-col items-center justify-center bg-white px-8">
        <img src="/app-icon.svg" alt="맛짱" className="mb-4 h-24 w-24" />
        <h1 className="text-3xl font-bold text-slate-900">맛짱</h1>
        <p className="mb-10 text-sm font-medium tracking-widest text-amber-500">MATZZANG</p>

        {authError && (
          <p className="mb-4 w-full rounded-xl bg-red-50 px-4 py-3 text-center text-sm text-red-500">
            {authError}
          </p>
        )}

        <button
          onClick={startKakaoLogin}
          disabled={authLoading}
          className="mb-2 w-full rounded-xl bg-[#FEE500] py-3.5 text-sm font-semibold text-[#191919] shadow-sm"
        >
          {authLoading ? "로그인 처리 중..." : "💬 카카오로 시작하기"}
        </button>

        <button
          onClick={startGoogleLogin}
          disabled={authLoading}
          className="w-full rounded-xl border border-slate-200 bg-white py-3.5 text-sm font-semibold text-slate-700 shadow-sm"
        >
          {authLoading ? "로그인 처리 중..." : "🔍 구글로 시작하기"}
        </button>
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
            onCheckin={openCheckinFromDetail}
            onSelectProfile={openProfile}
          />
        )}
        {screen === "profile" && (
          <UserProfileScreen profileUser={selectedProfileUser} onBack={() => setScreen("detail")} />
        )}
        {screen === "checkin" && (
          <CheckinScreen
            store={selectedStore}
            user={user}
            onBack={() => setScreen(checkinReturnTo)}
            onDone={() => setScreen(checkinReturnTo === "my" ? "my" : "home")}
          />
        )}
        {screen === "my" && (
          <MyPageScreen
            user={user}
            onLogout={logout}
            onEnterOwnerMode={() => onGoOwner(user)}
            onSendPhoto={openCheckinDirect}
          />
        )}
      </main>

      <BottomNav screen={screen} setScreen={setScreen} />
    </div>
  )
}
