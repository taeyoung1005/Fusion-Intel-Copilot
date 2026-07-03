import { Activity, Bell, MessageSquare, Settings, ShieldCheck, Siren } from "lucide-react"
import { type ReactElement, useEffect, useState } from "react"
import { HEADER } from "./copData"

type CommandBarProps = {
  readonly onCommand: (message: string) => void
}

const pad = (value: number): string => String(value).padStart(2, "0")
const liveClock = (): string => {
  const now = new Date()
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
}

export function CommandBar({ onCommand }: CommandBarProps): ReactElement {
  // Real local time, ticking every second.
  const [clock, setClock] = useState(liveClock)
  useEffect(() => {
    const timer = window.setInterval(() => setClock(liveClock()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  return (
    <header className="cop-bar" aria-label="상단 명령 막대">
      <div className="cop-bar-brand">
        <span className="cop-brand-mark" aria-hidden="true">
          <BrandGlyph />
        </span>
        <div className="cop-brand-text">
          <h1>{HEADER.title}</h1>
          <p>{HEADER.subtitle}</p>
        </div>
      </div>

      <div className="cop-bar-status" aria-label="시스템 상태">
        <span className="cop-status-pill ok">
          <Activity size={14} aria-hidden="true" />
          {HEADER.systemStatus}
        </span>
        <span className="cop-status-pill">
          <ShieldCheck size={14} aria-hidden="true" />
          {HEADER.agents}
        </span>
        <span className="cop-status-pill watch">
          <Siren size={14} aria-hidden="true" />
          {HEADER.alert}
        </span>
        <span className="cop-status-clock">
          <strong>{clock}</strong>
          <small>LOCAL</small>
        </span>
      </div>

      <div className="cop-bar-operator">
        <span className="cop-operator">
          <span className="cop-operator-avatar" aria-hidden="true">
            {HEADER.operatorBadge}
          </span>
          <span className="cop-operator-text">
            <small>{HEADER.operatorRole}</small>
            <strong>{HEADER.operatorName}</strong>
          </span>
        </span>
        <button
          className="cop-icon-button"
          type="button"
          aria-label="메시지"
          onClick={() => onCommand("메시지 패널 대기: 시연 모드에서는 운용 로그로 기록됩니다.")}
        >
          <MessageSquare size={16} aria-hidden="true" />
        </button>
        <button
          className="cop-icon-button"
          type="button"
          aria-label="알림"
          onClick={() => onCommand("알림 확인: 현재 WATCH 2건, NORMAL 1건이 표시 중입니다.")}
        >
          <Bell size={16} aria-hidden="true" />
        </button>
        <button
          className="cop-icon-button has-dot"
          type="button"
          aria-label="설정"
          onClick={() => onCommand("설정 패널: 합성 COP 데모 설정은 고정 상태입니다.")}
        >
          <Settings size={16} aria-hidden="true" />
          <span className="cop-icon-dot" aria-hidden="true" />
        </button>
        <button
          className="cop-icon-button cop-menu"
          type="button"
          aria-label="전체 메뉴"
          onClick={() =>
            onCommand("전체 메뉴 열림: 지도, 사건, 보고, 대응 표면을 한 화면에 유지합니다.")
          }
        >
          <span aria-hidden="true" />
          <span aria-hidden="true" />
          <span aria-hidden="true" />
        </button>
      </div>
    </header>
  )
}

function BrandGlyph(): ReactElement {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" role="presentation">
      <path
        d="M12 2 L20 6.5 L20 15.5 L12 20 L4 15.5 L4 6.5 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="11" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M12 2 L12 7.8 M20 6.5 L15 9.4 M4 6.5 L9 9.4"
        stroke="currentColor"
        strokeWidth="1.1"
      />
    </svg>
  )
}
