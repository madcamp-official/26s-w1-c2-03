# DB 스키마 — 맛짱 (Matzzang)

> FE·BE 공용 계약서. B는 아래 SQL을 Supabase SQL Editor에 붙여넣어 테이블 생성.
> FE는 각 테이블의 "컬럼(데이터 모양)"을 보고 화면/목데이터 제작.

---

## 테이블 관계 한눈에

```
owners ──< stores ──< checkins >── users
             │            │
             │            └── purpose: 외식/카공/혼술/혼밥/회식
             └──< rewards ──< user_rewards >── users

users ──< user_badges >── badges
users ──< reviews >── stores
```

- `A ──< B` : A 하나에 B가 여러 개 (1:N)
- 예: owner 한 명이 store 여러 개, store 하나에 checkin 여러 개

---

## 1. 핵심 테이블

### owners (사장님 — 매장 등록·인증 수락 주체)
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid | 고유 번호 |
| email | text | 로그인 이메일 (사장님은 이메일이 로그인 아이디) |
| password_hash | text | 비밀번호 **해시값** (원문 저장 금지) |
| name | text | 사장님/담당자 이름 |
| created_at | timestamptz | 가입 시각 |

### stores (매장 — 카카오맵 실제 장소. 노출은 사장님 인증과 무관, status는 "운영 권한" 심사 상태일 뿐)
> 손님 화면(홈/지도)은 이 테이블을 조회하지 않고 카카오맵 데이터를 실시간으로 보여줌(`/kakao/nearby-places`,
> `/kakao/search-place`). 손님이 매장을 열람(상세보기·체크인)하는 순간 `/stores/resolve`가 이 테이블에
> 없으면 `unclaimed`로 새로 만들고, 있으면 그대로 재사용함 — 그래야 사장님이 인증 안 해도 스탬프·랭킹·뱃지가
> 바로 동작함. 사장님의 "인증 신청"은 이 매장에 대한 체크인 승인·리워드 설정 같은 **운영 권한**을 가져갈 뿐,
> 매장이 손님 화면에 뜨는지 여부와는 무관함.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid | 고유 번호 (자동 생성) |
| owner_id | uuid | 인증한 사장님 (→ owners), 미인증 상태면 null |
| name | text | 매장 이름 (카카오 장소검색/주변조회 결과에서 가져옴) |
| address | text | 주소 (카카오 장소검색/주변조회 결과에서 가져옴) |
| categories | text[] | 카페 / 한식 / 일식 / 디저트 … 중복 선택 (예: {카페, 디저트}) *(인증한 사장님이 category_options 중에서 선택, 미인증 상태면 빈 배열)* |
| keywords | text[] | 키워드 배열, 최대 3개 *(인증한 사장님이 keyword_options 중에서 선택)* |
| image_url | text | 매장 썸네일 — 카카오맵 대표 이미지로 자동 채워지거나, 인증한 사장님이 직접 업로드(Supabase Storage) |
| kakao_place_id | text | 카카오맵상 실제 장소 ID — 손님·사장님 어느 경로로 들어와도 같은 실제 매장이면 같은 행을 가리키게 하는 키. 필수값 |
| business_registration_number | text | 사업자등록번호 10자리 — 국세청 진위확인 API로 검증 완료된 값만 저장. 미인증/반려 상태면 null |
| business_owner_name | text | 대표자 성명 — 국세청 진위확인에 사용. 미인증/반려 상태면 null |
| business_start_date | text | 개업일자 YYYYMMDD — 국세청 진위확인에 사용. 미인증/반려 상태면 null |
| status | text | `unclaimed`(미인증, 기본값) / `pending`(진위확인 통과, 관리자 승인 대기) / `approved`(관리자 승인, 운영 권한 부여됨) |
| lat | double | 위도 — 카카오 데이터 또는 주소 지오코딩으로 채움 |
| lng | double | 경도 — 위와 동일 |
| sido | text | 시/도 — 인증 신청 시 주소에서 자동 추출 (손님이 먼저 열람만 한 미인증 매장은 null일 수 있음) |
| gu | text | 구/군 — 위와 동일 |
| created_at | timestamptz | 이 행이 생성된 시각 (손님의 첫 열람 또는 사장님의 첫 인증 신청) |

