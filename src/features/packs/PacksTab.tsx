import { Check, Info, Plus, RotateCcw, Trash2 } from 'lucide-react'
import type { Dispatch, SetStateAction } from 'react'
import { useMemo, useState } from 'react'
import { CardDetail, CardImage } from '../../components/CardImage'
import { WISHLIST_DECK_ID, cardMatches, isInWishlist, normalizeQuery, toggleWishlistPrint } from '../../data/cardDb'
import { createEmptyPack, removePackFromDecks } from '../../data/storage'
import {
  DEFAULT_RATES,
  RARITIES,
  RATE_NOTICE,
} from '../../domain/constants'
import type { CardDb, DbCard, DbPrint, Pack, State } from '../../domain/types'

type PacksTabProps = {
  state: State
  setState: Dispatch<SetStateAction<State>>
  db: CardDb | null
  dbError: string
}

export function PacksTab({ state, setState, db, dbError }: PacksTabProps) {
  return (
    <div className="tab-panel">
      {db ? (
        <PackBrowser db={db} state={state} setState={setState} />
      ) : (
        <section className="empty-state">
          <h2>カードDB</h2>
          <p>{dbError || 'カードDBを読み込んでいます…'}</p>
        </section>
      )}
      <CustomPacks state={state} setState={setState} />
    </div>
  )
}

const RARITY_FILTERS = [
  { id: 'all', label: 'すべて', match: () => true },
  { id: 'diamond', label: '◇', match: (r: number) => r <= 3 },
  { id: 'star', label: '☆', match: (r: number) => r >= 4 && r <= 6 },
  { id: 'crown', label: '♛', match: (r: number) => r === 7 },
  { id: 'shiny', label: '✦', match: (r: number) => r >= 8 },
] as const

type FilterId = (typeof RARITY_FILTERS)[number]['id']

type PackBrowserProps = {
  db: CardDb
  state: State
  setState: Dispatch<SetStateAction<State>>
}

