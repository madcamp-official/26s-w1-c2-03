import { useEffect, useRef, useState } from "react"
import HomeScreen from "./screens/HomeScreen"
import MapScreen from "./screens/MapScreen"
import StoreDetailScreen from "./screens/StoreDetailScreen"
import CheckinScreen from "./screens/CheckinScreen"
import MyPageScreen from "./screens/MyPageScreen"
import UserProfileScreen from "./screens/UserProfileScreen"
import NicknameSetupScreen from "./screens/NicknameSetupScreen"
import EditProfileScreen from "./screens/EditProfileScreen"
import DeleteAccountScreen from "./screens/DeleteAccountScreen"
import BottomNav from "./components/BottomNav"
import SideNav from "./components/SideNav"
import { getMyLocation } from "./lib/geo"
import { loginWithKakao, loginWithGoogle, loginWithNaver, loginAsAdmin, getStores, getCheckins, resolveStore, getPlaceImage } from "./lib/api"

function loadUser() {
  const s = localStorage.getItem("user")
  return s ? JSON.parse(s) : null
}

export default function CustomerApp({ onGoOwner }) {
  const [user, setUser] = useState(loadUser)
  const [needsOnboarding, setNeedsOnboarding] = useState(false)
  const [authError, setAuthError] = useState(null)
  const [authLoading, setAuthLoading] = useState(false) // 카카오/구글/네이버 로그인 공용 로딩 상태
  const handledAuthCode = useRef(false) // StrictMode에서 이펙트가 2번 도는 것 방지

  // 관리자 로그인 — 매장 등록 없이 테스트하기 위한 용도 (소셜 로그인 화면 맨 아래 작은 링크로만 노출)
  const [showAdminLogin, setShowAdminLogin] = useState(false)
  const [adminKeyInput, setAdminKeyInput] = useState("")
  const [adminLoginLoading, setAdminLoginLoading] = useState(false)

  const [screen, setScreen] = useState("home")
  const [selectedStore, setSelectedStore] = useState(null)
  const [prevScreen, setPrevScreen] = useState("home") // 매장 상세에서 뒤로가기 시 돌아갈 곳(홈/지도/마이)
  const [selectedProfileUser, setSelectedProfileUser] = useState(null) // 방문 랭킹에서 클릭한 유저

  const [myLocation, setMyLocation] = useState(null)
  const [locating, setLocating] = useState(false)

  const [pendingRequestCount, setPendingRequestCount] = useState(0) // 내 매장(들)에 온 미확인 인증 요청 개수 — 마이 탭 뱃지용

  // 로그인 응답은 세션 토큰을 포함하지만, 프로필 수정/닉네임 설정 응답(updateProfile)은 유저 행만
  // 돌려주고 토큰이 없음 — 그대로 덮어쓰면 session_token이 사라져서 다음 요청부터 401 나고
  // 로그아웃 후 재로그인해야 하는 문제가 있었음. 기존 값과 병합해서 토큰이 유지되게 함.
  const saveUser = (u) => {
    setUser((prev) => {
      const merged = { ...prev, ...u }
      localStorage.setItem("user", JSON.stringify(merged))
      return merged
    })
  }

  const handleAdminLogin = async () => {
    if (!adminKeyInput.trim()) return
    setAdminLoginLoading(true)
    setAuthError(null)
    try {
      const u = await loginAsAdmin(adminKeyInput.trim())
      saveUser(u)
    } catch (err) {
      setAuthError(err.message || "관리자 로그인에 실패했어요.")
    } finally {
      setAdminLoginLoading(false)
    }
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

  // 카카오/구글/네이버 로그인 후 리다이렉트되어 돌아왔을 때 (?code=...&state=kakao|google|naver 처리)
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
      const login =
        state === "google" ? loginWithGoogle : state === "naver" ? (args) => loginWithNaver({ ...args, state }) : loginWithKakao
      login({ code, redirectUri: window.location.origin })
        .then((u) => {
          saveUser(u)
          if (u.is_new) setNeedsOnboarding(true)
        })
        .catch((err) => setAuthError(err.message))
        .finally(() => {
          setAuthLoading(false)
          window.history.replaceState({}, "", window.location.pathname)
        })
    }
  }, [])

  // 이 계정이 매장을 등록해둔 사장님이면, 그 매장(들)에 온 미확인(대기 중) 인증 요청 개수를 세서
  // 마이 탭에 카카오톡 알림처럼 빨간 뱃지로 보여줌
  useEffect(() => {
    if (!user) return
    let cancelled = false
    getStores({ ownerId: user.id })
      .then((myStores) =>
        Promise.all(myStores.map((s) => getCheckins({ storeId: s.id, status: "pending" })))
      )
      .then((lists) => {
        if (cancelled) return
        setPendingRequestCount(lists.reduce((sum, l) => sum + l.length, 0))
      })
      .catch(() => setPendingRequestCount(0))
    return () => {
      cancelled = true
    }
  }, [user?.id, screen])

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

  // 네이버도 구글과 동일한 방식(별도 SDK 없이 직접 리다이렉트)
  const startNaverLogin = () => {
    setAuthError(null)
    const clientId = import.meta.env.VITE_NAVER_CLIENT_ID
    if (!clientId) {
      setAuthError("VITE_NAVER_CLIENT_ID가 설정되지 않았어요 (frontend/.env 확인)")
      return
    }
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: window.location.origin,
      response_type: "code",
      state: "naver",
    })
    window.location.href = `https://nid.naver.com/oauth2.0/authorize?${params.toString()}`
  }

  const logout = () => {
    setUser(null)
    localStorage.removeItem("user")
    setScreen("home")
  }

  // 홈/지도에서 고른 매장(카카오 데이터일 수도, 이미 우리 DB에 있는 매장일 수도 있음)을 열람.
  // resolveStore가 kakao_place_id 기준으로 있으면 그대로, 없으면 미인증 상태로 만들어서
  // 체크인·랭킹·뱃지가 사장님 인증 여부와 무관하게 바로 동작하게 함.
  const openStore = async (place) => {
    if (screen === "home" || screen === "map") setPrevScreen(screen)
    // 홈은 목록 썸네일을 미리 받아와서 place.image_url이 채워져 있지만, 지도 핀에서 온 경우엔 비어 있음.
    // 그럴 땐 여기서 카카오맵 대표 이미지를 한 장 받아와, 홈/지도 어느 쪽에서 열든 상세가 동일하게 사진을 갖게 함.
    let imageUrl = place.image_url
    if (!imageUrl && place.place_url) {
      imageUrl = await getPlaceImage(place.place_url)
        .then((r) => r.image_url)
        .catch(() => null)
    }
    const store = await resolveStore({
      kakaoPlaceId: place.kakao_place_id,
      name: place.name,
      address: place.address,
      lat: place.lat,
      lng: place.lng,
      imageUrl,
      category: place.category,
    })
    // resolve된 DB 행엔 카테고리가 없을 수 있어서, 카카오에서 뽑은 대분류를 상세 표시용으로 실어줌
    setSelectedStore({ ...store, category: store.categories?.length ? undefined : place.category })
    setScreen("detail")
  }

  // 매장 상세를 거쳐서 인증하러 갈 때 (체크인 화면은 항상 상세 화면을 거쳐서만 들어옴)
  const openCheckinFromDetail = () => {
    setScreen("checkin")
  }

  // 마이페이지의 "내가 방문한 곳"에서 매장 상세로 이동할 때 — 이미 우리 DB 매장이라 resolve 필요 없음
  const openStoreFromMy = (store) => {
    setPrevScreen("my")
    setSelectedStore(store)
    setScreen("detail")
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

  // 로그인은 카카오/구글/네이버 중 하나 (아이디/비번 로그인은 더 이상 노출 안 함)
  // md 이상(태블릿/PC)에서는 회색 배경 위에 카드 형태로 중앙 배치
  if (!user) {
    return (
      <div className="min-h-[100dvh] bg-white md:flex md:items-center md:justify-center md:bg-slate-100 md:py-10">
        <div className="mx-auto flex h-[100dvh] w-full max-w-[430px] flex-col items-center justify-center bg-white px-8 md:h-auto md:max-w-md md:rounded-3xl md:border md:border-slate-200 md:py-14 md:shadow-xl">
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
            className="mb-2 w-full rounded-xl border border-slate-200 bg-white py-3.5 text-sm font-semibold text-slate-700 shadow-sm"
          >
            {authLoading ? "로그인 처리 중..." : "🔍 구글로 시작하기"}
          </button>

          <button
            onClick={startNaverLogin}
            disabled={authLoading}
            className="w-full rounded-xl bg-[#03C75A] py-3.5 text-sm font-semibold text-white shadow-sm"
          >
            {authLoading ? "로그인 처리 중..." : "N 네이버로 시작하기"}
          </button>

          {/* 관리자 로그인 — 매장 등록 없이 체크인 승인/리워드 관리를 테스트하기 위한 용도 */}
          {showAdminLogin ? (
            <div className="mt-4 w-full">
              <div className="flex gap-2">
                <input
                  type="password"
                  value={adminKeyInput}
                  onChange={(e) => setAdminKeyInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAdminLogin()}
                  placeholder="관리자 키"
                  autoFocus
                  className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-amber-400"
                />
                <button
                  onClick={handleAdminLogin}
                  disabled={adminLoginLoading || !adminKeyInput.trim()}
                  className="rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white disabled:bg-slate-200"
                >
                  {adminLoginLoading ? "확인 중..." : "입장"}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowAdminLogin(true)}
              className="mt-4 text-xs text-slate-300 underline"
            >
              관리자로 로그인
            </button>
          )}
        </div>
      </div>
    )
  }

  // 방금 소셜로 처음 가입한 유저 — 닉네임/프로필 사진 설정 먼저
  if (needsOnboarding) {
    return (
      <div className="min-h-[100dvh] bg-white md:flex md:items-center md:justify-center md:bg-slate-100 md:py-10">
        <div className="mx-auto flex h-[100dvh] w-full max-w-[430px] flex-col bg-white md:h-auto md:max-w-md md:rounded-3xl md:border md:border-slate-200 md:py-10 md:shadow-xl">
          <NicknameSetupScreen user={user} onDone={(updatedUser) => { saveUser(updatedUser); setNeedsOnboarding(false) }} />
        </div>
      </div>
    )
  }

  // 폰: 430px 카드 그대로 / 태블릿 세로(md): 하단 탭바 유지하되 카드 폭만 넉넉하게 / lg 이상: 왼쪽 SideNav + 넓은 본문
  return (
    <div className="min-h-[100dvh] bg-white md:flex md:items-center md:justify-center md:bg-slate-100 md:py-8">
      <div className="mx-auto flex h-[100dvh] w-full max-w-[430px] flex-col bg-white md:h-[92vh] md:max-w-2xl md:overflow-hidden md:rounded-3xl md:border md:border-slate-200 md:shadow-xl lg:h-[90vh] lg:max-w-6xl lg:flex-row xl:max-w-7xl 2xl:max-w-[1600px]">
        <SideNav screen={screen} setScreen={setScreen} myBadgeCount={pendingRequestCount} />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">
            {screen === "home" && (
              <HomeScreen onSelectStore={openStore} myLocation={myLocation} locating={locating} onLocate={locateMe} user={user} />
            )}
            {screen === "map" && (
              <MapScreen onSelectStore={openStore} myLocation={myLocation} locating={locating} onLocate={locateMe} user={user} />
            )}
            {screen === "detail" && (
              <StoreDetailScreen
                store={selectedStore}
                user={user}
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
                onBack={() => setScreen("detail")}
                onDone={() => setScreen("home")}
              />
            )}
            {screen === "my" && (
              <MyPageScreen
                user={user}
                onLogout={logout}
                onEnterOwnerMode={() => onGoOwner(user)}
                onOpenStore={openStoreFromMy}
                onEditProfile={() => setScreen("editProfile")}
                onDeleteAccount={() => setScreen("deleteAccount")}
              />
            )}
            {screen === "editProfile" && (
              <EditProfileScreen
                user={user}
                onBack={() => setScreen("my")}
                onDone={(updatedUser) => { saveUser(updatedUser); setScreen("my") }}
              />
            )}
            {screen === "deleteAccount" && (
              <DeleteAccountScreen user={user} onBack={() => setScreen("my")} onDeleted={logout} />
            )}
          </main>

          <BottomNav screen={screen} setScreen={setScreen} myBadgeCount={pendingRequestCount} />
        </div>
      </div>
    </div>
  )
}