> 인증 흐름: ① 사장님이 시/도·구 선택 후 카카오 장소검색 → 매장 선택 → ② 사업자등록번호·대표자명·개업일자 입력
> → ③ 서버가 국세청 API로 진위확인 (불일치하면 즉시 거절) → ④ 통과하면 `pending`으로 저장 →
> ⑤ 관리자가 승인하면 `approved`로 바뀌며 그 사장님에게 체크인 승인·리워드 설정 권한이 생김
> (반려되면 `unclaimed`로 되돌아가 다른 사장님도 다시 신청 가능).

### category_options / keyword_options (관리자가 추가하는 선택지 목록)
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid | 고유 번호 |
| name | text | 선택지 이름 (예: "카페", "조용한"), 중복 불가 |
| created_at | timestamptz | 추가 시각 |

> 매장 등록 폼과 뱃지 조건 폼 모두 여기서 목록을 받아와 선택지로 보여줌. 관리자 페이지에서 추가만 가능(자유 텍스트 입력 폐지).

### users (손님)
> 카카오/구글/네이버 로그인이 기본, 아이디/비번 로그인은 백업 수단 — 그래서 아래 인증 관련 컬럼은 전부 선택값(nullable)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid | 고유 번호 |
| login_id | text | 로그인 아이디 (간단 로그인 시, 중복 불가) |
| password_hash | text | 비밀번호 **해시값** (간단 로그인 시, 원문 저장 금지) |
| kakao_id | text | 카카오 고유 ID (카카오 로그인 시, 중복 불가) |
| google_id | text | 구글 고유 ID (구글 로그인 시, 중복 불가) |
| naver_id | text | 네이버 고유 ID (네이버 로그인 시, 중복 불가) |
| nickname | text | 닉네임 (지도·랭킹에 표시) |
| created_at | timestamptz | 가입 시각 |

### checkins (방문 인증 — 서비스의 심장)
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid | 고유 번호 |
| user_id | uuid | 누가 (→ users) |
| store_id | uuid | 어느 매장 (→ stores) |
| photo_url | text | 음식 사진 주소 (Supabase Storage) |
| purpose | text | 방문 목적: 외식 / 카공 / 혼술 / 혼밥 / 회식 … |
| status | text | pending(대기) / approved(수락) / rejected(거절) |
| photo_consent | boolean | 이 인증 사진을 매장 페이지(손님이 보낸 사진)에 공개하는 것에 동의했는지 — 손님이 인증 보낼 때 직접 선택, 기본값 false |
| stamp_count | int | 이 방문으로 적립되는 스탬프 개수 — 사장님이 수락할 때 +/-로 정함 (기본 1, 이벤트 때 2개 이상도 가능) |
| created_at | timestamptz | 인증 요청 시각 |
| reviewed_at | timestamptz | 사장님이 수락·거절한 시각 |

> 스탬프 수·랭킹은 여기서 계산: `status='approved'` 인 checkin 개수를 세면 됨.

---

## 2. 게임 요소 테이블

### badges (뱃지 정의 — 관리자가 미리 등록)
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid | 고유 번호 |
| name | text | 뱃지 이름 (예: 카페 마스터) |
| description | text | 설명 |
| emoji | text | 이모지 아이콘 (image_url과 둘 중 하나만 사용) |
| image_url | text | 업로드한 이미지 주소 (Supabase Storage) |

### badge_conditions (뱃지 획득 조건 — 뱃지 하나에 여러 개, 전부 AND로 만족해야 함)
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid | 고유 번호 |
| badge_id | uuid | 어떤 뱃지 (→ badges, on delete cascade) |
| condition_type | text | keyword / category |
| condition_value | text | category_options 또는 keyword_options 중에서 선택한 값 |
| min_count | int | 이 조건을 만족하는 방문(체크인)이 몇 회 이상이어야 하는지 |

