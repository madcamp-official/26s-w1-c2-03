# 맛짱(Matzzang) 코드 가이드

> 파일별로 "무슨 기능인지 / 어떤 API를 쓰는지 / 왜 이렇게 만들었는지"를 정리한 문서.
> 기획/DB 스키마/API 명세는 `기획서.md`, `DB스키마.md`, `API명세.md`를 참고하고, 이 문서는 실제 코드 기준 설명.

---

## 전체 그림

- **손님(Customer) 화면**: 카카오맵 실시간 데이터로 매장을 보여주고(사장님 등록 여부 무관), 방문 인증(체크인) → 스탬프 → 뱃지/티어/리워드로 이어지는 게임형 UX.
- **사장님(Owner) 화면**: 카카오맵의 실제 매장을 검색해서 사업자등록정보로 "인증"하면(국세청 진위확인 + 관리자 승인), 그 매장의 체크인 승인·리워드 설정 같은 운영 권한을 가짐. **인증은 노출과 무관** — 손님은 인증 여부와 상관없이 카카오 데이터로 이미 그 매장을 볼 수 있음.
- **관리자(Admin) 화면**: `/admin` 경로로만 진입, 매장 인증 승인/반려·뱃지 관리·카테고리·키워드 관리. 공유 키(`X-Admin-Key`)로 보호됨.
- **인증**: 카카오/구글/네이버 소셜 로그인만 지원(아이디/비번은 레거시로만 남음). 로그인 성공 시 JWT 세션 토큰을 발급하고, 이후 모든 요청은 `Authorization: Bearer <token>` 헤더로 "진짜 본인이 보낸 요청"임을 서버가 검증함.

---

## 백엔드 (`backend/`)

### `main.py` — 앱 진입점
FastAPI 앱 생성, CORS 설정, 라우터 등록. CORS는 로컬 개발(모든 포트의 localhost/사설 IP)은 정규식으로 허용하고, VM에 배포한 고정 도메인(`https://matzzang.for20wgh0514.madcamp-kaist.org`)은 정규식에 안 걸려서 `allow_origins`에 별도로 명시. `/health`로 서버·Supabase 연결 상태 확인 가능.

### `deps.py` — 공용 의존성 (인증/보안/DB 연결)
- **Supabase 클라이언트**: `.env`의 `SUPABASE_URL`/`SUPABASE_KEY`로 연결. `require_supabase()`로 연결 안 됐으면 500 에러.
- **`safe_execute()`**: Supabase 쿼리 실행 중 에러를 깔끔한 `HTTPException`으로 변환하는 공용 헬퍼.
- **세션 토큰 (`create_session_token` / `get_current_user_id`)**: 로그인 시 `PyJWT`로 `{sub: user_id, exp: ...}`를 서명한 토큰을 발급(30일 유효). 이후 요청은 `Authorization` 헤더의 토큰을 검증해서 user_id를 얻음.
  - **왜**: 원래는 프론트가 보내는 `user_id`/`owner_id`를 그대로 믿었음 → 아무 `user_id`나 body에 넣어서 남의 계정으로 체크인을 셀프 승인하거나 스탬프를 무한정 채울 수 있는 보안 구멍이 있었음. 이걸 막기 위해 "요청자가 실제로 누구인지"를 서버가 토큰으로 검증하도록 바꿈.
- **`require_admin()`**: `X-Admin-Key` 헤더가 `.env`의 `ADMIN_API_KEY`와 일치해야 통과. 관리자 API(뱃지/카테고리 생성·삭제, 매장 승인) 보호용.
  - **왜**: `/admin` URL은 로그인 없이 프론트에서 막아둔 것뿐이라, URL만 알면 백엔드 API를 직접 호출해 아무나 뱃지를 만들거나 매장을 승인할 수 있었음.
- **`validate_image_bytes()`**: 업로드된 파일의 첫 바이트(매직 넘버)로 진짜 jpg/png/gif/webp인지 확인 + 8MB 용량 상한.
  - **왜**: 파일 확장자·Content-Type은 클라이언트가 마음대로 조작해서 보낼 수 있어 못 믿음. 실제 파일 내용을 봐야 함.
- **`rate_limit()`**: IP당 시간당 요청 횟수를 메모리에서 세어 초과하면 429. 레거시 아이디/비번 로그인(`/users/signup`, `/users/login`)처럼 비밀번호 실패 개념이 없는 엔드포인트에 적용.

