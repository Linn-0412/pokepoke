import { Boxes, Layers, ListChecks } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { ExportImport } from './components/ExportImport'
import { NoticeBar } from './components/NoticeBar'
import { linkCardsToDb, loadCardDb, useCardDb } from './data/cardDb'
import { notifyRecommendation } from './data/notifications'
import { loadState, saveState } from './data/storage'
import { calculatePackRankings } from './domain/calculator'
import type { State } from './domain/types'
import { DecksTab } from './features/decks/DecksTab'
import { PacksTab } from './features/packs/PacksTab'
import { RecommendTab } from './features/recommend/RecommendTab'

type Tab = 'recommend' | 'decks' | 'packs'

const tabs: { id: Tab; label: string; icon: typeof ListChecks }[] = [
  { id: 'recommend', label: 'おすすめ', icon: ListChecks },
  { id: 'decks', label: 'デッキ', icon: Layers },
  { id: 'packs', label: 'パック', icon: Boxes },
]

function App() {
  const [state, setState] = useState<State>(() => loadState())
  const [activeTab, setActiveTab] = useState<Tab>('recommend')
  const [notificationStatus, setNotificationStatus] = useState('')
  const { db, error: dbError } = useCardDb()
  const result = useMemo(() => calculatePackRankings(state, db), [state, db])

  useEffect(() => {
    saveState(state)
  }, [state])

  // 名前だけで登録済みのカード (以前のQR取り込みなど) をカードDBに紐付ける
  useEffect(() => {
    loadCardDb()
      .then((loaded) => setState((current) => linkCardsToDb(current, loaded)))
      .catch(() => {
        // 読み込み失敗は useCardDb 側で表示する
      })
  }, [])

  const handleImport = (imported: State) => setState(db ? linkCardsToDb(imported, db) : imported)

  const handleNotify = async () => {
    setNotificationStatus(await notifyRecommendation(result))
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Pokemon TCG Pocket</p>
          <h1>おすすめパック計算ツール</h1>
        </div>
        <ExportImport state={state} onImport={handleImport} />
      </header>

      <NoticeBar result={result} notificationStatus={notificationStatus} onNotify={handleNotify} />

      <nav className="tab-nav" aria-label="メイン">
        {tabs.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              className={activeTab === tab.id ? 'active' : ''}
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon size={18} />
              <span>{tab.label}</span>
            </button>
          )
        })}
      </nav>

      <main>
        {activeTab === 'recommend' ? <RecommendTab state={state} result={result} db={db} /> : null}
        {activeTab === 'decks' ? <DecksTab state={state} setState={setState} db={db} /> : null}
        {activeTab === 'packs' ? <PacksTab state={state} setState={setState} db={db} dbError={dbError} /> : null}
      </main>
    </div>
  )
}

export default App
