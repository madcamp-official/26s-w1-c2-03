import { useEffect, useRef, useState } from "react"
import {
  createStore,
  getCategoryOptions,
  getKeywordOptions,
  searchPlace,
  getPlaceImage,
  uploadStoreThumbnail,
} from "../lib/api"
import OptionChips from "../components/OptionChips"
import ImageCropper from "../components/ImageCropper"

const MAX_KEYWORDS = 3

// 매장 등록 — ownerId는 로그인한 계정(카카오)의 id를 그대로 씀
export default function OwnerDashboardScreen({ ownerId, onRegistered }) {
  const [name, setName] = useState("")
  const [address, setAddress] = useState("")
  const [kakaoPlaceId, setKakaoPlaceId] = useState(null) // 검색으로 고른 실제 카카오 장소 ID (중복 판별용, 직접 입력 시 없음)
  const [categoryOptions, setCategoryOptions] = useState([])
  const [keywordOptions, setKeywordOptions] = useState([])
  const [categories, setCategories] = useState([])
  const [keywords, setKeywords] = useState([])

  const [placeQuery, setPlaceQuery] = useState("")
  const [placeResults, setPlaceResults] = useState(null)
  const [searching, setSearching] = useState(false)

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

  // 카카오 장소검색으로 이미 등록된 실제 매장 정보(이름/주소)를 찾아 자동으로 채워줌
  const handlePlaceSearch = async () => {
    if (!placeQuery.trim()) return
    setSearching(true)
    setError("")
    try {
      const results = await searchPlace(placeQuery.trim())
      setPlaceResults(results)
    } catch (e) {
      setError(e.message || "장소 검색에 실패했어요")
    } finally {
      setSearching(false)
    }
  }

  const handlePickPlace = (place) => {
    setName(place.name || "")
    setAddress(place.address || "")
    setKakaoPlaceId(place.kakao_place_id || null)
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

  const canSubmit = name.trim() && address.trim() && categories.length > 0 && !submitting

  const handleSubmit = async () => {
    setSubmitting(true)
    setError("")
    try {
      // 직접 올린 사진이 없으면 장소검색으로 자동으로 찾은 사진을 등록과 동시에 넣음
      const store = await createStore({
        ownerId,
        name,
        address,
        categories,
        keywords,
        imageUrl: croppedBlob ? undefined : autoImageUrl || undefined,
        kakaoPlaceId,
      })
      // 직접 올린 사진이 있으면 등록 직후 업로드해서 덮어씀
      const finalStore = croppedBlob ? await uploadStoreThumbnail(store.id, croppedBlob) : store
      onRegistered(finalStore)
    } catch (e) {
      setError(e.message || "매장 등록에 실패했어요")
      setSubmitting(false)
    }
  }

  return (
    <div className="px-5 py-6">
      <h2 className="mb-4 text-lg font-semibold text-slate-900">매장 등록</h2>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-600">매장 검색으로 자동 입력 (선택)</label>
        <div className="mb-1 flex gap-2">
          <input
            value={placeQuery}
            onChange={(e) => setPlaceQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handlePlaceSearch()}
            placeholder="실제 매장 이름으로 검색 (예: 성수동 감성카페)"
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
          검색 결과를 고르면 이름·주소가 자동으로 채워져요. 카테고리·키워드는 검색으로 못 채워서 직접 골라야 해요.
        </p>

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

        <label className="mb-1 block text-sm font-medium text-slate-600">매장 이름</label>
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setKakaoPlaceId(null) // 검색으로 고른 뒤 직접 수정하면 더 이상 그 장소와 동일하다고 보장 못 함
          }}
          placeholder="예: 성수동 감성카페"
          className="mb-4 w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 outline-none focus:border-amber-400"
        />

        <label className="mb-1 block text-sm font-medium text-slate-600">주소</label>
        <input
          value={address}
          onChange={(e) => {
            setAddress(e.target.value)
            setKakaoPlaceId(null)
          }}
          placeholder="예: 서울 성동구 성수동 123"
          className="mb-1 w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 outline-none focus:border-amber-400"
        />
        <p className="mb-4 text-xs text-slate-400">주소를 입력하면 서버가 자동으로 지도 좌표로 변환해요</p>

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
          {submitting ? "등록 중..." : "매장 등록"}
        </button>
      </div>
    </div>
  )
}