### `routers/auth.py` — 로그인/회원가입/프로필
- **레거시 로그인** (`POST /users/signup`, `/users/login`): 비밀번호 없이 아이디만으로 로그인되는 백업 수단. Rate limit 적용.
- **닉네임 중복확인** (`GET /users/check-nickname`): 로그인 필요. `exclude_user_id`로 본인 닉네임은 중복 처리 안 함.
- **프로필 수정** (`PATCH /users/{user_id}/profile`): 본인만 가능(토큰의 user_id와 URL의 user_id 비교). 닉네임 변경 + 프로필 사진 업로드(Supabase Storage `profile-images` 버킷).
- **회원탈퇴** (`DELETE /users/{user_id}`): 본인만 가능. `checkins`/`user_badges`/`user_rewards`/`reviews`가 전부 `users(id)`를 참조하지만 `on delete cascade`가 없어서, 먼저 다 지운 뒤 `users` 행을 삭제. (실제로 `user_rewards`를 안 지워서 리워드 받은 계정이 탈퇴 안 되는 버그가 있었고, 지금은 고쳐짐.)
- **소셜 로그인** (`POST /auth/kakao`, `/auth/google`, `/auth/naver`): 각 provider의 OAuth authorization code를 받아 → 액세스 토큰 교환 → 사용자 정보 조회 → `kakao_id`/`google_id`/`naver_id`로 기존 회원 찾기(없으면 신규 생성) → 세션 토큰 발급.
  - **사용 API**: 카카오(`kauth.kakao.com`, `kapi.kakao.com`), 구글(`oauth2.googleapis.com`, `googleapis.com/oauth2/v3/userinfo`), 네이버(`nid.naver.com`, `openapi.naver.com`).
  - 네이버만 CSRF 방지용 `state` 파라미터를 발급·교환 양쪽에 동일하게 실어야 함(카카오/구글은 안 씀).

### `routers/stores.py` — 매장 (제일 큰 파일, 카카오 연동의 핵심)
- **`GET /stores`**: 손님 화면은 이제 이걸 안 씀. 사장님 대시보드(`owner_id`로 내 매장 전체)와 관리자 승인 목록(`status`로 필터) 전용.
- **`POST /stores/resolve`**: 손님이 카카오 검색/주변 결과에서 매장을 열람(상세보기·체크인)하는 순간 호출. 우리 DB에 `kakao_place_id`로 이미 있으면 반환, 없으면 `status: "unclaimed"`로 새로 만듦.
  - **왜**: 체크인/랭킹/뱃지는 우리 DB의 `store.id`가 있어야 동작하는데, 손님 화면은 이제 카카오 데이터를 실시간으로 보여주기 때문에 "처음 열람하는 매장"은 우리 DB에 없을 수 있음. 사장님이 인증했는지 여부와 무관하게 게임 기능이 바로 동작해야 해서 이 즉석 생성(lazy resolve) 구조를 씀.
- **`POST /stores`**: 매장 "인증" 신청. 카카오 장소검색으로 고른 실제 매장 + 사업자등록번호/대표자명/개업일자를 받아서:
  1. 체크섬(`_validate_brn_checksum`)으로 사업자등록번호 형식이 맞는지 빠르게 검증(국세청 API 호출 전에 형식 오류를 먼저 거름).
  2. 이미 다른 사장님이 심사 중/승인된 매장이면 409로 차단.
  3. **국세청 사업자등록정보 진위확인 API**(`api.odcloud.kr/api/nts-businessman/v1/validate`, 공공데이터포털)로 번호·대표자명·개업일자가 실제로 일치하는지 확인.
  4. 통과하면 `status: "pending"`으로 저장(기존에 손님이 열람해서 `unclaimed`로 있던 행이면 그 행을 업데이트, 없으면 새로 만들면서 카카오 주소 API(`dapi.kakao.com/v2/local/search/address.json`)로 좌표/시도/구 채움).
  - **왜 이렇게**: "매장 등록"이 아니라 "인증"인 이유는, 노출은 이미 카카오 데이터로 되고 있어서 이 신청은 오직 운영 권한(체크인 승인, 리워드 설정)을 그 사장님에게 줄지만 결정하기 때문.
