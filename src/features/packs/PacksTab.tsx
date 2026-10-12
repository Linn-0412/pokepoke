import { Plus, RotateCcw, Trash2 } from 'lucide-react'
import type { Dispatch, SetStateAction } from 'react'
import { createEmptyPack, removePackFromDecks } from '../../data/storage'
import {
  DEFAULT_RATES,
  RARITIES,
  RATE_NOTICE,
  RATE_SOURCE_LABEL,
  RATE_SOURCE_URL,
} from '../../domain/constants'
import type { Pack, State } from '../../domain/types'

type PacksTabProps = {
  state: State
  setState: Dispatch<SetStateAction<State>>
}

export function PacksTab({ state, setState }: PacksTabProps) {
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
    <div className="tab-panel">
      <section className="toolbar-section">
        <button className="primary-button" type="button" onClick={addPack}>
          <Plus size={18} />
          <span>パック追加</span>
        </button>
      </section>

      <section className="rate-section">
        <p>{RATE_NOTICE}</p>
        <a className="rate-source" href={RATE_SOURCE_URL} target="_blank" rel="noreferrer">
          出典: {RATE_SOURCE_LABEL}
        </a>
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
            <span>GameWith通常封入に戻す</span>
          </button>
        </details>
      </section>

      {state.packs.length === 0 ? (
        <section className="empty-state">
          <h2>パックがありません</h2>
          <p>パックを追加して、レアリティごとの排出カードプール枚数を入力してください。</p>
        </section>
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
    </div>
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
