import { useState } from "react"
import { updateProfile, checkNickname } from "../lib/api"
import { suggestAvailableNickname } from "../lib/randomNickname"

export default function NicknameSetupScreen({ user, onDone }) {
  const [nickname, setNickname] = useState(user.nickname || "")
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
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

  const handleRandomNickname = async () => {
    setNicknameError(null)
    setNickname(await suggestAvailableNickname(user.id))
  }

  const handleBlurCheck = async () => {
    const trimmed = nickname.trim()
    if (!trimmed) return
    setChecking(true)
    setNicknameError(null)
    try {
      const { available } = await checkNickname(trimmed, user.id)
      if (!available) setNicknameError("이미 사용 중인 닉네임이에요.")
    } catch {
      // 확인 자체가 실패해도 제출 시 서버에서 다시 검증되니 조용히 넘어감
    } finally {
      setChecking(false)
    }
  }

  const handleSubmit = async () => {
    const trimmed = nickname.trim() || user.nickname // 아무것도 안 하면 카카오에서 받아온 원래 닉네임 유지
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
    <div className="flex flex-1 flex-col justify-center px-8">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-slate-900">환영해요! 🎉</h1>
        <p className="mt-2 text-slate-500">프로필을 꾸며볼까요? 나중에 언제든 바꿀 수 있어요.</p>
      </div>

      {/* 프로필 사진 — 안 고르면 기본 이미지로 진행 */}
      <div className="mb-6 flex flex-col items-center">
        <label className="relative flex h-24 w-24 cursor-pointer items-center justify-center overflow-hidden rounded-full bg-amber-50 text-4xl">
          {imagePreview ? (
            <img src={imagePreview} alt="프로필 미리보기" className="h-full w-full object-cover" />
          ) : (
            "🙂"
          )}
          <input type="file" accept="image/*" onChange={handleImagePick} className="hidden" />
        </label>
        <p className="mt-2 text-xs text-slate-400">
          {imagePreview ? "탭해서 다시 선택" : "탭해서 사진 선택 (안 하면 기본 이미지)"}
        </p>
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

      <button
        onClick={handleRandomNickname}
        className="mt-2 self-start text-sm font-medium text-amber-600"
      >
        🎲 랜덤 닉네임 추천
      </button>

      {submitError && <p className="mt-3 text-sm text-red-500">{submitError}</p>}

      <button
        onClick={handleSubmit}
        disabled={submitting || !!nicknameError}
        className="mt-8 w-full rounded-xl bg-amber-500 py-3.5 font-semibold text-white disabled:bg-slate-200 disabled:text-slate-400"
      >
        {submitting ? "저장 중..." : "시작하기"}
      </button>

      <p className="mt-3 text-center text-xs text-slate-400">
        아무것도 안 하고 시작하면 카카오 닉네임 그대로 사용돼요.
      </p>
    </div>
  )
}