- **`PATCH /stores/{id}/review`** (관리자 전용): 승인하면 `status: approved`. 반려하면 `owner_id`/사업자정보를 전부 지우고 `unclaimed`로 되돌려서 다른 사장님이 다시 신청할 수 있게 함.
- **`_derive_category()` / `_FOOD_CATEGORY_KEYWORDS`**: 카카오가 주는 `category_group_code`는 음식점(FD6)/카페(CE7) 두 종류뿐이라 필터로 쓰기엔 너무 뭉뚱그려짐. 카카오의 상세 `category_name`(예: "음식점 > 한식 > 국수")을 키워드 목록으로 파싱해서 손님 화면용 세분화 카테고리(한식/중식/일식/양식/분식/치킨/주점/카페/디저트/기타)로 정규화함. 단위 테스트: `tests/test_category_derivation.py`.
- **`GET /kakao/search-place`**, **`GET /kakao/nearby-places`**: 손님 화면(홈/지도)이 실시간으로 매장을 보여주는 핵심 API.
  - `search-place`: 상호명 검색, lat/lng로 위치 편향 가능. 음식점/카페 그룹만 남김(유적지 등 노이즈 제거).
  - `nearby-places`: 현재 위치 반경 내 매장. 카테고리 없으면 음식점+카페를 카테고리 검색(`category.json`)으로, 카테고리 지정하면 그 업종을 키워드 검색으로 넉넉히 모아서 파생 카테고리가 정확히 일치하는 것만 반환(반경 내 매장이 수백 개라 그냥 필터링하면 로드된 몇십 개 안에서만 걸리는 문제 해결).
  - **`_TTLCache`**: 검색 60초, 주변 120초 캐시. 같은 좌표/검색어 조합을 반복 요청하는 걸 줄여서 카카오 API 사용량 절약.
- **`GET /kakao/place-image`, `POST /kakao/place-images`**: 카카오맵 상세 페이지를 스크래핑해서 `og:image` 메타태그로 대표 사진 추출(카카오에 별도 이미지 API가 없어서). 여러 개를 동시성 제한(8개)으로 병렬 처리.
- **`GET /kakao/image-data`**: 외부 이미지 URL을 서버가 대신 받아 base64 data URL로 변환. 위장 지도(`StomachMap.jsx`)가 SVG를 PNG로 캡처할 때, 외부 이미지를 `<canvas>`에 그대로 그리면 CORS 때문에 canvas가 "오염"되어 추출이 막히는 문제를 우회하기 위함.
- **`GET /stores/{id}/ranking`, `GET /stores/{id}/photos`**: 매장 상세 화면의 방문 랭킹(승인된 체크인 유저별 집계), 손님이 보낸 사진 갤러리(공개 동의한 것만).
- **`POST /stores/{id}/thumbnail`**: 사장님이 매장 사진 직접 업로드(본인 매장인지 확인).

### `routers/checkins.py` — 방문 인증
- **`GET /checkins`**: 체크인 목록(매장/유저/상태로 필터). 매장·유저 정보를 조인해서 같이 내려줌.
- **`POST /checkins`**: 체크인 등록. 사진 업로드(Supabase Storage `checkin-photos`) + 방문 목적 + 공개 동의. **작성자는 세션 토큰의 유저로 고정**(폼으로 안 받음). 같은 매장에 대기 중인 체크인이 있거나, 승인된 지 24시간 안 지났으면 차단(스탬프 어뷰징 방지).
- **`PATCH /checkins/{id}`**: 승인/거절. **그 매장의 실제 사장님만** 가능(체크인 → 매장 → `owner_id`를 거슬러 올라가서 토큰의 유저와 비교). 승인 시 스탬프 개수(1~3, `MAX_STAMP_COUNT`)를 사장님이 정함.
  - **왜 사장님 체크**: 이게 없으면 손님이 자기 체크인을 직접 승인해서 스탬프를 무한정 채울 수 있음.

### `routers/badges.py` — 뱃지 + 카테고리 티어/리더보드
- **뱃지**: 관리자가 이름/이모지 또는 이미지 + 조건(키워드 × 최소 방문 횟수, 여러 개면 AND)으로 생성. `_compute_earned_badges()`가 유저의 승인된 체크인을 매장 키워드 기준으로 집계해서 조건 충족 여부를 계산.
- **카테고리 티어** (`GET /users/{id}/category-tiers`): 매장이 아니라 **카테고리 단위**(한식/일식 등)로 누적 스탬프에 따라 브론즈~다이아몬드, 카테고리 내 상위 10명이면 챌린저. `_tier_for()` 로직은 `tests/test_tier_logic.py`로 검증됨.
- **리더보드** (`GET /leaderboard/stamps`): 카테고리별 누적 스탬프 순위. 챌린저 자격 판정에 쓰이는 서버 로직인데, **현재 프론트엔드에서는 아직 호출하는 곳이 없음**(백엔드만 준비된 상태).

