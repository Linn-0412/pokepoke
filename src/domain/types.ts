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
  /** カードDBのカードID。設定されていればレアリティと収録パックはDBから決まる */
  cardId?: string
  /** 欲しい絵柄 (DBのプリントID)。未設定ならどの絵柄でもよい */
  printIds?: string[]
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
  key: string
  missing: number
  sourceDeckNames: string[]
  rarityConflict: boolean
  originalRarities: number[]
}

export type PackContribution = {
  cardKey: string
  cardName: string
  cardId?: string
  /** そのパックで出る中で最も出やすい絵柄 */
  printId?: string
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

export type BestSource = {
  packId: string
  packName: string
  probability: number
  printId?: string
}

export type CalculationResult = {
  best: PackRanking | null
  rankings: PackRanking[]
  missingCards: AggregatedCard[]
  /** 不足カードごとの、最も出やすいパック */
  bestSources: Record<string, BestSource>
  warnings: CalculationWarning[]
}

export type ImportedDeckCard = {
  name: string
  cardId?: string
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

export type DbMove = {
  n: string
  v: string
  c: string
  t?: string
}

export type DbPrint = {
  id: string
  /** RARITIES のインデックス。プロモは null */
  r: number | null
  packs: string[]
  promo?: boolean
}

export type DbCard = {
  id: string
  name: string
  kind: 'P' | 'T'
  type: string
  en?: string
  hp?: number
  moves?: DbMove[]
  ability?: { n: string; t: string }
  text?: string
  prints: DbPrint[]
}

export type DbPack = {
  id: string
  name: string
  set: string | null
  /** 1パックあたりの期待枚数 (レアリティ別)。null ならユーザー設定の排出率を使う */
  rates: number[] | null
  pool: number[]
}

export type CardDbData = {
  version: number
  generatedAt: string
  sources: string[]
  imageBase: string
  packs: DbPack[]
  cards: DbCard[]
  /** QRのカードID (`pokemon:960` など) -> DbCard.id */
  qr: Record<string, string>
}

export type CardDb = CardDbData & {
  cardsById: Map<string, DbCard>
  packsById: Map<string, DbPack>
}