### user_badges (획득 기록)
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid | 고유 번호 |
| user_id | uuid | 누가 (→ users) |
| badge_id | uuid | 어떤 뱃지 (→ badges) |
| earned_at | timestamptz | 획득 시각 |

### rewards (사장님이 설정한 리워드 기준 — 스탬프 개수 달성형)
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid | 고유 번호 |
| store_id | uuid | 어느 매장 (→ stores) |
| stamp_threshold | int | 이 매장에서 스탬프 몇 개를 모아야 하는지 |
| target_type | text | menu(메뉴) / goods(굿즈) |
| target_name | text | 사장님이 입력한 메뉴·굿즈 이름 (예: 아메리카노, 텀블러) |
| reward_kind | text | free(메뉴는 "무료", 굿즈는 "증정") / discount(할인) |
| discount_percent | int | reward_kind가 discount일 때만 사용하는 할인율 |
| created_at | timestamptz | 등록 시각 |

---

## 3. 보조 테이블

### user_rewards (리워드 수령 요청/지급 기록 — 손님이 "수령하기"를 누르면 pending으로 생기고, 사장님이 승인하면 approved)
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid | 고유 번호 |
| user_id | uuid | 누가 (→ users) |
| reward_id | uuid | 어떤 리워드 (→ rewards) |
| status | text | pending(대기) / approved(승인) — 거절 시에는 행 자체를 삭제해서 재요청 가능하게 함 |
| claimed_at | timestamptz | 요청한 시각 |
| reviewed_at | timestamptz | 사장님이 승인한 시각 |

> user_id + reward_id는 유니크 — 같은 리워드를 같은 유저가 중복 요청 못 하게 막음.

### reviews (자체 리뷰 — 리뷰왕 칭호용)
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid | 고유 번호 |
| user_id | uuid | 누가 (→ users) |
| store_id | uuid | 어느 매장 (→ stores) |
| rating | int | 별점 1~5 |
| content | text | 리뷰 내용 |
| created_at | timestamptz | 작성 시각 |

---

## Supabase 실행용 SQL

> Supabase 대시보드 → SQL Editor → New query → 아래 붙여넣고 Run