### `routers/options.py` — 카테고리/키워드 선택지
관리자가 추가하는 카테고리(`category_options`)·키워드(`keyword_options`) 목록 CRUD. 매장 인증 폼, 뱃지 조건 폼에서 이 목록을 선택지로 씀. 생성/삭제는 관리자 전용.

### `routers/rewards.py` — 리워드 (스탬프 달성형 혜택)
- 사장님이 매장별로 "스탬프 N개 → 메뉴 무료/굿즈 증정/할인 M%" 리워드 기준을 등록(`POST /stores/{id}/rewards`, 본인 매장만).
- 손님이 기준을 달성하면 `GET /users/{id}/available-rewards`로 확인 가능(어느 매장이든), "수령하기"를 누르면 `POST /rewards/{id}/claim`으로 `user_rewards`에 `pending` 상태로 기록.
- 사장님이 `GET /stores/{id}/reward-requests`로 대기 중인 요청을 보고 `PATCH /user-rewards/{id}`로 승인(상태 갱신)/거절(행 삭제, 재요청 가능하게).

### `backend/tests/`
- `test_auth_deps.py`: 세션 토큰 발급/검증 왕복, 위변조·만료·다른 시크릿 토큰 거부, 관리자 키 검증.
- `test_brn_checksum.py`: 사업자등록번호 체크섬 검증(실제 승인된 번호로 정상 케이스 포함).
- `test_category_derivation.py`: 카카오 카테고리 문자열 → 손님용 대분류 매핑.
- `test_tier_logic.py`: 카테고리 티어 임계값/챌린저 판정.
- 실행: `cd backend && venv 활성화 후 pytest`

---

## 프론트엔드 (`frontend/src/`)

### 최상위 라우팅
- **`App.jsx`**: 최상위 라우터. `/admin` 경로면 `AdminApp`, 사장님 모드로 전환했으면 `OwnerApp`, 아니면 `CustomerApp`. 전체를 `ErrorBoundary`로 감싸서 렌더링 에러가 앱을 하얗게 죽이지 않게 함.
- **`CustomerApp.jsx`**: 손님 화면의 실질적인 라우터 + 로그인 상태 관리.
  - 카카오 JS SDK 초기화, 카카오/구글/네이버 OAuth 리다이렉트 복귀 처리(`?code=&state=`) → 로그인 API 호출 → `localStorage`에 `user`(+ `session_token`) 저장.
  - `openStore(place)`: 홈/지도에서 고른 매장(카카오 데이터)을 `resolveStore`로 우리 DB 행으로 변환 후 상세 화면 이동. 지도 핀은 목록 썸네일이 없을 수 있어서 `getPlaceImage`로 한 장 더 채움.
  - 화면 전환은 전부 로컬 상태(`screen`)로, 별도 라우터 라이브러리 없이 직접 구현.
  - lg(PC/태블릿 가로) 이상에서는 `SideNav`, 그 이하는 `BottomNav`.
- **`OwnerApp.jsx`**: 사장님 모드. 카카오 로그인만 하면 누구나 진입 가능(`onGoOwner`) — "사장님" 자격이 따로 있는 게 아니라 인증한 매장이 있으면 사장님인 구조. 매장 목록에 심사 상태 배지(심사중/승인됨/반려됨) 표시.
- **`AdminApp.jsx`**: 관리자 키 게이트(`AdminKeyGate`) → 통과하면 매장 승인/뱃지 관리/카테고리·키워드 관리 탭.

### `lib/api.js` — 백엔드 통신 계층 (전 기능의 진입점)
- `authHeaders()`: `localStorage`의 `session_token`을 모든 요청에 `Authorization: Bearer`로 자동 첨부, 관리자 키가 있으면 `X-Admin-Key`도. 그래서 각 화면 컴포넌트는 인증 헤더를 신경 안 써도 됨.
- 함수 목록은 백엔드 엔드포인트와 1:1 대응(위 백엔드 섹션 참고). 이름 규칙: `get*`(조회) / `create*`/`update*`(생성·수정) / `delete*`(삭제) / `review*`(승인·거절).

