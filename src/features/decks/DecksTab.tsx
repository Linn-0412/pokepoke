import { Camera, FileJson, Images, Info, Plus, Search, Trash2 } from 'lucide-react'
import type { Dispatch, SetStateAction } from 'react'
import { useMemo, useState } from 'react'
import { CardDetail, CardImage } from '../../components/CardImage'
import { ChipSelector } from '../../components/ChipSelector'
import {
  cardFromDb,
  displayRarity,
  pullablePrints,
  representativePrint,
  searchCards,
} from '../../data/cardDb'
import { createDeckFromImported, decodeDeckQrImage, decodeDeckText } from '../../data/deckImport'
import { createEmptyCard, createEmptyDeck, findKnownCard, normalizeLookup } from '../../data/storage'
import { RARITY_OPTIONS, RARITIES } from '../../domain/constants'
import type { Card, CardDb, DbCard, Deck, ImportedDeck, State } from '../../domain/types'

type DecksTabProps = {
  state: State
  setState: Dispatch<SetStateAction<State>>
  db: CardDb | null
}

export function DecksTab({ state, setState, db }: DecksTabProps) {
  const [importText, setImportText] = useState('')
  const [importedDeck, setImportedDeck] = useState<ImportedDeck | null>(null)
  const [importMessage, setImportMessage] = useState('')
  const [isImporting, setIsImporting] = useState(false)

  const addDeck = () => {
    setState((current) => ({
      ...current,
      decks: [...current.decks, createEmptyDeck()],
    }))
  }

  const updateDeck = (deckId: string, updater: (deck: Deck) => Deck) => {
    setState((current) => ({
      ...current,
      decks: current.decks.map((deck) => (deck.id === deckId ? updater(deck) : deck)),
    }))
  }

  const deleteDeck = (deckId: string) => {
    setState((current) => ({
      ...current,
      decks: current.decks.filter((deck) => deck.id !== deckId),
    }))
  }

  const handleQrFile = async (file: File | undefined) => {
    if (!file) {
      return
    }
    setIsImporting(true)
    setImportMessage('QR画像を解析しています。')
    try {
      const decoded = await decodeDeckQrImage(file, db)
      setImportedDeck(decoded)
      setImportMessage(`${decoded.cards.length}種類のカードを読み取りました。`)
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : 'QR画像を読み取れませんでした。')
    } finally {
      setIsImporting(false)
    }
  }

  const handleTextImport = async () => {
    setIsImporting(true)
    setImportMessage('コードを解析しています。')
    try {
      const decoded = await decodeDeckText(importText, db)
      setImportedDeck(decoded)
      setImportMessage(`${decoded.cards.length}種類のカードを読み取りました。`)
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : 'コードを読み取れませんでした。')
    } finally {
      setIsImporting(false)
    }
  }

  const addImportedDeck = () => {
    if (!importedDeck) {
      return
    }
    setState((current) => ({
      ...current,
      decks: [...current.decks, createDeckFromImported(importedDeck, current, db)],
    }))
    setImportedDeck(null)
    setImportText('')
    setImportMessage('デッキを追加しました。')
  }

  return (
    <div className="tab-panel">
      <section className="toolbar-section">
        <button className="primary-button" type="button" onClick={addDeck}>
          <Plus size={18} />
          <span>デッキ追加</span>
        </button>
      </section>

      <section className="import-panel">
        <h2>QR / コードから追加</h2>
        <p className="muted">
          ゲーム内の共有QRは非公式解析で読み取ります。読めない場合はコード貼り付けか手入力を使ってください。
        </p>
        <div className="import-actions">
          <label className="file-button">
            <Images size={18} />
            <span>写真から選択</span>
            <input
              type="file"
              accept="image/*"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0]
                event.currentTarget.value = ''
                void handleQrFile(file)
              }}
            />
          </label>
          <label className="file-button">
            <Camera size={18} />
            <span>カメラで撮影</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0]
                event.currentTarget.value = ''
                void handleQrFile(file)
              }}
            />
          </label>
          <button className="icon-button" type="button" onClick={handleTextImport} disabled={isImporting}>
            <FileJson size={18} />
            <span>解析</span>
          </button>
        </div>
        <textarea
          value={importText}
          placeholder="QRのBase64コード、JSON、または 2 ピカチュウ のようなデッキリスト"
          onChange={(event) => setImportText(event.target.value)}
        />
        {importMessage ? <p className="status-line">{importMessage}</p> : null}
        {importedDeck ? (
          <div className="import-preview">
            <div className="preview-heading">
              <strong>{importedDeck.name}</strong>
              <button className="primary-button" type="button" onClick={addImportedDeck}>
                <Plus size={18} />
                <span>この内容で追加</span>
              </button>
            </div>
            {importedDeck.warnings.map((warning) => (
              <p className="muted small" key={warning}>
                {warning}
              </p>
            ))}
            <div className="compact-card-list">
              {importedDeck.cards.map((card) => {
                const dbCard = card.cardId ? db?.cardsById.get(card.cardId) : undefined
                return (
                  <span className={dbCard ? 'with-thumb' : ''} key={`${card.name}-${card.cardId ?? card.unresolvedNr ?? ''}`}>
                    {db && dbCard ? (
                      <CardImage alt={dbCard.name} className="mini-thumb" db={db} printId={representativePrint(dbCard).id} />
                    ) : null}
                    {card.name} x{card.count}
                  </span>
                )
              })}
            </div>
          </div>
        ) : null}
      </section>

      {state.decks.length === 0 ? (
        <section className="empty-state">
          <h2>デッキがありません</h2>
          <p>まずはデッキを追加するか、パックタブでほしいカードをタップしてください。</p>
        </section>
      ) : (
        state.decks.map((deck) => (
          <DeckEditor
            db={db}
            deck={deck}
            key={deck.id}
            state={state}
            updateDeck={updateDeck}
            deleteDeck={deleteDeck}
          />
        ))
      )}
    </div>
  )
}

