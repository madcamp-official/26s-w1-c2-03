import { useState } from "react"
import { updateProfile, checkNickname } from "../lib/api"

// 마이페이지 → 프로필 수정 (닉네임 중복 확인 + 사진 변경). 온보딩 화면과 API를 그대로 재사용.
export default function EditProfileScreen({ user, onBack, onDone }) {
  const [nickname, setNickname] = useState(user.nickname || "")
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(user.profile_image_url || null)
  const [checking, setChecking] = useState(false)
  const [nicknameError, setNicknameError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)

  const handleImagePick = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  const handleBlurCheck = async () => {
    const trimmed = nickname.trim()
    if (!trimmed || trimmed === user.nickname) return
    setChecking(true)
    setNicknameError(null)
    try {
      const { available } = await checkNickname(trimmed, user.id)
      if (!available) setNicknameError("이미 사용 중인 닉네임이에요.")
    } catch {
      // 확인 자체가 실패해도 저장 시 서버에서 다시 검증되니 조용히 넘어감
    } finally {
      setChecking(false)
    }
  }

  const handleSubmit = async () => {
    const trimmed = nickname.trim()
    if (!trimmed) {
      setSubmitError("닉네임을 입력해주세요.")
      return
    }
    setSubmitError(null)
    setSubmitting(true)
    try {
      const updated = await updateProfile({ userId: user.id, nickname: trimmed, imageFile })
      onDone(updated)
    } catch (err) {
      setSubmitError(err.message || "저장에 실패했어요. 다시 시도해주세요.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="pb-4 lg:mx-auto lg:max-w-xl">
      <header className="flex items-center gap-3 px-5 pt-6 pb-4">
        <button onClick={onBack} className="text-2xl text-slate-400">
          ‹
        </button>
        <h1 className="text-lg font-semibold text-slate-900">프로필 수정</h1>
      </header>

      <div className="px-5">
        {/* 프로필 사진 */}
        <div className="mb-6 flex flex-col items-center">
          <label className="relative flex h-24 w-24 cursor-pointer items-center justify-center overflow-hidden rounded-full bg-amber-50 text-4xl">
            {imagePreview ? (
              <img src={imagePreview} alt="프로필 미리보기" className="h-full w-full object-cover" />
            ) : (
              "🙂"
            )}
            <input type="file" accept="image/*" onChange={handleImagePick} className="hidden" />
          </label>
          <p className="mt-2 text-xs text-slate-400">탭해서 사진 변경</p>
        </div>

        {/* 닉네임 */}
        <label className="mb-1 block text-sm font-medium text-slate-600">닉네임</label>
        <input
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          onBlur={handleBlurCheck}
          placeholder="닉네임을 입력하세요"
          maxLength={20}
          className={`w-full rounded-xl border px-4 py-3 text-slate-900 outline-none ${
            nicknameError ? "border-red-300" : "border-slate-200 focus:border-amber-400"
          }`}
        />
        {checking && <p className="mt-1 text-xs text-slate-400">중복 확인 중...</p>}
        {nicknameError && <p className="mt-1 text-xs text-red-500">{nicknameError}</p>}

        {submitError && <p className="mt-3 text-sm text-red-500">{submitError}</p>}

        <button
          onClick={handleSubmit}
          disabled={submitting || !!nicknameError}
          className="mt-8 w-full rounded-xl bg-amber-500 py-3.5 font-semibold text-white disabled:bg-slate-200 disabled:text-slate-400"
        >
          {submitting ? "저장 중..." : "저장"}
        </button>
      </div>
    </div>
  )
}