```sql
-- 1. 사장님
create table owners (
  id uuid primary key default gen_random_uuid(),
  email text unique,                -- 사장님은 이메일이 로그인 아이디
  password_hash text,               -- 비밀번호 해시 (원문 저장 금지)
  name text,
  created_at timestamptz default now()
);

-- 2. 매장 (카카오맵 실제 장소. 손님 노출은 카카오 데이터로 실시간 처리하고, 이 테이블은
--    손님이 열람했거나 사장님이 인증한 매장만 담아서 체크인·랭킹·뱃지·운영 권한을 관리함)
create table stores (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references owners(id),  -- 인증한 사장님, 미인증이면 null
  name text not null,
  address text,
  categories text[],                 -- 예: '{카페, 디저트}' (인증한 사장님이 category_options 중에서 선택)
  keywords text[],                   -- 예: '{분위기좋은, 조용한, 디저트맛집}' (keyword_options 선택지 중 최대 3개)
  image_url text,                    -- 매장 썸네일 (카카오맵 대표 이미지 자동 채움 또는 사장님 업로드)
  kakao_place_id text,                -- 카카오맵상 실제 장소 ID (필수, 손님/사장님 경로 모두 이 값으로 매장을 식별)
  business_registration_number text,  -- 사업자등록번호 10자리 (국세청 진위확인 통과분만 저장, 미인증이면 null)
  business_owner_name text,           -- 대표자 성명 (국세청 진위확인용, 미인증이면 null)
  business_start_date text,           -- 개업일자 YYYYMMDD (국세청 진위확인용, 미인증이면 null)
  status text default 'unclaimed',    -- unclaimed(미인증) / pending(승인 대기) / approved(운영 권한 부여됨)
  lat double precision,              -- 카카오 데이터 또는 주소 지오코딩으로 채움
  lng double precision,
  sido text,                        -- 주소에서 자동 추출한 시/도
  gu text,                          -- 주소에서 자동 추출한 구/군
  created_at timestamptz default now()
);

-- 2-1. 카테고리/키워드 선택지 (관리자 페이지에서 추가)
create table category_options (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz default now()
);

create table keyword_options (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz default now()
);

-- 손님 화면의 카카오맵 세분화 카테고리(한식/중식/일식/양식/분식/치킨/주점/카페/디저트)와 맞춰둠 —
-- 사장님이 매장 등록 시 고르는 카테고리, 뱃지 조건 카테고리가 손님이 보는 필터와 같은 어휘를 쓰게 하기 위함.
insert into category_options (name) values
  ('한식'), ('중식'), ('일식'), ('양식'), ('분식'), ('치킨'), ('주점'), ('카페'), ('디저트')
  on conflict (name) do nothing;

insert into keyword_options (name) values
  ('조용한'), ('가성비'), ('든든한'), ('혼밥환영'), ('국물맛집'), ('데이트'), ('디저트맛집'), ('수제패티')
  on conflict (name) do nothing;

-- (stores.category → categories 마이그레이션은 2026-07-04에 이미 실행 완료됨 — 다시 실행하면
--  "column category does not exist" 에러 남. 재실행 금지)

-- 3. 손님
-- 카카오 로그인이 기본 수단이 되면서 아이디/비번 로그인은 백업 수단으로 남음.
-- 그래서 login_id/password_hash와 kakao_id 모두 선택값(nullable) — 가입 방식에 따라 하나만 채워짐.
create table users (
  id uuid primary key default gen_random_uuid(),
  login_id text unique,              -- 로그인 아이디 (간단 로그인 사용 시)
  password_hash text,                -- 비밀번호 해시 (간단 로그인 사용 시, 원문 저장 금지)
  kakao_id text unique,               -- 카카오 고유 ID (카카오 로그인 사용 시)
  google_id text unique,              -- 구글 고유 ID (구글 로그인 사용 시)
  naver_id text unique,               -- 네이버 고유 ID (네이버 로그인 사용 시)
  nickname text not null,
  created_at timestamptz default now()
);

-- (google_id 컬럼 추가는 2026-07-06에 이미 실행 완료됨)

-- 4. 방문 인증 (핵심)
create table checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  store_id uuid references stores(id),
  photo_url text,
  purpose text,                     -- 외식 / 카공 / 혼술 / 혼밥 / 회식
  status text default 'pending',    -- pending / approved / rejected
  photo_consent boolean default false, -- 이 사진을 매장 페이지에 공개하는 것에 동의했는지
  stamp_count int default 1,         -- 이 방문으로 적립되는 스탬프 개수 (사장님이 수락할 때 +/-로 정함)
  created_at timestamptz default now(),
  reviewed_at timestamptz
);

-- (stores.image_url, checkins.photo_consent 컬럼 추가와 store-thumbnails 버킷 생성은 2026-07-06에 이미 완료됨)

-- ⚠️ [아직 실행 안 함 — 지금 Supabase SQL Editor에서 실행]
alter table checkins add column if not exists stamp_count int default 1;

-- ⚠️ [아직 실행 안 함 — 매장 중복 등록 방지(카카오 장소 ID 기반)에 필요, 지금 Supabase SQL Editor에서 실행]
alter table stores add column if not exists kakao_place_id text;

-- ⚠️ [아직 실행 안 함 — 네이버 로그인 쓰려면 지금 이 한 줄만 Supabase SQL Editor에서 실행]
alter table users add column if not exists naver_id text unique;

-- ⚠️ [아직 실행 안 함 — 매장 등록을 "사업자 인증 + 관리자 승인" 방식으로 바꾸는 데 필요, 지금 Supabase SQL Editor에서 실행]
alter table stores add column if not exists business_registration_number text;
alter table stores add column if not exists business_owner_name text;
alter table stores add column if not exists business_start_date text;
alter table stores add column if not exists status text default 'pending';
-- 이미 등록되어 있던 기존 매장(및 방금 초기화 이전 데이터)은 그대로 손님 화면에 노출되도록 승인 처리
update stores set status = 'approved' where status is null;
create index if not exists idx_stores_status on stores(status);

-- ⚠️ [아직 실행 안 함 — 손님 화면을 "카카오 데이터 실시간 노출" 방식으로 바꾸면서 status 기본값이 바뀜, 지금 실행]
-- 이제 기본값은 unclaimed(미인증) — 매장이 새로 생기는 건 손님이 처음 열람할 때(/stores/resolve)이고,
-- 그 시점엔 아직 아무 사장님도 인증 안 한 상태이기 때문. owner_id도 인증 전엔 비워둘 수 있어야 해서 nullable 유지.
alter table stores alter column status set default 'unclaimed';
alter table stores alter column owner_id drop not null;

-- 5. 뱃지 정의
create table badges (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  emoji text,                       -- emoji, image_url 둘 중 하나만 사용
  image_url text
);

-- 5-1. 뱃지 획득 조건 (뱃지 하나에 여러 개, 전부 AND)
create table badge_conditions (
  id uuid primary key default gen_random_uuid(),
  badge_id uuid references badges(id) on delete cascade,
  condition_type text,               -- keyword / category
  condition_value text,              -- category_options / keyword_options 중에서 선택한 값
  min_count int
);

-- 6. 뱃지 획득 기록
create table user_badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  badge_id uuid references badges(id),
  earned_at timestamptz default now(),
  unique (user_id, badge_id)
);

-- 7. 사장님 리워드 (스탬프 개수 달성형)
create table rewards (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references stores(id) on delete cascade,
  stamp_threshold int not null,      -- 스탬프 몇 개 모으면
  target_type text not null,         -- 'menu' | 'goods'
  target_name text not null,         -- 사장님이 입력한 메뉴/굿즈 이름
  reward_kind text not null,         -- 'free' | 'discount'
  discount_percent int,              -- reward_kind='discount'일 때만
  created_at timestamptz default now()
);

-- 8. 리워드 수령 요청/지급 기록 (손님이 "수령하기" 누르면 pending 생성, 사장님이 승인하면 approved)
create table user_rewards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  reward_id uuid references rewards(id) on delete cascade,
  status text not null default 'pending',  -- pending / approved
  claimed_at timestamptz default now(),
  reviewed_at timestamptz,
  unique (user_id, reward_id)
);

-- (기존 rewards/user_rewards 옛날 설계를 지우고 위 7·8번 새 스키마로 다시 만든 마이그레이션은 2026-07-06에 이미 완료됨)

-- ⚠️ [아직 실행 안 함 — 리워드 수령 요청/승인 방식으로 바꾸려면 지금 Supabase SQL Editor에서 실행]
-- 기존 user_rewards는 "사장님이 바로 지급" 방식으로 쓰던 테스트 데이터라 지우고 새로 시작
delete from user_rewards;
alter table user_rewards add column if not exists status text not null default 'pending';
alter table user_rewards add column if not exists reviewed_at timestamptz;

-- 9. 자체 리뷰
create table reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  store_id uuid references stores(id),
  rating int,
  content text,
  created_at timestamptz default now()
);

-- 자주 조회하는 컬럼에 인덱스 (조회 속도 ↑)
create index idx_checkins_store on checkins(store_id);
create index idx_checkins_user on checkins(user_id);
create index idx_checkins_status on checkins(status);
```

---

## MVP 진행 순서 (이 스키마 기준)

1. `owners` + `stores` → 사장님이 매장 등록 (이름/주소/카테고리/키워드)
2. `users` + `checkins` → 사진 + 방문목적 인증 → 사장님 수락 루프 완성 (핵심)
3. `badges` + `user_badges` → 뱃지 획득
4. 랭킹 화면 (checkins 계산으로 구현, 새 테이블 불필요)
5. `rewards` + `user_rewards` → 사장님 리워드 (여유 시)
6. `reviews` → 리뷰왕 (여유 시)
