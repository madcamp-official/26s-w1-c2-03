import { useEffect, useState } from "react"
import { getStores, reviewStore } from "../lib/api"

// 사업자등록번호는 뒷자리를 가려서 보여줌 (관리자 화면이어도 전체 노출은 불필요)
function maskBrn(b_no) {
  if (!b_no || b_no.length !== 10) return b_no
  return `${b_no.slice(0, 3)}-${b_no.slice(3, 5)}-${b_no.slice(5, 7)}***`
}

// 관리자 — 국세청 진위확인을 통과하고 승인 대기 중인 매장 등록 신청을 최종 승인/반려
export default function AdminStoreApprovalScreen() {
  const [stores, setStores] = useState(null)
  const [processingId, setProcessingId] = useState(null)
  const [error, setError] = useState("")

  const reload = () => {
    getStores({ status: "pending" })
      .then(setStores)
      .catch((e) => setError(e.message || "목록을 불러오지 못했어요"))
  }
  useEffect(reload, [])

  const handleReview = async (store, status) => {
    if (status === "rejected" && !window.confirm(`"${store.name}" 등록 신청을 반려할까요?`)) return
    setProcessingId(store.id)
    setError("")
    try {
      await reviewStore({ storeId: store.id, status })
      setStores((prev) => prev.filter((s) => s.id !== store.id))
    } catch (e) {
      setError(e.message || "처리에 실패했어요")
    } finally {
      setProcessingId(null)
    }
  }

  return (
    <div className="mx-auto max-w-[560px] px-5 py-8">
      <h1 className="mb-1 text-2xl font-bold text-slate-900">🏪 관리자 — 매장 인증 승인</h1>
      <p className="mb-6 text-sm text-slate-500">
        매장은 이미 손님 화면에 노출되고 있어요. 여기서 승인하면 체크인 승인·리워드 설정 같은 운영 권한이
        그 사장님에게 생겨요. 국세청 사업자등록정보 진위확인을 통과한 신청 건이니 카카오맵 정보와 비교해서 최종 승인해주세요.
      </p>

      {error && <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-500">{error}</p>}

      {stores === null ? (
        <p className="text-sm text-slate-400">불러오는 중...</p>
      ) : stores.length === 0 ? (
        <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
          승인 대기 중인 매장이 없어요.
        </p>
      ) : (
        <div className="space-y-3">
          {stores.map((s) => (
            <div key={s.id} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
              <div className="flex items-start gap-3">
                {s.image_url ? (
                  <img src={s.image_url} alt={s.name} className="h-14 w-14 rounded-xl object-cover" />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-slate-50 text-2xl">🏪</div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">{s.name}</p>
                  <p className="text-sm text-slate-500">{s.address}</p>
                  <p className="mt-0.5 text-xs text-slate-400">{(s.categories || []).join(", ")}</p>
                </div>
              </div>

              <div className="mt-3 space-y-0.5 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
                <p>사업자등록번호: {maskBrn(s.business_registration_number)} (국세청 진위확인 통과)</p>
                <p>대표자: {s.business_owner_name}</p>
                <p>
                  개업일자: {s.business_start_date?.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3")}
                </p>
              </div>

              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => handleReview(s, "rejected")}
                  disabled={processingId === s.id}
                  className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-500 disabled:opacity-50"
                >
                  반려
                </button>
                <button
                  onClick={() => handleReview(s, "approved")}
                  disabled={processingId === s.id}
                  className="flex-1 rounded-xl bg-amber-500 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {processingId === s.id ? "처리 중..." : "승인"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
