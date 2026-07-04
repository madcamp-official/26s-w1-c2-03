import { useState } from "react"
import CustomerApp from "./CustomerApp"
import OwnerApp from "./OwnerApp"
import AdminBadgeScreen from "./screens/AdminBadgeScreen"

// 손님 화면(CustomerApp)과 사장님 화면(OwnerApp)을 오가는 최상위 라우터.
// 사장님 모드는 카카오로 로그인한 계정이면 누구나 들어갈 수 있음 — 매장을 등록해야 "사장님"이 되는 구조.
// (MyPageScreen의 "사장님 모드로 전환" 버튼 → onGoOwner(user) 호출)
//
// 관리자 페이지는 손님 화면과 완전히 분리된 별도 도구라 주소(/admin)로만 들어감
// (일반 사용자 UI 어디에도 링크를 안 둠 — 나중에 관리자 로그인이 필요해지면 여기서 게이팅 추가).
export default function App() {
  const [ownerUser, setOwnerUser] = useState(null) // 사장님 모드로 넘어온 로그인 유저

  if (window.location.pathname === "/admin") {
    return <AdminBadgeScreen />
  }

  if (ownerUser) {
    return <OwnerApp user={ownerUser} onExit={() => setOwnerUser(null)} />
  }

  return <CustomerApp onGoOwner={(user) => setOwnerUser(user)} />
}
