import { RARITIES } from './constants'
import type {
  AggregatedCard,
  CalculationResult,
  CalculationWarning,
  Card,
  Deck,
  Pack,
  PackContribution,
  State,
} from './types'

type AggregationEntry = {
  name: string
  r: number
  need: number
  own: number
  packs: Set<string>
  sourceDeckNames: Set<string>
  originalRarities: Set<number>
}

const normalizeName = (name: string) => name.trim()

const isPositiveNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0

export function aggregateCards(decks: Deck[]): AggregatedCard[] {
  const byName = new Map<string, AggregationEntry>()

  for (const deck of decks) {
    for (const card of deck.cards) {
      const name = normalizeName(card.name)
      if (!name) {
        continue
      }

      const current = byName.get(name)
      if (!current) {
        byName.set(name, {
          name,
          r: card.r,
          need: Math.max(0, card.need),
          own: Math.max(0, card.own),
          packs: new Set(card.packs),
          sourceDeckNames: new Set([deck.name]),
          originalRarities: new Set([card.r]),
        })
        continue
      }

      current.need = Math.max(current.need, Math.max(0, card.need))
      current.own = Math.max(current.own, Math.max(0, card.own))
      current.originalRarities.add(card.r)
      current.sourceDeckNames.add(deck.name)
      for (const packId of card.packs) {
        current.packs.add(packId)
      }
    }
  }

  return [...byName.values()]
    .map((entry) => ({
      name: entry.name,
      r: entry.r,
      need: entry.need,
      own: entry.own,
      packs: [...entry.packs],
      missing: Math.max(0, entry.need - entry.own),
      sourceDeckNames: [...entry.sourceDeckNames],
      rarityConflict: entry.originalRarities.size > 1,
      originalRarities: [...entry.originalRarities].sort((a, b) => a - b),
    }))
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

export function calculatePackRankings(state: State): CalculationResult {
  const aggregatedCards = aggregateCards(state.decks)
  const missingCards = aggregatedCards.filter((card) => card.need > card.own)
  const warnings = buildWarnings(state, aggregatedCards, missingCards)

  const rankings = state.packs
    .map((pack) => {
      const contributions = missingCards
        .filter((card) => card.packs.includes(pack.id))
        .map((card): PackContribution => ({
          cardName: card.name,
          rarity: card.r,
          missing: card.missing,
          probability: calculateCardProbability(card, pack, state.rates),
        }))
        .filter((contribution) => contribution.probability > 0)
        .sort((a, b) => b.probability - a.probability)

      const score = contributions.reduce((sum, item) => sum + item.probability, 0)
      return {
        packId: pack.id,
        packName: pack.name,
        score,
        packsPerHit: score > 0 ? 1 / score : null,
        contributions,
      }
    })
    .sort((a, b) => b.score - a.score || a.packName.localeCompare(b.packName, 'ja'))

  return {
    best: rankings[0]?.score > 0 ? rankings[0] : null,
    rankings,
    missingCards,
    warnings,
  }
}

function buildWarnings(
  state: State,
  aggregatedCards: AggregatedCard[],
  missingCards: AggregatedCard[],
): CalculationWarning[] {
  const warnings: CalculationWarning[] = []
  const packIds = new Set(state.packs.map((pack) => pack.id))

  for (const deck of state.decks) {
    for (const card of deck.cards) {
      const name = normalizeName(card.name)
      if (!name) {
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
        id: `rarity-${card.name}`,
        message: `${card.name}: デッキ間でレアリティが異なります (${card.originalRarities
          .map((rarity) => RARITIES[rarity] ?? `#${rarity}`)
          .join(' / ')})。最初に見つかったレアリティで計算しています。`,
      })
    }

    if (card.need <= 0) {
      warnings.push({
        id: `need-${card.name}`,
        message: `${card.name}: 必要枚数が未設定です。`,
      })
    }
  }

  for (const card of missingCards) {
    if (card.packs.length === 0) {
      warnings.push({
        id: `packs-${card.name}`,
        message: `${card.name}: 収録パックが未設定です。`,
      })
      continue
    }

    for (const packId of card.packs) {
      const pack = state.packs.find((item) => item.id === packId)
      if (!pack) {
        warnings.push({
          id: `missing-pack-${card.name}-${packId}`,
          message: `${card.name}: 削除済みまたは不明なパックが設定されています。`,
        })
        continue
      }

      const poolSize = pack.n[card.r]
      if (!isPositiveNumber(poolSize)) {
        warnings.push({
          id: `pool-${card.name}-${pack.id}-${card.r}`,
          message: `${card.name}: ${pack.name} の ${RARITIES[card.r] ?? `#${card.r}`} プール枚数が未設定です。`,
        })
      }
    }

    const hasKnownPack = card.packs.some((packId) => packIds.has(packId))
    if (!hasKnownPack) {
      warnings.push({
        id: `known-pack-${card.name}`,
        message: `${card.name}: 現在登録されているパックに紐づいていません。`,
      })
    }
  }

  return warnings
}