function PackBrowser({ db, state, setState }: PackBrowserProps) {
  const [packId, setPackId] = useState(() => readSavedPackId(db))
  const [filter, setFilter] = useState<FilterId>('all')
  const [query, setQuery] = useState('')
  const [detail, setDetail] = useState<{ card: DbCard; printId: string } | null>(null)

  const selectPack = (id: string) => {
    setPackId(id)
    try {
      localStorage.setItem('packnavi:browse-pack', id)
    } catch {
      // 保存できなくても動作には影響しない
    }
  }

  const tiles = useMemo(() => {
    const match = RARITY_FILTERS.find((item) => item.id === filter)?.match ?? (() => true)
    const normalizedQuery = normalizeQuery(query)
    const list: { card: DbCard; print: DbPrint }[] = []
    for (const card of db.cards) {
      if (!cardMatches(card, normalizedQuery)) {
        continue
      }
      for (const print of card.prints) {
        if (print.r != null && print.packs.includes(packId) && match(print.r)) {
          list.push({ card, print })
        }
      }
    }
    return list.sort((a, b) => (a.print.r ?? 0) - (b.print.r ?? 0))
  }, [db, packId, filter, query])

  const wishlistCount = state.decks.find((deck) => deck.id === WISHLIST_DECK_ID)?.cards.length ?? 0
  const pack = db.packsById.get(packId)

  return (
    <section className="pack-browser">
      <div className="section-heading">
        <h2>パックからほしいカードを選ぶ</h2>
        <span className="muted small">ほしいもの {wishlistCount}件</span>
      </div>
      <p className="muted small">
        カードをタップするとほしいものリストに追加/解除します。◇の絵柄は「どの絵柄でもOK」、☆以上は「その絵柄が欲しい」として登録します。
      </p>

      <label>
        <span className="field-label">パック</span>
        <select value={packId} onChange={(event) => selectPack(event.target.value)}>
          {db.packs.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
              {item.set ? ` (${item.set})` : ''}
            </option>
          ))}
        </select>
      </label>

      <div className="chip-list" aria-label="レアリティで絞り込み">
        {RARITY_FILTERS.map((item) => (
          <button
            className={`chip ${filter === item.id ? 'active' : ''}`}
            key={item.id}
            type="button"
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <input
        aria-label="カード名で絞り込み"
        placeholder="カード名・ワザ名で絞り込み"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      {pack ? (
        <p className="muted small">
          {tiles.length}枚表示 / 1パックあたり ◇{formatRate(pack.rates?.[0])} ☆{formatRate(pack.rates?.[4])} ♛
          {formatRate(pack.rates?.[7])}
        </p>
      ) : null}

      <div className="card-grid">
        {tiles.map(({ card, print }) => {
          const wanted = isInWishlist(state, card, print)
          return (
            <div className={`card-tile ${wanted ? 'wanted' : ''}`} key={print.id}>
              <button
                aria-pressed={wanted}
                className="card-tile-button"
                type="button"
                onClick={() => setState((current) => toggleWishlistPrint(current, card, print))}
              >
                <CardImage alt={card.name} db={db} printId={print.id} />
                {wanted ? (
                  <span className="wanted-badge" aria-hidden="true">
                    <Check size={14} />
                  </span>
                ) : null}
                <span className="card-tile-name">{card.name}</span>
                <span className="card-tile-rarity">{RARITIES[print.r ?? 0]}</span>
              </button>
              <button
                className="card-tile-info"
                type="button"
                title="詳細"
                onClick={() => setDetail({ card, printId: print.id })}
              >
                <Info size={14} />
              </button>
            </div>
          )
        })}
      </div>
      {tiles.length === 0 ? <p className="empty-line">該当するカードがありません。</p> : null}

      {detail ? <CardDetail card={detail.card} db={db} printId={detail.printId} onClose={() => setDetail(null)} /> : null}
    </section>
  )
}

function readSavedPackId(db: CardDb): string {
  try {
    const saved = localStorage.getItem('packnavi:browse-pack')
    if (saved && db.packsById.has(saved)) {
      return saved
    }
  } catch {
    // localStorage が使えない環境
  }
  return db.packs[0]?.id ?? ''
}

function formatRate(value: number | undefined): string {
  if (value == null) {
    return '-'
  }
  return value >= 0.1 ? value.toFixed(2) : value.toFixed(4)
}

type CustomPacksProps = {
  state: State
  setState: Dispatch<SetStateAction<State>>
}

function CustomPacks({ state, setState }: CustomPacksProps) {
  const addPack = () => {
    setState((current) => ({
      ...current,
      packs: [...current.packs, createEmptyPack()],
    }))
  }

  const updatePack = (packId: string, updater: (pack: Pack) => Pack) => {
    setState((current) => ({
      ...current,
      packs: current.packs.map((pack) => (pack.id === packId ? updater(pack) : pack)),
    }))
  }

  const deletePack = (packId: string) => {
    const confirmed = window.confirm('このパックを削除します。各カードの収録パックからも外します。')
    if (!confirmed) {
      return
    }
    setState((current) => ({
      ...current,
      packs: current.packs.filter((pack) => pack.id !== packId),
      decks: removePackFromDecks(current.decks, packId),
    }))
  }

  const updateRate = (index: number, value: number) => {
    setState((current) => ({
      ...current,
      rates: current.rates.map((rate, rateIndex) => (rateIndex === index ? value : rate)),
    }))
  }

  return (
    <details className="custom-packs" open={state.packs.length > 0}>
      <summary>手動パック (カードDB未収録の新弾など)</summary>

      <section className="toolbar-section">
        <button className="primary-button" type="button" onClick={addPack}>
          <Plus size={18} />
          <span>パック追加</span>
        </button>
      </section>

      <section className="rate-section">
        <p>{RATE_NOTICE}</p>
        <details>
          <summary>排出率を調整</summary>
          <div className="rate-grid">
            {RARITIES.map((rarity, index) => (
              <label key={rarity}>
                <span>{rarity}</span>
                <input
                  min={0}
                  step="0.0001"
                  type="number"
                  value={state.rates[index] ?? 0}
                  onChange={(event) => updateRate(index, toNumber(event.target.value))}
                />
              </label>
            ))}
          </div>
          <button
            className="secondary-button"
            type="button"
            onClick={() => setState((current) => ({ ...current, rates: [...DEFAULT_RATES] }))}
          >
            <RotateCcw size={18} />
            <span>通常封入の初期値に戻す</span>
          </button>
        </details>
      </section>

      {state.packs.length === 0 ? (
        <p className="empty-line">手動パックはありません。</p>
      ) : (
        <div className="pack-list">
          {state.packs.map((pack) => (
            <PackEditor
              deletePack={deletePack}
              key={pack.id}
              pack={pack}
              updatePack={updatePack}
            />
          ))}
        </div>
      )}
    </details>
  )
}

type PackEditorProps = {
  pack: Pack
  updatePack: (packId: string, updater: (pack: Pack) => Pack) => void
  deletePack: (packId: string) => void
}

function PackEditor({ pack, updatePack, deletePack }: PackEditorProps) {
  return (
    <section className="pack-editor">
      <div className="section-heading">
        <input
          className="title-input"
          value={pack.name}
          aria-label="パック名"
          onChange={(event) => updatePack(pack.id, (current) => ({ ...current, name: event.target.value }))}
        />
        <button className="icon-only-button danger" type="button" onClick={() => deletePack(pack.id)} title="パック削除">
          <Trash2 size={18} />
        </button>
      </div>
      <div className="pool-grid">
        {RARITIES.map((rarity, index) => (
          <label key={rarity}>
            <span>{rarity}</span>
            <input
              min={0}
              type="number"
              value={pack.n[index] ?? 0}
              onChange={(event) =>
                updatePack(pack.id, (current) => ({
                  ...current,
                  n: {
                    ...current.n,
                    [index]: toNumber(event.target.value),
                  },
                }))
              }
            />
          </label>
        ))}
      </div>
    </section>
  )
}

function toNumber(value: string): number {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 0
}