type DeckEditorProps = {
  deck: Deck
  state: State
  db: CardDb | null
  updateDeck: (deckId: string, updater: (deck: Deck) => Deck) => void
  deleteDeck: (deckId: string) => void
}

function DeckEditor({ deck, state, db, updateDeck, deleteDeck }: DeckEditorProps) {
  const totalNeed = deck.cards.reduce((sum, card) => sum + Math.max(0, card.need), 0)
  const totalOwn = deck.cards.reduce((sum, card) => sum + Math.min(Math.max(0, card.own), Math.max(0, card.need)), 0)

  const addCard = (card: Card = createEmptyCard()) => {
    updateDeck(deck.id, (current) => ({
      ...current,
      cards: [...current.cards, card],
    }))
  }

  const updateCard = (index: number, updater: (card: Card) => Card) => {
    updateDeck(deck.id, (current) => ({
      ...current,
      cards: current.cards.map((card, cardIndex) => (cardIndex === index ? updater(card) : card)),
    }))
  }

  const deleteCard = (index: number) => {
    updateDeck(deck.id, (current) => ({
      ...current,
      cards: current.cards.filter((_, cardIndex) => cardIndex !== index),
    }))
  }

  const inheritMetadata = (index: number) => {
    const card = deck.cards[index]
    if (!card?.name.trim()) {
      return
    }
    const known = findKnownCardOutside(state, deck.id, index, card.name)
    if (!known) {
      return
    }
    updateCard(index, (current) => ({
      ...current,
      r: known.r,
      packs: known.packs.length > 0 ? [...known.packs] : current.packs,
    }))
  }

  return (
    <section className="deck-editor">
      <div className="section-heading">
        <div>
          <input
            className="title-input"
            value={deck.name}
            aria-label="デッキ名"
            onChange={(event) => updateDeck(deck.id, (current) => ({ ...current, name: event.target.value }))}
          />
          <p className="muted">
            {totalOwn}枚 / {totalNeed}枚
          </p>
        </div>
        <button className="icon-only-button danger" type="button" onClick={() => deleteDeck(deck.id)} title="デッキ削除">
          <Trash2 size={18} />
        </button>
      </div>

      <div className="progress-bar" aria-label="デッキ進捗">
        <span style={{ width: totalNeed > 0 ? `${Math.min(100, (totalOwn / totalNeed) * 100)}%` : '0%' }} />
      </div>

      <div className="card-editor-list">
        {deck.cards.map((card, index) => {
          const dbCard = card.cardId ? db?.cardsById.get(card.cardId) : undefined
          const key = `${deck.id}-${index}`
          const common = {
            card,
            isComplete: card.need > 0 && card.own >= card.need,
            updateCard: (updater: (card: Card) => Card) => updateCard(index, updater),
            deleteCard: () => deleteCard(index),
          }
          return db && dbCard ? (
            <DbCardEditor key={key} {...common} db={db} dbCard={dbCard} />
          ) : (
            <CardEditor key={key} {...common} packs={state.packs} onNameBlur={() => inheritMetadata(index)} />
          )
        })}
      </div>

      {db ? <CardSearch db={db} onAdd={(card) => addCard(cardFromDb(card))} /> : null}

      <button className="secondary-button" type="button" onClick={() => addCard()}>
        <Plus size={18} />
        <span>手入力でカード追加</span>
      </button>
    </section>
  )
}

