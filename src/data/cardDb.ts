import { useEffect, useState } from 'react'
import { MAX_PLAY_RARITY } from '../domain/constants'
import type { Card, CardDb, CardDbData, DbCard, DbPrint, State } from '../domain/types'
import { normalizeLookup } from './storage'

export const WISHLIST_DECK_ID = 'wishlist'
export const WISHLIST_DECK_NAME = 'ほしいものリスト'

let cached: Promise<CardDb> | null = null

export function loadCardDb(): Promise<CardDb> {
  if (!cached) {
    cached = fetch(`${import.meta.env.BASE_URL}card-db.json`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`カードDBを取得できませんでした (${response.status})`)
        }
        return response.json() as Promise<CardDbData>
      })
      .then(indexCardDb)
      .catch((error: unknown) => {
        cached = null
        throw error
      })
  }
  return cached
}

export function indexCardDb(data: CardDbData): CardDb {
  return {
    ...data,
    cardsById: new Map(data.cards.map((card) => [card.id, card])),
    packsById: new Map(data.packs.map((pack) => [pack.id, pack])),
  }
}

export type CardDbStatus = { db: CardDb | null; error: string }

export function useCardDb(): CardDbStatus {
  const [status, setStatus] = useState<CardDbStatus>({ db: null, error: '' })
  useEffect(() => {
    let active = true
    loadCardDb()
      .then((db) => active && setStatus({ db, error: '' }))
      .catch((error: unknown) =>
        active && setStatus({ db: null, error: error instanceof Error ? error.message : String(error) }),
      )
    return () => {
      active = false
    }
  }, [])
  return status
}

export function cardImageUrl(db: CardDb, printId: string, size: 's' | 'm' = 's'): string {
  return `${db.imageBase}${size}${printId}.png`
}

/** パックから引けるプリント (プロモ限定のものを除く) */
export function pullablePrints(card: DbCard): DbPrint[] {
  return card.prints.filter((print) => print.r != null && print.packs.length > 0)
}

/** 欲しいものとして数えるプリント。printIds 未指定なら引けるプリントすべて */
export function acceptablePrints(card: DbCard, printIds: string[] | undefined): DbPrint[] {
  const pullable = pullablePrints(card)
  if (!printIds || printIds.length === 0) {
    return pullable
  }
  const wanted = new Set(printIds)
  return pullable.filter((print) => wanted.has(print.id))
}

/** 表示用のレアリティ (欲しい絵柄の中で一番低いもの) */
export function displayRarity(card: DbCard, printIds?: string[]): number {
  const rarities = acceptablePrints(card, printIds).map((print) => print.r ?? 0)
  return rarities.length > 0 ? Math.min(...rarities) : (card.prints[0]?.r ?? 0)
}

export function representativePrint(card: DbCard, printIds?: string[]): DbPrint {
  const prints = acceptablePrints(card, printIds)
  return [...prints].sort((a, b) => (a.r ?? 99) - (b.r ?? 99))[0] ?? card.prints[0]
}

/** DBのカードからデッキ用の Card を作る */
export function cardFromDb(card: DbCard, overrides: Partial<Card> = {}): Card {
  const { printIds, ...rest } = overrides
  const result: Card = {
    name: card.name,
    r: displayRarity(card, printIds),
    need: 2,
    own: 0,
    packs: [],
    cardId: card.id,
    ...rest,
  }
  if (printIds?.length) {
    result.printIds = printIds
  }
  return result
}

/** ◇〜◇◇◇◇ の絵柄はどれでもよい扱い、☆以上は「その絵柄が欲しい」扱い */
export function printIdsForTap(print: DbPrint): string[] | undefined {
  return (print.r ?? 0) <= MAX_PLAY_RARITY ? undefined : [print.id]
}

/** ひらがな/カタカナ・全角半角の違いを吸収した検索キー */
export function normalizeQuery(value: string): string {
  return normalizeLookup(toKatakana(value))
}

/** カード名・英語名・ワザ名・特性名のどれかに含まれるか (normalizedQuery は normalizeQuery 済み) */
export function cardMatches(card: DbCard, normalizedQuery: string): boolean {
  if (!normalizedQuery) {
    return true
  }
  return [card.name, card.en ?? '', ...(card.moves ?? []).map((move) => move.n), card.ability?.n ?? ''].some((value) =>
    normalizeQuery(value).includes(normalizedQuery),
  )
}

