import { Bell } from 'lucide-react'
import type { CalculationResult } from '../domain/types'
import { recommendationMessage } from '../data/notifications'

type NoticeBarProps = {
  result: CalculationResult
  notificationStatus: string
  onNotify: () => void
}

export function NoticeBar({ result, notificationStatus, onNotify }: NoticeBarProps) {
  return (
    <section className="notice-bar" aria-label="今のおすすめ">
      <div>
        <span className="eyebrow">今のおすすめパック</span>
        <p>{recommendationMessage(result)}</p>
      </div>
      <button className="icon-only-button" type="button" onClick={onNotify} title="端末通知を試す">
        <Bell size={18} />
      </button>
      {notificationStatus ? <small>{notificationStatus}</small> : null}
    </section>
  )
}
