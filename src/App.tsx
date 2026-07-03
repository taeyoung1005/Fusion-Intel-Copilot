import type { ReactElement } from "react"
import { MobileCameraApp } from "./mobile/MobileCameraApp"
import { Dashboard } from "./ui/Dashboard"

const isDashboardRoute = (path: string): boolean => path === "/" || path === "/index.html"

export function App(): ReactElement {
  const path = window.location.pathname

  if (path === "/mobile-camera") {
    return <MobileCameraApp />
  }

  if (!isDashboardRoute(path)) {
    return (
      <main className="app-shell not-found-shell">
        <section className="not-found-panel" aria-labelledby="missing-route-title">
          <p className="panel-kicker">제어된 경로 상태</p>
          <h1 id="missing-route-title">없는 경로</h1>
          <p>이 브라우저 표면은 운용자 상황도 대시보드로 제한됩니다.</p>
        </section>
      </main>
    )
  }

  return <Dashboard />
}