export function searchCards(db: CardDb, query: string, limit = 40): DbCard[] {
  const normalized = normalizeQuery(query)
  if (!normalized) {
    return []
  }
  const results: DbCard[] = []
  for (const card of db.cards) {
    if (cardMatches(card, normalized)) {
      results.push(card)
      if (results.length >= limit) {
        break
      }
    }
  }
  return results
}

function toKatakana(value: string): string {
  return value.replace(/[ぁ-ゖ]/g, (char) => String.fromCharCode(char.charCodeAt(0) + 0x60))
}

/** そのデッキのカードが、この絵柄を欲しいものとして含んでいるか */
export function entryCoversPrint(entry: Card, card: DbCard, print: DbPrint): boolean {
  if (entry.cardId !== card.id) {
    return false
  }
  return entry.printIds?.length ? entry.printIds.includes(print.id) : (print.r ?? 0) <= MAX_PLAY_RARITY
}

export function isInWishlist(state: State, card: DbCard, print: DbPrint): boolean {
  const wishlist = state.decks.find((deck) => deck.id === WISHLIST_DECK_ID)
  return Boolean(wishlist?.cards.some((entry) => entryCoversPrint(entry, card, print)))
}

/** パック画面でカードをタップしたときの追加/削除 */
export function toggleWishlistPrint(state: State, card: DbCard, print: DbPrint): State {
  const existing = state.decks.find((deck) => deck.id === WISHLIST_DECK_ID)
  if (existing?.cards.some((entry) => entryCoversPrint(entry, card, print))) {
    return {
      ...state,
      decks: state.decks.map((deck) =>
        deck.id === WISHLIST_DECK_ID
          ? { ...deck, cards: deck.cards.filter((entry) => !entryCoversPrint(entry, card, print)) }
          : deck,
      ),
    }
  }

  const printIds = printIdsForTap(print)
  const entry = cardFromDb(card, { printIds, need: printIds ? 1 : 2 })
  if (!existing) {
    return {
      ...state,
      decks: [{ id: WISHLIST_DECK_ID, name: WISHLIST_DECK_NAME, cards: [entry] }, ...state.decks],
    }
  }
  return {
    ...state,
    decks: state.decks.map((deck) => (deck.id === WISHLIST_DECK_ID ? { ...deck, cards: [...deck.cards, entry] } : deck)),
  }
}

const nameIndexes = new WeakMap<CardDb, Map<string, DbCard[]>>()

/** 日本語名または英語名が一致するカードが1枚だけならそれを返す (同名で技違いがあれば null) */
export function findUniqueCardByName(db: CardDb, name: string): DbCard | null {
  let byName = nameIndexes.get(db)
  if (!byName) {
    byName = new Map()
    for (const card of db.cards) {
      for (const value of new Set([card.name, card.en].filter((item): item is string => Boolean(item)))) {
        const key = normalizeLookup(value)
        byName.set(key, [...(byName.get(key) ?? []), card])
      }
    }
    nameIndexes.set(db, byName)
  }
  const matches = byName.get(normalizeLookup(name)) ?? []
  return matches.length === 1 ? matches[0] : null
}

/**
 * 名前だけで登録されたカード (以前のQR取り込みや手入力) を、名前が一意に決まる場合だけDBに紐付ける。
 * 変更がなければ同じ state を返す。
 */
export function linkCardsToDb(state: State, db: CardDb): State {
  let changed = false
  const decks = state.decks.map((deck) => {
    let deckChanged = false
    const cards = deck.cards.map((card) => {
      if (card.cardId || !card.name.trim()) {
        return card
      }
      const match = findUniqueCardByName(db, card.name)
      if (!match) {
        return card
      }
      deckChanged = true
      return { ...cardFromDb(match, { need: card.need, own: card.own }), packs: card.packs }
    })
    if (!deckChanged) {
      return deck
    }
    changed = true
    return { ...deck, cards }
  })

  return changed ? { ...state, decks } : state
}