### `lib/geo.js` — 위치 유틸
- `haversineKm`: 두 좌표 사이 거리(km) 계산.
- `getMyLocation()`: GPS는 첫 신호일수록 부정확해서, `getCurrentPosition` 한 번이 아니라 `watchPosition`으로 최대 6초간 여러 번 측정해 오차반경이 가장 작은 값을 채택. 실패해도 데모 위치(성수동)로 폴백해서 항상 값을 반환(reject 없음).

### `lib/stamps.js`
`getStampsByStore(userId)`: 승인된 체크인을 매장별로 묶어 스탬프 합계 계산. 홈/지도의 "방문 여부·스탬프 개수" 표시에 공용으로 씀.

### `lib/tier.js`
브론즈~챌린저 6단계 티어의 라벨/그라디언트 색상 메타데이터. 실제 티어 판정은 서버가 하고, 여기는 순수 표시용 상수.

### `lib/fuzzySearch.js`
편집거리 기반 유사 문자열 매칭 유틸(`fuzzyIncludes`, `storeMatchesQuery`). **현재 어디서도 안 쓰임** — 홈 화면이 로컬 매장 목록을 프론트에서 필터링하던 예전 방식(카카오 실시간 연동 이전)의 잔재. 삭제해도 무방.

### `data/regions.js`
전국 시/도 → 구/군/시 목록(`REGIONS`, `SIDO_LIST`). 사장님이 매장 인증 신청 시 지역을 좁혀서 카카오 검색하는 데 사용(전국 대상보다 결과가 적고 정확함).

### `data/mockData.js`
서버 연동 이전에 쓰던 가짜 데이터 잔재. 지금은 `purposes`(체크인 방문 목적 목록)만 `CheckinScreen`에서 실제로 쓰이고, 나머지(`stores`, `regions`, `badges` 등)는 미사용.

### 컴포넌트 (`components/`)
- **`BottomNav.jsx` / `SideNav.jsx`**: 홈/지도/마이 탭. 화면 크기에 따라 하나만 보임(`lg:hidden` / `lg:flex`). 내 매장에 온 미확인 인증 요청 개수(`myBadgeCount`)를 "마이" 항목에 빨간 뱃지로 표시.
- **`ImageCropper.jsx`**: 정사각형 이미지 크롭 도구(드래그 이동, 슬라이더 확대). 매장 썸네일·뱃지 이미지 등록에 공용으로 사용. `<canvas>`로 직접 잘라서 blob 생성.
- **`OptionChips.jsx`**: 카테고리/키워드 선택 칩 UI(다중 선택, 매장 인증 폼/뱃지 조건 폼 공용).
- **`ErrorBoundary.jsx`**: 최상위 렌더링 에러 안전망.
- **`TierBadge.jsx`**: 리그오브레전드 랭크 토큰 스타일의 육각형 티어 배지(그라디언트, 챌린저는 발광 효과). 조건 미달(브론즈도 못 채움)이면 흐리게 잠금 표시.
- **`StomachMap.jsx`**: "내 위장 지도" — 방문 Top5 매장을 방문 횟수에 비례하는 원(블롭)으로 위장 실루엣 SVG 안에 물리 시뮬레이션(`d3-polygon`으로 폴리곤 안에 원 패킹)처럼 배치해서 시각화. PNG로 캡처해서 `navigator.share`로 공유(안 되면 다운로드) 기능 포함 — 카카오 썸네일은 `getImageData`로 base64 인라인해서 CORS 문제 없이 canvas 캡처.

