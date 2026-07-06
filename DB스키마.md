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

### stores (매장 — 사장님이 직접 등록)
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid | 고유 번호 (자동 생성) |
| owner_id | uuid | 등록한 사장님 (→ owners) |
| name | text | 매장 이름 *(사장님 입력)* |
| address | text | 주소 *(사장님 입력)* |
| categories | text[] | 카페 / 한식 / 일식 / 디저트 … 중복 선택 (예: {카페, 디저트}) *(사장님이 category_options 중에서 선택)* |
| keywords | text[] | 키워드 배열, 최대 3개 (예: {분위기좋은, 조용한, 디저트맛집}) *(사장님이 keyword_options 중에서 선택)* |
| image_url | text | 매장 썸네일 사진 주소 — 직접 등록 시 사장님이 업로드(Supabase Storage), 장소검색으로 자동 등록 시 카카오맵 대표 이미지를 자동으로 채움 |
| kakao_place_id | text | 매장 검색으로 등록한 경우 카카오맵상 실제 장소 ID — 중복 매장 등록 판별에 사용 (직접 입력 시 null) |
| lat | double | 위도 — 주소를 좌표로 자동 변환(카카오 API), 폼 입력 아님 |
| lng | double | 경도 — 위와 동일 |
| sido | text | 시/도 — 주소에서 자동 추출 |
| gu | text | 구/군 — 주소에서 자동 추출 |
| created_at | timestamptz | 등록 시각 |

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

-- 2. 매장 (사장님이 직접 등록)
create table stores (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references owners(id),
  name text not null,
  address text,
  categories text[],                 -- 예: '{카페, 디저트}' (category_options 선택지 중 중복 선택)
  keywords text[],                   -- 예: '{분위기좋은, 조용한, 디저트맛집}' (keyword_options 선택지 중 최대 3개)
  image_url text,                    -- 매장 썸네일 (직접 등록: 사장님 업로드 / 자동 등록: 카카오맵 대표 이미지)
  lat double precision,              -- 주소 → 좌표 자동 변환(카카오 API)
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

insert into category_options (name) values
  ('카페'), ('한식'), ('일식'), ('양식'), ('분식'), ('디저트'), ('주점')
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
