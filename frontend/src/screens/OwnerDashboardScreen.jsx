import { useEffect, useRef, useState } from "react"
import {
  createStore,
  getCategoryOptions,
  getKeywordOptions,
  searchPlace,
  getPlaceImage,
  uploadStoreThumbnail,
} from "../lib/api"
import { REGIONS, SIDO_LIST } from "../data/regions"
import OptionChips from "../components/OptionChips"
import ImageCropper from "../components/ImageCropper"

const MAX_KEYWORDS = 3

// 매장 인증 신청 — ownerId는 로그인한 계정(카카오)의 id를 그대로 씀.
// 매장은 손님 화면에 카카오 데이터로 이미 노출되고 있어서, 여기서 하는 건 "내 매장" 소유권 인증뿐임.
// 카카오맵에 실제로 있는 장소를 검색해서 고르고 사업자등록정보를 제출하면 국세청 진위확인을 거쳐
// "심사 대기"로 저장되고, 관리자가 최종 승인해야 체크인 승인·리워드 설정 같은 운영 권한이 생김.
export default function OwnerDashboardScreen({ ownerId, onRegistered }) {
  const [sido, setSido] = useState(SIDO_LIST[0])
  const [gu, setGu] = useState(REGIONS[SIDO_LIST[0]][0])
  const [placeQuery, setPlaceQuery] = useState("")
  const [placeResults, setPlaceResults] = useState(null)
  const [searching, setSearching] = useState(false)

  const [selectedPlace, setSelectedPlace] = useState(null) // 검색 결과에서 고른 실제 매장 (name/address/kakao_place_id 등)

  const [businessNumber, setBusinessNumber] = useState("")
  const [businessOwnerName, setBusinessOwnerName] = useState("")
  const [businessStartDate, setBusinessStartDate] = useState("")

  const [categoryOptions, setCategoryOptions] = useState([])
  const [keywordOptions, setKeywordOptions] = useState([])
  const [categories, setCategories] = useState([])
  const [keywords, setKeywords] = useState([])

  // 썸네일: 장소검색으로 자동 채운 것(autoImageUrl) 또는 사장님이 직접 올린 것(croppedBlob) 중 하나
  const [autoImageUrl, setAutoImageUrl] = useState(null)
  const [pickedFile, setPickedFile] = useState(null) // 크롭 대기 중인 원본 파일
  const [croppedBlob, setCroppedBlob] = useState(null)
  const [croppedPreviewUrl, setCroppedPreviewUrl] = useState(null)
  const fileInputRef = useRef(null)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    getCategoryOptions()
      .then((options) => setCategoryOptions(options.map((o) => o.name)))
      .catch(() => setCategoryOptions([]))
    getKeywordOptions()
      .then((options) => setKeywordOptions(options.map((o) => o.name)))
      .catch(() => setKeywordOptions([]))
  }, [])

  const handleSidoChange = (value) => {
    setSido(value)
    setGu(REGIONS[value][0])
  }

  // 시/도·구로 검색 범위를 좁혀서 카카오 장소검색 — 전국 대상보다 결과가 적고 관련도 높아서 고르기 쉬움
  const handlePlaceSearch = async () => {
    if (!placeQuery.trim()) return
    setSearching(true)
    setError("")
    try {
      const results = await searchPlace(`${sido} ${gu} ${placeQuery.trim()}`)
      setPlaceResults(results)
    } catch (e) {
      setError(e.message || "장소 검색에 실패했어요")
    } finally {
      setSearching(false)
    }
  }

  const handlePickPlace = (place) => {
    setSelectedPlace(place)
    setPlaceResults(null)
    setPlaceQuery("")

    // 카카오맵에 있는 대표 사진을 자동으로 채워봄 (사장님이 직접 올리면 이건 무시됨)
    setAutoImageUrl(null)
    if (place.place_url) {
      getPlaceImage(place.place_url)
        .then((res) => setAutoImageUrl(res.image_url))
        .catch(() => setAutoImageUrl(null))
    }
  }

  const handleFilePick = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPickedFile(file)
    setCroppedBlob(null)
    if (croppedPreviewUrl) URL.revokeObjectURL(croppedPreviewUrl)
    setCroppedPreviewUrl(null)
  }

  const handleCropped = (blob) => {
    setCroppedBlob(blob)
    setPickedFile(null)
    setCroppedPreviewUrl(URL.createObjectURL(blob))
  }

  const toggleCategory = (c) => {
    setCategories((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]))
  }
  const toggleKeyword = (k) => {
    setKeywords((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]))
  }

  const canSubmit =
    !!selectedPlace &&
    /^\d{10}$/.test(businessNumber.replace(/-/g, "")) &&
    businessOwnerName.trim() &&
    businessStartDate &&
    categories.length > 0 &&
    !submitting

  const handleSubmit = async () => {
    setSubmitting(true)
    setError("")
    try {
      // 직접 올린 사진이 없으면 장소검색으로 자동으로 찾은 사진을 등록과 동시에 넣음
      const store = await createStore({
        ownerId,
        name: selectedPlace.name,
        address: selectedPlace.address,
        kakaoPlaceId: selectedPlace.kakao_place_id,
        categories,
        keywords,
        imageUrl: croppedBlob ? undefined : autoImageUrl || undefined,
        businessRegistrationNumber: businessNumber.replace(/-/g, ""),
        businessOwnerName: businessOwnerName.trim(),
        businessStartDate: businessStartDate.replace(/-/g, ""),
      })
      // 직접 올린 사진이 있으면 등록 직후 업로드해서 덮어씀
      const finalStore = croppedBlob ? await uploadStoreThumbnail(store.id, croppedBlob) : store
      onRegistered(finalStore)
    } catch (e) {
      setError(e.message || "매장 인증 신청에 실패했어요")
      setSubmitting(false)
    }
  }

  return (
    <div className="px-5 py-6 lg:max-w-md">
      <h2 className="mb-1 text-lg font-semibold text-slate-900">매장 인증 신청</h2>
      <p className="mb-4 text-xs text-slate-400">
        매장은 손님 화면에 이미 노출되고 있어요. 사업자등록정보로 내 매장임을 인증하면
        체크인 승인·리워드 설정 같은 운영 기능을 쓸 수 있게 돼요. 국세청 진위확인 통과 후 관리자 승인이 필요해요.
      </p>

      <div>
        {!selectedPlace ? (
          <>
            <label className="mb-1 block text-sm font-medium text-slate-600">지역 선택</label>
            <div className="mb-3 flex gap-2">
              <select
                value={sido}
                onChange={(e) => handleSidoChange(e.target.value)}
                className="w-1/2 rounded-xl border border-slate-200 px-3 py-3 text-slate-900 outline-none focus:border-amber-400"
              >
                {SIDO_LIST.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <select
                value={gu}
                onChange={(e) => setGu(e.target.value)}
                className="w-1/2 rounded-xl border border-slate-200 px-3 py-3 text-slate-900 outline-none focus:border-amber-400"
              >
                {REGIONS[sido].map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>

            <label className="mb-1 block text-sm font-medium text-slate-600">매장 이름으로 검색</label>
            <div className="mb-1 flex gap-2">
              <input
                value={placeQuery}
                onChange={(e) => setPlaceQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handlePlaceSearch()}
                placeholder="예: 감성카페"
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 outline-none focus:border-amber-400"
              />
              <button
                onClick={handlePlaceSearch}
                disabled={!placeQuery.trim() || searching}
                className="whitespace-nowrap rounded-xl bg-slate-100 px-4 py-3 text-sm font-medium text-slate-600 disabled:text-slate-300"
              >
                {searching ? "검색 중..." : "검색"}
              </button>
            </div>
            <p className="mb-3 text-xs text-slate-400">
              {sido} {gu} 안에서 검색해요. 검색 결과에서 실제 내 매장을 선택해주세요.
            </p>

            {error && <p className="mb-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-500">{error}</p>}

            {placeResults && (
              <div className="mb-4">
                {placeResults.length === 0 ? (
                  <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-400">검색 결과가 없어요.</p>
                ) : (
                  <div className="space-y-1.5">
                    {placeResults.map((p) => (
                      <button
                        key={p.kakao_place_id}
                        onClick={() => handlePickPlace(p)}
                        className="w-full rounded-xl bg-slate-50 px-4 py-2.5 text-left"
                      >
                        <p className="font-medium text-slate-800">{p.name}</p>
                        <p className="text-xs text-slate-400">
                          {p.address}
                          {p.category_hint ? ` · ${p.category_hint}` : ""}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <label className="mb-1 block text-sm font-medium text-slate-600">선택한 매장</label>
            <div className="mb-4 flex items-center justify-between rounded-xl bg-amber-50 px-4 py-3">
              <div>
                <p className="font-medium text-slate-800">{selectedPlace.name}</p>
                <p className="text-xs text-slate-500">{selectedPlace.address}</p>
              </div>
              <button
                onClick={() => {
                  setSelectedPlace(null)
                  setAutoImageUrl(null)
                }}
                className="whitespace-nowrap text-xs font-medium text-amber-700 underline"
              >
                다시 검색
              </button>
            </div>

            <label className="mb-1 block text-sm font-medium text-slate-600">사업자등록번호</label>
            <input
              value={businessNumber}
              onChange={(e) => setBusinessNumber(e.target.value)}
              placeholder="000-00-00000"
              maxLength={12}
              className="mb-4 w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 outline-none focus:border-amber-400"
            />

            <label className="mb-1 block text-sm font-medium text-slate-600">대표자 성명</label>
            <input
              value={businessOwnerName}
              onChange={(e) => setBusinessOwnerName(e.target.value)}
              placeholder="사업자등록증에 적힌 대표자 이름"
              className="mb-4 w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 outline-none focus:border-amber-400"
            />

            <label className="mb-1 block text-sm font-medium text-slate-600">개업일자</label>
            <input
              type="date"
              value={businessStartDate}
              onChange={(e) => setBusinessStartDate(e.target.value)}
              className="mb-1 w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 outline-none focus:border-amber-400"
            />
            <p className="mb-4 text-xs text-slate-400">
              사업자등록번호·대표자 성명·개업일자가 국세청 정보와 모두 일치해야 신청할 수 있어요.
            </p>

            <label className="mb-2 block text-sm font-medium text-slate-600">매장 사진 (선택)</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFilePick}
              className="hidden"
            />
            {pickedFile ? (
              <div className="mb-4">
                <ImageCropper file={pickedFile} onCancel={() => setPickedFile(null)} onCropped={handleCropped} />
              </div>
            ) : (
              <div className="mb-4 flex items-center gap-3">
                {croppedPreviewUrl || autoImageUrl ? (
                  <img
                    src={croppedPreviewUrl || autoImageUrl}
                    alt="매장 사진 미리보기"
                    className="h-16 w-16 rounded-xl object-cover"
                  />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-slate-50 text-2xl">🏪</div>
                )}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-medium text-slate-600"
                >
                  {croppedPreviewUrl ? "다른 사진 선택" : "사진 올리기"}
                </button>
                {!croppedPreviewUrl && autoImageUrl && (
                  <p className="text-xs text-slate-400">매장 검색으로 자동으로 찾은 사진이에요</p>
                )}
              </div>
            )}

            <label className="mb-2 block text-sm font-medium text-slate-600">카테고리 (중복 선택 가능)</label>
            {categoryOptions.length === 0 ? (
              <p className="mb-4 text-xs text-slate-400">등록된 카테고리가 없어요. 관리자 페이지에서 추가해주세요.</p>
            ) : (
              <div className="mb-4">
                <OptionChips options={categoryOptions} selected={categories} onToggle={toggleCategory} />
              </div>
            )}

            <label className="mb-2 block text-sm font-medium text-slate-600">
              키워드 (최대 {MAX_KEYWORDS}개, {keywords.length}/{MAX_KEYWORDS})
            </label>
            {keywordOptions.length === 0 ? (
              <p className="mb-6 text-xs text-slate-400">등록된 키워드가 없어요. 관리자 페이지에서 추가해주세요.</p>
            ) : (
              <div className="mb-6">
                <OptionChips
                  options={keywordOptions}
                  selected={keywords}
                  onToggle={toggleKeyword}
                  isDisabled={() => keywords.length >= MAX_KEYWORDS}
                />
              </div>
            )}

            {error && <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-500">{error}</p>}

            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="w-full rounded-xl bg-amber-500 py-3.5 font-semibold text-white disabled:bg-slate-200 disabled:text-slate-400"
            >
              {submitting ? "신청 중..." : "인증 신청"}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
