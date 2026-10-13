import { acceptablePrints, displayRarity } from '../data/cardDb'
import { RARITIES } from './constants'
import type {
  AggregatedCard,
  BestSource,
  CalculationResult,
  CalculationWarning,
  Card,
  CardDb,
  DbPack,
  Deck,
  Pack,
  PackContribution,
  PackRanking,
  State,
} from './types'

type AggregationEntry = {
  key: string
  name: string
  r: number
  need: number
  own: number
  packs: Set<string>
  cardId?: string
  printIds?: string[]
  sourceDeckNames: Set<string>
  originalRarities: Set<number>
}

const normalizeName = (name: string) => name.trim()

const isPositiveNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0

/** DB紐付きカードはカードID+欲しい絵柄、手入力カードはカード名で集約する */
export function cardKey(card: Card): string {
  if (card.cardId) {
    const prints = card.printIds?.length ? [...card.printIds].sort().join(',') : '*'
    return `id:${card.cardId}:${prints}`
  }
  return `name:${normalizeName(card.name)}`
}

export function aggregateCards(decks: Deck[], db?: CardDb | null): AggregatedCard[] {
  const byKey = new Map<string, AggregationEntry>()

  for (const deck of decks) {
    for (const card of deck.cards) {
      const dbCard = card.cardId ? db?.cardsById.get(card.cardId) : undefined
      const name = dbCard?.name ?? normalizeName(card.name)
      if (!name) {
        continue
      }
      const r = dbCard ? displayRarity(dbCard, card.printIds) : card.r

      const key = cardKey(card)
      const current = byKey.get(key)
      if (!current) {
        byKey.set(key, {
          key,
          name,
          r,
          need: Math.max(0, card.need),
          own: Math.max(0, card.own),
          packs: new Set(card.cardId ? [] : card.packs),
          cardId: card.cardId,
          printIds: card.printIds,
          sourceDeckNames: new Set([deck.name]),
          originalRarities: new Set([r]),
        })
        continue
      }

      current.need = Math.max(current.need, Math.max(0, card.need))
      current.own = Math.max(current.own, Math.max(0, card.own))
      current.originalRarities.add(r)
      current.sourceDeckNames.add(deck.name)
      if (!card.cardId) {
        for (const packId of card.packs) {
          current.packs.add(packId)
        }
      }
    }
  }

  return [...byKey.values()]
    .map((entry): AggregatedCard => {
      const card: AggregatedCard = {
        key: entry.key,
        name: entry.name,
        r: entry.r,
        need: entry.need,
        own: entry.own,
        packs: [...entry.packs],
        missing: Math.max(0, entry.need - entry.own),
        sourceDeckNames: [...entry.sourceDeckNames],
        rarityConflict: !entry.cardId && entry.originalRarities.size > 1,
        originalRarities: [...entry.originalRarities].sort((a, b) => a - b),
      }
      if (entry.cardId) {
        card.cardId = entry.cardId
      }
      if (entry.printIds) {
        card.printIds = entry.printIds
      }
      return card
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'))
}

export function calculateCardProbability(card: Card, pack: Pack, rates: number[]): number {
  const rate = rates[card.r]
  const poolSize = pack.n[card.r]
  if (!isPositiveNumber(rate) || !isPositiveNumber(poolSize)) {
    return 0
  }
  return rate / poolSize
}

/** DBパックで、欲しい絵柄のどれかが出る確率 (1パックあたりの期待枚数) */
export function calculateDbProbability(
  card: AggregatedCard,
  pack: DbPack,
  db: CardDb,
  fallbackRates: number[],
): { probability: number; printId?: string } {
  const dbCard = card.cardId ? db.cardsById.get(card.cardId) : undefined
  if (!dbCard) {
    return { probability: 0 }
  }
  const rates = pack.rates ?? fallbackRates
  let probability = 0
  let bestPrint: { id: string; probability: number } | null = null
  for (const print of acceptablePrints(dbCard, card.printIds)) {
    if (print.r == null || !print.packs.includes(pack.id)) {
      continue
    }
    const rate = rates[print.r]
    const poolSize = pack.pool[print.r]
    if (!isPositiveNumber(rate) || !isPositiveNumber(poolSize)) {
      continue
    }
    const value = rate / poolSize
    probability += value
    if (!bestPrint || value > bestPrint.probability) {
      bestPrint = { id: print.id, probability: value }
    }
  }
  return { probability, printId: bestPrint?.id }
}

export function calculatePackRankings(state: State, db?: CardDb | null): CalculationResult {
  const aggregatedCards = aggregateCards(state.decks, db)
  const missingCards = aggregatedCards.filter((card) => card.need > card.own)
  const warnings = buildWarnings(state, aggregatedCards, missingCards, db)

  // DBが読めていないときは、DB紐付きカードも手入力カードと同じ扱いで計算する
  const usesDb = (card: AggregatedCard) => Boolean(card.cardId && db)

  const customRankings = state.packs.map((pack) =>
    buildRanking(pack.id, pack.name, missingCards, (card) => {
      if (usesDb(card) || !card.packs.includes(pack.id)) {
        return null
      }
      return { probability: calculateCardProbability(card, pack, state.rates) }
    }),
  )

  const dbRankings = (db?.packs ?? [])
    .map((pack) =>
      buildRanking(pack.id, pack.name, missingCards, (card) =>
        usesDb(card) && db ? calculateDbProbability(card, pack, db, state.rates) : null,
      ),
    )
    .filter((ranking) => ranking.score > 0)

  const rankings = [...dbRankings, ...customRankings].sort(
    (a, b) => b.score - a.score || a.packName.localeCompare(b.packName, 'ja'),
  )

  const bestSources: Record<string, BestSource> = {}
  for (const ranking of rankings) {
    for (const contribution of ranking.contributions) {
      const current = bestSources[contribution.cardKey]
      if (!current || contribution.probability > current.probability) {
        bestSources[contribution.cardKey] = {
          packId: ranking.packId,
          packName: ranking.packName,
          probability: contribution.probability,
          printId: contribution.printId,
        }
      }
    }
  }

  return {
    best: rankings[0]?.score > 0 ? rankings[0] : null,
    rankings,
    missingCards,
    bestSources,
    warnings,
  }
}

function buildRanking(
  packId: string,
  packName: string,
  missingCards: AggregatedCard[],
  probabilityOf: (card: AggregatedCard) => { probability: number; printId?: string } | null,
): PackRanking {
  const contributions = missingCards
    .map((card): PackContribution | null => {
      const result = probabilityOf(card)
      if (!result || result.probability <= 0) {
        return null
      }
      const contribution: PackContribution = {
        cardKey: card.key,
        cardName: card.name,
        rarity: card.r,
        missing: card.missing,
        probability: result.probability,
      }
      if (card.cardId) {
        contribution.cardId = card.cardId
      }
      if (result.printId) {
        contribution.printId = result.printId
      }
      return contribution
    })
    .filter((contribution): contribution is PackContribution => contribution != null)
    .sort((a, b) => b.probability - a.probability)

  const score = contributions.reduce((sum, item) => sum + item.probability, 0)
  return {
    packId,
    packName,
    score,
    packsPerHit: score > 0 ? 1 / score : null,
    contributions,
  }
}

function buildWarnings(
  state: State,
  aggregatedCards: AggregatedCard[],
  missingCards: AggregatedCard[],
  db?: CardDb | null,
): CalculationWarning[] {
  const warnings: CalculationWarning[] = []
  const packIds = new Set(state.packs.map((pack) => pack.id))

  for (const deck of state.decks) {
    for (const card of deck.cards) {
      const name = normalizeName(card.name)
      if (!name || card.cardId) {
        continue
      }
      if (card.need > card.own && card.packs.length === 0) {
        warnings.push({
          id: `entry-packs-${deck.id}-${name}`,
          message: `${deck.name} / ${name}: 収録パックが未設定です。`,
        })
      }
    }
  }

  for (const card of aggregatedCards) {
    if (card.rarityConflict) {
      warnings.push({
        id: `rarity-${card.key}`,
        message: `${card.name}: デッキ間でレアリティが異なります (${card.originalRarities
          .map((rarity) => RARITIES[rarity] ?? `#${rarity}`)
          .join(' / ')})。最初に見つかったレアリティで計算しています。`,
      })
    }

    if (card.need <= 0) {
      warnings.push({
        id: `need-${card.key}`,
        message: `${card.name}: 必要枚数が未設定です。`,
      })
    }
  }

  for (const card of missingCards) {
    if (card.cardId) {
      const dbCard = db?.cardsById.get(card.cardId)
      if (db && !dbCard) {
        warnings.push({ id: `db-missing-${card.key}`, message: `${card.name}: カードDBに見つかりません。` })
      } else if (dbCard && acceptablePrints(dbCard, card.printIds).length === 0) {
        warnings.push({
          id: `promo-${card.key}`,
          message: `${card.name}: パックから引けない絵柄(プロモ等)のため計算対象外です。`,
        })
      } else if (dbCard && !card.printIds?.length && dbCard.prints.some((print) => print.promo)) {
        warnings.push({
          id: `promo-available-${card.key}`,
          message: `${card.name}: プロモ版もあります。パック以外(イベント・ショップ等)でも入手できる場合があります。`,
        })
      }
      continue
    }

    if (card.packs.length === 0) {
      warnings.push({
        id: `packs-${card.key}`,
        message: `${card.name}: 収録パックが未設定です。`,
      })
      continue
    }

    for (const packId of card.packs) {
      const pack = state.packs.find((item) => item.id === packId)
      if (!pack) {
        warnings.push({
          id: `missing-pack-${card.key}-${packId}`,
          message: `${card.name}: 削除済みまたは不明なパックが設定されています。`,
        })
        continue
      }

      const poolSize = pack.n[card.r]
      if (!isPositiveNumber(poolSize)) {
        warnings.push({
          id: `pool-${card.key}-${pack.id}-${card.r}`,
          message: `${card.name}: ${pack.name} の ${RARITIES[card.r] ?? `#${card.r}`} プール枚数が未設定です。`,
        })
      }
    }

    const hasKnownPack = card.packs.some((packId) => packIds.has(packId))
    if (!hasKnownPack) {
      warnings.push({
        id: `known-pack-${card.key}`,
        message: `${card.name}: 現在登録されているパックに紐づいていません。`,
      })
    }
  }

  return warnings
}
