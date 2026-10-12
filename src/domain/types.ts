export type Pack = {
  id: string
  name: string
  n: Record<number, number>
}

export type Card = {
  name: string
  r: number
  need: number
  own: number
  packs: string[]
}

export type Deck = {
  id: string
  name: string
  cards: Card[]
}

export type State = {
  packs: Pack[]
  decks: Deck[]
  rates: number[]
}

export type AggregatedCard = Card & {
  missing: number
  sourceDeckNames: string[]
  rarityConflict: boolean
  originalRarities: number[]
}

export type PackContribution = {
  cardName: string
  rarity: number
  missing: number
  probability: number
}

export type PackRanking = {
  packId: string
  packName: string
  score: number
  packsPerHit: number | null
  contributions: PackContribution[]
}

export type CalculationWarning = {
  id: string
  message: string
}

export type CalculationResult = {
  best: PackRanking | null
  rankings: PackRanking[]
  missingCards: AggregatedCard[]
  warnings: CalculationWarning[]
}

export type ImportedDeckCard = {
  name: string
  count: number
  r?: number
  sourcePackNames?: string[]
  unresolvedNr?: number
  note?: string
}

export type ImportedDeck = {
  name: string
  cards: ImportedDeckCard[]
  source: string
  rawCode?: string
  warnings: string[]
}
