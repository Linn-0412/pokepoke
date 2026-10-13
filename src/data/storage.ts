import { EMPTY_STATE, RARITIES, STORAGE_KEY } from '../domain/constants'
import type { Card, Deck, Pack, State } from '../domain/types'

export function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}

export function createEmptyCard(overrides: Partial<Card> = {}): Card {
  return {
    name: '',
    r: 0,
    need: 2,
    own: 0,
    packs: [],
    ...overrides,
  }
}

export function createEmptyDeck(name = '新しいデッキ'): Deck {
  return {
    id: createId('deck'),
    name,
    cards: [],
  }
}

export function createEmptyPack(name = '新しいパック'): Pack {
  return {
    id: createId('pack'),
    name,
    n: {},
  }
}

export function loadState(): State {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return cloneState(EMPTY_STATE)
    }
    return normalizeState(JSON.parse(raw))
  } catch {
    return cloneState(EMPTY_STATE)
  }
}

export function saveState(state: State): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeState(state)))
  } catch {
    // localStorage may be unavailable in private mode or blocked browsers.
  }
}

export function parseStateJson(json: string): State {
  try {
    return normalizeState(JSON.parse(json))
  } catch {
    throw new Error('JSONを読み込めませんでした。')
  }
}

export function serializeState(state: State): string {
  return JSON.stringify(normalizeState(state), null, 2)
}

export function normalizeState(value: unknown): State {
  if (!value || typeof value !== 'object') {
    return cloneState(EMPTY_STATE)
  }
  const source = value as Partial<State>
  const rates = Array.isArray(source.rates)
    ? source.rates.map((rate, index) => normalizeNumber(rate, EMPTY_STATE.rates[index] ?? 0))
    : [...EMPTY_STATE.rates]

  return {
    packs: Array.isArray(source.packs) ? source.packs.map(normalizePack) : [],
    decks: Array.isArray(source.decks) ? source.decks.map(normalizeDeck) : [],
    rates: RARITIES.map((_, index) => rates[index] ?? EMPTY_STATE.rates[index] ?? 0),
  }
}

export function findKnownCardById(cardId: string, decks: Deck[]): Card | null {
  for (const deck of decks) {
    const found = deck.cards.find((card) => card.cardId === cardId)
    if (found) {
      return found
    }
  }
  return null
}

export function findKnownCard(name: string, decks: Deck[]): Card | null {
  const normalizedName = normalizeLookup(name)
  if (!normalizedName) {
    return null
  }

  for (const deck of decks) {
    for (const card of deck.cards) {
      if (normalizeLookup(card.name) === normalizedName) {
        return card
      }
    }
  }
  return null
}

export function removePackFromDecks(decks: Deck[], packId: string): Deck[] {
  return decks.map((deck) => ({
    ...deck,
    cards: deck.cards.map((card) => ({
      ...card,
      packs: card.packs.filter((id) => id !== packId),
    })),
  }))
}

export function normalizeLookup(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()
}

function cloneState(state: State): State {
  return {
    packs: state.packs.map((pack) => ({ ...pack, n: { ...pack.n } })),
    decks: state.decks.map((deck) => ({
      ...deck,
      cards: deck.cards.map((card) => ({
        ...card,
        packs: [...card.packs],
        ...(card.printIds ? { printIds: [...card.printIds] } : {}),
      })),
    })),
    rates: [...state.rates],
  }
}

function normalizeDeck(value: unknown): Deck {
  const deck = value as Partial<Deck>
  return {
    id: typeof deck.id === 'string' && deck.id ? deck.id : createId('deck'),
    name: typeof deck.name === 'string' && deck.name.trim() ? deck.name.trim() : '名称未設定デッキ',
    cards: Array.isArray(deck.cards) ? deck.cards.map(normalizeCard) : [],
  }
}

function normalizeCard(value: unknown): Card {
  const card = value as Partial<Card>
  const normalized: Card = {
    name: typeof card.name === 'string' ? card.name.trim() : '',
    r: normalizeRarity(card.r),
    need: normalizeInteger(card.need, 0),
    own: normalizeInteger(card.own, 0),
    packs: normalizeStringList(card.packs),
  }
  if (typeof card.cardId === 'string' && card.cardId) {
    normalized.cardId = card.cardId
    const printIds = normalizeStringList(card.printIds)
    if (printIds.length > 0) {
      normalized.printIds = printIds
    }
  }
  return normalized
}

function normalizeStringList(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === 'string'))] : []
}

function normalizePack(value: unknown): Pack {
  const pack = value as Partial<Pack>
  const n: Record<number, number> = {}
  if (pack.n && typeof pack.n === 'object') {
    for (const [key, amount] of Object.entries(pack.n)) {
      const index = Number(key)
      if (Number.isInteger(index) && index >= 0 && index < RARITIES.length) {
        n[index] = normalizeNumber(amount, 0)
      }
    }
  }

  return {
    id: typeof pack.id === 'string' && pack.id ? pack.id : createId('pack'),
    name: typeof pack.name === 'string' && pack.name.trim() ? pack.name.trim() : '名称未設定パック',
    n,
  }
}

function normalizeRarity(value: unknown): number {
  const index = normalizeInteger(value, 0)
  return Math.min(Math.max(index, 0), RARITIES.length - 1)
}

function normalizeInteger(value: unknown, fallback: number): number {
  const numeric = normalizeNumber(value, fallback)
  return Math.max(0, Math.floor(numeric))
}

function normalizeNumber(value: unknown, fallback: number): number {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}
