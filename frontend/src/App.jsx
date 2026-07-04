import { useState } from "react"
import CustomerApp from "./CustomerApp"
import OwnerApp from "./OwnerApp"

// 손님 화면(CustomerApp)과 사장님 화면(OwnerApp)을 오가는 최상위 라우터.
// 사장님 모드는 CustomerApp 안에서 로그인 + "등록된 사장님" 확인을 마친 뒤에만 진입 가능
// (MyPageScreen의 "사장님 모드로 전환" 버튼 → onGoOwner 호출).
export default function App() {
  const [ownerStore, setOwnerStore] = useState(null) // 사장님 모드 진입 시 { storeName }

  if (ownerStore) {
    return <OwnerApp storeName={ownerStore.storeName} onExit={() => setOwnerStore(null)} />
  }

  return <CustomerApp onGoOwner={(storeName) => setOwnerStore({ storeName })} />
}
