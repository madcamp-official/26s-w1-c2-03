import { Component } from "react"

// 화면 하나에서 터진 렌더링 에러가 앱 전체를 하얗게 만들지 않도록 잡아주는 최상위 안전망.
// 에러 바운더리는 클래스 컴포넌트로만 만들 수 있음(훅 대응 API가 없음).
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error("화면 렌더링 중 오류가 발생했어요:", error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-4xl">😵</p>
          <h1 className="text-lg font-bold text-slate-900">문제가 생겼어요</h1>
          <p className="text-sm text-slate-500">화면을 불러오는 중 오류가 발생했어요. 새로고침해서 다시 시도해주세요.</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 rounded-xl bg-amber-500 px-5 py-3 font-semibold text-white"
          >
            새로고침
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
