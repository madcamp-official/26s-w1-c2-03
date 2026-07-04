// ⚠️ 임시 목(mock) — "어떤 유저(실제 DB user.id)가 사장님인지"를 브라우저(localStorage)에 저장.
// 로그인 방식(아이디/비번, 카카오)과 무관하게 항상 실제 백엔드 user.id를 키로 씀.
// 나중에 백엔드에 owners 테이블 연동 로그인이 생기면 이 파일은 통째로 사라짐.
//   - 로그인 시: 서버가 내려주는 user 정보에 is_owner / store 정보가 들어옴
//   - 사장님 등록: POST /owners (또는 카카오 가입 후 매장 등록)
const KEY = "matzzang_owners"

function readAll() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {}
  } catch {
    return {}
  }
}

// 사장님으로 등록 (아이디 → 가게 정보)
export function registerOwner(id, storeName) {
  const all = readAll()
  all[id] = { storeName }
  localStorage.setItem(KEY, JSON.stringify(all))
}

// 이 아이디가 등록된 사장님인지 확인 → { storeName } 또는 null
export function getOwnerInfo(id) {
  return readAll()[id] || null
}