function CardSearch({ db, onAdd }: { db: CardDb; onAdd: (card: DbCard) => void }) {
  const [query, setQuery] = useState('')
  const [detail, setDetail] = useState<DbCard | null>(null)
  const results = useMemo(() => searchCards(db, query, 30), [db, query])

  return (
    <div className="card-search">
      <label className="search-input">
        <Search size={16} />
        <input
          aria-label="カードを検索して追加"
          placeholder="カード名・ワザ名で検索して追加"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      {results.length > 0 ? (
        <div className="search-results">
          {results.map((card) => (
            <div className="search-result" key={card.id}>
              <button
                className="search-result-main"
                type="button"
                onClick={() => {
                  onAdd(card)
                  setQuery('')
                }}
              >
                <CardImage alt={card.name} db={db} printId={representativePrint(card).id} />
                <span>
                  <strong>{card.name}</strong>
                  <span className="muted small">{describeCard(card, db)}</span>
                </span>
                <Plus size={18} />
              </button>
              <button className="icon-only-button" type="button" title="詳細" onClick={() => setDetail(card)}>
                <Info size={16} />
              </button>
            </div>
          ))}
        </div>
      ) : null}
      {detail ? <CardDetail card={detail} db={db} onClose={() => setDetail(null)} /> : null}
    </div>
  )
}

/** 同名カードを見分けるための説明: ワザ名と収録パック */
function describeCard(card: DbCard, db: CardDb): string {
  const moves = [card.ability ? `特性:${card.ability.n}` : '', ...(card.moves ?? []).map((move) => move.n)]
    .filter(Boolean)
    .join(' / ')
  const packs = [...new Set(pullablePrints(card).flatMap((print) => print.packs))]
    .map((packId) => db.packsById.get(packId)?.name ?? packId)
  const packText = packs.length > 0 ? packs.slice(0, 2).join('・') + (packs.length > 2 ? ' 他' : '') : 'プロモ'
  return [moves, packText].filter(Boolean).join(' | ')
}

type DbCardEditorProps = {
  card: Card
  db: CardDb
  dbCard: DbCard
  isComplete: boolean
  updateCard: (updater: (card: Card) => Card) => void
  deleteCard: () => void
}

