import { Camera, FileJson, Images, Plus, Trash2 } from 'lucide-react'
import type { Dispatch, SetStateAction } from 'react'
import { useState } from 'react'
import { ChipSelector } from '../../components/ChipSelector'
import { createDeckFromImported, decodeDeckQrImage, decodeDeckText } from '../../data/deckImport'
import { createEmptyCard, createEmptyDeck, findKnownCard, normalizeLookup } from '../../data/storage'
import { RARITY_OPTIONS, RARITIES } from '../../domain/constants'
import type { Card, Deck, ImportedDeck, State } from '../../domain/types'

type DecksTabProps = {
  state: State
  setState: Dispatch<SetStateAction<State>>
}

export function DecksTab({ state, setState }: DecksTabProps) {
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
      const decoded = await decodeDeckQrImage(file)
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
      const decoded = await decodeDeckText(importText)
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
      decks: [...current.decks, createDeckFromImported(importedDeck, current)],
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
              {importedDeck.cards.map((card) => (
                <span key={`${card.name}-${card.unresolvedNr ?? card.name}`}>
                  {card.name} x{card.count}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      {state.decks.length === 0 ? (
        <section className="empty-state">
          <h2>デッキがありません</h2>
          <p>まずはデッキを追加して、必要なカードと持っている枚数を入れてください。</p>
        </section>
      ) : (
        state.decks.map((deck) => (
          <DeckEditor
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
  updateDeck: (deckId: string, updater: (deck: Deck) => Deck) => void
  deleteDeck: (deckId: string) => void
}

function DeckEditor({ deck, state, updateDeck, deleteDeck }: DeckEditorProps) {
  const totalNeed = deck.cards.reduce((sum, card) => sum + Math.max(0, card.need), 0)
  const totalOwn = deck.cards.reduce((sum, card) => sum + Math.min(Math.max(0, card.own), Math.max(0, card.need)), 0)

  const addCard = () => {
    updateDeck(deck.id, (current) => ({
      ...current,
      cards: [...current.cards, createEmptyCard()],
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
        {deck.cards.map((card, index) => (
          <CardEditor
            card={card}
            key={`${deck.id}-${index}`}
            packs={state.packs}
            isComplete={card.need > 0 && card.own >= card.need}
            updateCard={(updater) => updateCard(index, updater)}
            deleteCard={() => deleteCard(index)}
            onNameBlur={() => inheritMetadata(index)}
          />
        ))}
      </div>

      <button className="secondary-button" type="button" onClick={addCard}>
        <Plus size={18} />
        <span>カード追加</span>
      </button>
    </section>
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
        <span className="field-label">収録パック</span>
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