### 손님 화면 (`screens/`)
- **`HomeScreen.jsx`**: 위치 기반으로 `getNearbyPlaces` 호출, 검색어 입력 시 `searchPlace`(디바운스 350ms). 카테고리 칩(한식/카페 등)을 고르면 그 업종만 서버에서 직접 재조회. 거리순/방문자순/자주 방문한 순 정렬. 우리 DB에 이미 있는 매장(`getStores()`)과 병합해서 스탬프·리워드 배지·카테고리 덧입힘. 카카오 썸네일은 배경에서 `getPlaceImages`로 일괄 로드(먼저 이모지로 뜨고 도착하는 대로 교체).
- **`MapScreen.jsx`**: HomeScreen과 같은 데이터 흐름을 카카오맵 SDK 위에 커스텀 오버레이(핀)로 표시. 핀 클릭 시 팝업에서 "매장 페이지 열기".
- **`StoreDetailScreen.jsx`**: 매장 정보 + 내 스탬프 + 리워드(달성 시 "수령하기") + 방문 랭킹 + 손님이 보낸 사진. lg 이상에서 2열 레이아웃.
- **`CheckinScreen.jsx`**: 카메라로 사진 촬영(`capture="environment"`) + 방문 목적 선택 + 공개 동의 → 제출 → 대기 화면.
- **`MyPageScreen.jsx`**: 프로필, 카테고리별 티어 배지(`TierBadge` 그리드), 위장 지도(`StomachMap`), 뱃지, 방문한 곳 목록(정렬 가능), 사장님 모드 전환, 로그아웃, 회원탈퇴.
- **`UserProfileScreen.jsx`**: 다른 유저 프로필(랭킹에서 클릭) — 획득 뱃지만 노출. 방문 기록/횟수는 일부러 숨김(동선 노출 방지).
- **`EditProfileScreen.jsx`**: 닉네임 변경(중복확인) + 프로필 사진 업로드.
- **`DeleteAccountScreen.jsx`**: 삭제될 항목 안내 + 체크박스 동의해야 탈퇴 버튼 활성화.
- **`NicknameSetupScreen.jsx`**: 소셜 로그인 첫 가입 시 온보딩. 랜덤 닉네임 추천(중복이면 최대 5번 재시도) + 프로필 사진.
- **`LoginScreen.jsx` / `SignupScreen.jsx`**: 아이디/비번 방식의 미사용 레거시 화면. 지금은 어디서도 import 안 됨(카카오/구글/네이버 로그인으로 대체됨).

### 사장님 화면
- **`OwnerDashboardScreen.jsx`**: 매장 인증 신청 폼. 시/도·구 선택 → 카카오 상호명 검색 → 매장 선택 → 사업자등록번호/대표자명/개업일자 입력 → 카테고리/키워드 선택 → 제출(`createStore`).
- **`OwnerCheckinsScreen.jsx`**: 이 매장에 온 체크인 요청(스탬프 개수 +/- 정해서 수락) + 리워드 수령 요청(승인/거절) 처리.
- **`StoreRewardsScreen.jsx`**: 매장의 리워드 기준(스탬프 개수 → 메뉴/굿즈 × 무료·증정/할인) 등록·삭제.

### 관리자 화면
- **`AdminStoreApprovalScreen.jsx`**: 국세청 진위확인을 통과하고 심사 대기(`pending`) 중인 매장 목록. 사업자등록번호는 뒷자리를 가려서 표시. 승인/반려.
- **`AdminBadgeScreen.jsx`**: 뱃지 생성(이모지 또는 이미지 크롭 업로드) + 키워드 조건(여러 개 AND) + 목록/삭제.
- **`AdminOptionsScreen.jsx`**: 카테고리/키워드 선택지 추가·삭제.

---

## 알아두면 좋은 것들

- **손님 화면의 매장 데이터 출처가 두 갈래**: 카카오 실시간 데이터(이름/주소/좌표/카테고리 힌트) + 우리 DB(`kakao_place_id`로 매칭되면 스탬프/카테고리/키워드/리워드/이미지를 덧입힘). 화면 코드에서 `ourStoresByPlaceId` 같은 변수를 보면 이 병합 로직임.
- **카테고리는 두 가지 의미로 쓰임**: 사장님이 인증하며 지정한 `categories`(우리 DB, `category_options` 중 선택)와 카카오 데이터에서 자동 파생한 `category`(`_derive_category`). 인증된 매장은 전자 우선, 아니면 후자.
- **`getStampLeaderboard`(백엔드 `/leaderboard/stamps`)는 프론트에서 아직 안 씀** — 확장 여지로 봐도 됨.
- **`fuzzySearch.js`, `mockData.js`의 대부분 export, `LoginScreen.jsx`/`SignupScreen.jsx`는 죽은 코드**라 정리해도 무방하지만, 지우기 전 팀원과 확인 필요.
- **보안 관련 최근 변경**: 세션 토큰(JWT) 도입, 관리자 키 게이트, 이미지 매직넘버 검증, rate limit, 체크인/리워드 승인 시 "그 매장 사장님인지" 서버 검증 — 전부 "프론트가 보내는 값을 그대로 믿지 않는다"는 방향의 하드닝.