function DbCardEditor({ card, db, dbCard, isComplete, updateCard, deleteCard }: DbCardEditorProps) {
  const [detail, setDetail] = useState(false)
  const prints = pullablePrints(dbCard)
  const selected = new Set(card.printIds ?? [])
  const shown = representativePrint(dbCard, card.printIds)

  const setPrintIds = (printIds: string[]) =>
    updateCard((current) => {
      const next: Card = { ...current, r: displayRarity(dbCard, printIds) }
      if (printIds.length > 0) {
        next.printIds = printIds
      } else {
        delete next.printIds
      }
      return next
    })

  return (
    <article className={`card-editor db-card-editor ${isComplete ? 'complete' : ''}`}>
      <div className="db-card-main">
        <button className="thumb-button" type="button" title="詳細" onClick={() => setDetail(true)}>
          <CardImage alt={dbCard.name} db={db} printId={shown.id} />
        </button>
        <div className="db-card-fields">
          <strong>{dbCard.name}</strong>
          <span className="muted small">{describeCard(dbCard, db)}</span>
          <div className="number-row">
            <label>
              <span>所持</span>
              <input
                min={0}
                type="number"
                value={card.own}
                onChange={(event) => updateCard((current) => ({ ...current, own: toNumber(event.target.value) }))}
              />
            </label>
            <label>
              <span>必要</span>
              <input
                min={0}
                type="number"
                value={card.need}
                onChange={(event) => updateCard((current) => ({ ...current, need: toNumber(event.target.value) }))}
              />
            </label>
          </div>
        </div>
      </div>
      {prints.length > 1 ? (
        <div>
          <span className="field-label">欲しい絵柄</span>
          <div className="chip-list" aria-label="欲しい絵柄">
            <button
              className={`chip ${selected.size === 0 ? 'active' : ''}`}
              type="button"
              onClick={() => setPrintIds([])}
            >
              どれでもOK
            </button>
            {prints.map((print) => (
              <button
                className={`chip ${selected.has(print.id) ? 'active' : ''}`}
                key={print.id}
                type="button"
                title={print.packs.map((packId) => db.packsById.get(packId)?.name ?? packId).join(' / ')}
                onClick={() =>
                  setPrintIds(
                    selected.has(print.id)
                      ? [...selected].filter((id) => id !== print.id)
                      : [...selected, print.id],
                  )
                }
              >
                {RARITIES[print.r ?? 0]}
                <span className="chip-sub">{db.packsById.get(print.packs[0])?.name ?? ''}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <div className="card-footer">
        <span className="muted small">
          {RARITIES[displayRarity(dbCard, card.printIds)]} / {Math.max(0, card.need - card.own)}枚不足
        </span>
        <button className="icon-button danger" type="button" onClick={deleteCard}>
          <Trash2 size={16} />
          <span>削除</span>
        </button>
      </div>
      {detail ? <CardDetail card={dbCard} db={db} printId={shown.id} onClose={() => setDetail(false)} /> : null}
    </article>
  )
}

type CardEditorProps = {
  card: Card
  packs: State['packs']
  isComplete: boolean
  updateCard: (updater: (card: Card) => Card) => void
  deleteCard: () => void
  onNameBlur: () => void
}

function CardEditor({ card, packs, isComplete, updateCard, deleteCard, onNameBlur }: CardEditorProps) {
  return (
    <article className={`card-editor ${isComplete ? 'complete' : ''}`}>
      <div className="card-editor-main">
        <label>
          <span>カード名</span>
          <input
            value={card.name}
            onBlur={onNameBlur}
            onChange={(event) => updateCard((current) => ({ ...current, name: event.target.value }))}
            placeholder="ピカチュウex"
          />
        </label>
        <label>
          <span>レアリティ</span>
          <select
            value={card.r}
            onChange={(event) => updateCard((current) => ({ ...current, r: Number(event.target.value) }))}
          >
            {RARITY_OPTIONS.map((rarity) => (
              <option key={rarity.value} value={rarity.value}>
                {rarity.label}
              </option>
            ))}
          </select>
        </label>
        <div className="number-row">
          <label>
            <span>所持</span>
            <input
              min={0}
              type="number"
              value={card.own}
              onChange={(event) => updateCard((current) => ({ ...current, own: toNumber(event.target.value) }))}
            />
          </label>
          <label>
            <span>必要</span>
            <input
              min={0}
              type="number"
              value={card.need}
              onChange={(event) => updateCard((current) => ({ ...current, need: toNumber(event.target.value) }))}
            />
          </label>
        </div>
      </div>
      <div>
        <span className="field-label">収録パック (手動パック)</span>
        <ChipSelector packs={packs} selected={card.packs} onChange={(packIds) => updateCard((current) => ({ ...current, packs: packIds }))} />
      </div>
      <div className="card-footer">
        <span className="muted small">
          {RARITIES[card.r]} / {Math.max(0, card.need - card.own)}枚不足
        </span>
        <button className="icon-button danger" type="button" onClick={deleteCard}>
          <Trash2 size={16} />
          <span>削除</span>
        </button>
      </div>
    </article>
  )
}

function findKnownCardOutside(state: State, deckId: string, cardIndex: number, name: string): Card | null {
  const normalizedName = normalizeLookup(name)
  if (!normalizedName) {
    return null
  }

  for (const deck of state.decks) {
    for (const [index, card] of deck.cards.entries()) {
      if (deck.id === deckId && index === cardIndex) {
        continue
      }
      if (normalizeLookup(card.name) === normalizedName) {
        return card
      }
    }
  }
  return findKnownCard(name, state.decks)
}

function toNumber(value: string): number {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0
}
