import { describe, expect, it } from 'vitest'
import { indexCardDb } from '../data/cardDb'
import { aggregateCards, calculatePackRankings } from './calculator'
import type { State } from './types'

const baseState: State = {
  rates: [3, 1.5, 0.25, 0.0833, 0.1286, 0.025, 0.0111, 0.002],
  packs: [
    { id: 'pack-a', name: 'Aパック', n: { 0: 100, 1: 50 } },
    { id: 'pack-b', name: 'Bパック', n: { 0: 200, 1: 30 } },
    { id: 'pack-empty', name: '空パック', n: { 0: 0 } },
  ],
  decks: [],
}

describe('calculatePackRankings', () => {
  it('同名カードをカード名で集約し、必要枚数と所持枚数は最大値、パックは和集合にする', () => {
    const result = calculatePackRankings({
      ...baseState,
      decks: [
        {
          id: 'deck-1',
          name: 'デッキ1',
          cards: [{ name: 'ピカチュウ', r: 0, need: 1, own: 0, packs: ['pack-a'] }],
        },
        {
          id: 'deck-2',
          name: 'デッキ2',
          cards: [{ name: 'ピカチュウ', r: 0, need: 2, own: 1, packs: ['pack-b'] }],
        },
      ],
    })

    expect(result.missingCards).toHaveLength(1)
    expect(result.missingCards[0]).toMatchObject({
      name: 'ピカチュウ',
      need: 2,
      own: 1,
      missing: 1,
    })
    expect(result.missingCards[0].packs.sort()).toEqual(['pack-a', 'pack-b'])
  })

  it('足りているカードはランキングに寄与しない', () => {
    const result = calculatePackRankings({
      ...baseState,
      decks: [
        {
          id: 'deck-1',
          name: 'デッキ1',
          cards: [{ name: 'ミュウツー', r: 1, need: 2, own: 2, packs: ['pack-a'] }],
        },
      ],
    })

    expect(result.best).toBeNull()
    expect(result.rankings.every((ranking) => ranking.score === 0)).toBe(true)
  })

  it('プール枚数が0または未設定のカードは除外し、警告に出す', () => {
    const result = calculatePackRankings({
      ...baseState,
      decks: [
        {
          id: 'deck-1',
          name: 'デッキ1',
          cards: [
            { name: 'ゼニガメ', r: 0, need: 2, own: 0, packs: ['pack-empty'] },
            { name: 'リザードン', r: 2, need: 1, own: 0, packs: ['pack-a'] },
          ],
        },
      ],
    })

    expect(result.best).toBeNull()
    expect(result.warnings.some((warning) => warning.message.includes('プール枚数'))).toBe(true)
  })

  it('スコアを降順で並べ、約何パックに1枚かを計算する', () => {
    const result = calculatePackRankings({
      ...baseState,
      decks: [
        {
          id: 'deck-1',
          name: 'デッキ1',
          cards: [
            { name: 'ピカチュウ', r: 0, need: 2, own: 0, packs: ['pack-a', 'pack-b'] },
            { name: 'サンダー', r: 1, need: 1, own: 0, packs: ['pack-b'] },
          ],
        },
      ],
    })

    expect(result.rankings[0].packId).toBe('pack-b')
    expect(result.rankings[0].score).toBeCloseTo(3 / 200 + 1.5 / 30)
    expect(result.rankings[0].packsPerHit).toBeCloseTo(1 / result.rankings[0].score)
  })

  it('収録パック未設定とレアリティ不一致を警告する', () => {
    const result = calculatePackRankings({
      ...baseState,
      decks: [
        {
          id: 'deck-1',
          name: 'デッキ1',
          cards: [{ name: 'イーブイ', r: 0, need: 2, own: 0, packs: [] }],
        },
        {
          id: 'deck-2',
          name: 'デッキ2',
          cards: [{ name: 'イーブイ', r: 1, need: 1, own: 0, packs: ['pack-a'] }],
        },
      ],
    })

    expect(result.warnings.some((warning) => warning.message.includes('収録パック'))).toBe(true)
    expect(result.warnings.some((warning) => warning.message.includes('レアリティ'))).toBe(true)
  })
})

describe('calculatePackRankings with card DB', () => {
  const db = indexCardDb({
    version: 1,
    generatedAt: '',
    imageBase: '',
    packs: [
      { id: 'db-a', name: 'DB-A', set: 'X1', rates: [3, 1.5, 0.25, 0.08, 0.13, 0.025, 0.011, 0.002, 0, 0], pool: [50, 30, 10, 5, 8, 10, 1, 2, 0, 0] },
      { id: 'db-b', name: 'DB-B', set: 'X2', rates: null, pool: [40, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    ],
    cards: [
      {
        id: '100',
        name: 'ピカチュウex',
        kind: 'P',
        type: '雷',
        prints: [
          { id: '100', r: 3, packs: ['db-a'] },
          { id: '101', r: 5, packs: ['db-a'] },
          { id: '102', r: 7, packs: ['db-a'] },
          { id: '103', r: null, packs: [], promo: true },
        ],
      },
      { id: '200', name: 'ピカチュウ', kind: 'P', type: '雷', prints: [{ id: '200', r: 0, packs: ['db-a', 'db-b'] }] },
      { id: '300', name: 'プロモ限定', kind: 'T', type: 'グ', prints: [{ id: '300', r: null, packs: [], promo: true }] },
    ],
    qr: {},
  })

  const withDeck = (cards: State['decks'][number]['cards']): State => ({
    ...baseState,
    packs: [],
    decks: [{ id: 'deck-1', name: 'デッキ1', cards }],
  })

  it('どの絵柄でもよいカードは、パック内の全絵柄の確率を合計する', () => {
    const result = calculatePackRankings(
      withDeck([{ name: 'ピカチュウex', r: 3, need: 2, own: 0, packs: [], cardId: '100' }]),
      db,
    )

    expect(result.rankings).toHaveLength(1)
    expect(result.rankings[0].packId).toBe('db-a')
    expect(result.rankings[0].score).toBeCloseTo(0.08 / 5 + 0.025 / 10 + 0.002 / 2)
    expect(result.rankings[0].contributions[0].printId).toBe('100')
  })

  it('絵柄を指定したカードはその絵柄だけで計算する', () => {
    const result = calculatePackRankings(
      withDeck([{ name: 'ピカチュウex', r: 7, need: 1, own: 0, packs: [], cardId: '100', printIds: ['102'] }]),
      db,
    )

    expect(result.rankings[0].score).toBeCloseTo(0.002 / 2)
    expect(result.missingCards[0].r).toBe(7)
  })

  it('DBパックの排出率が無ければユーザー設定の排出率を使い、最も出やすいパックを記録する', () => {
    const result = calculatePackRankings(
      withDeck([{ name: 'ピカチュウ', r: 0, need: 2, own: 0, packs: [], cardId: '200' }]),
      db,
    )

    const key = result.missingCards[0].key
    expect(result.rankings.map((ranking) => ranking.packId)).toEqual(['db-b', 'db-a'])
    expect(result.rankings[0].score).toBeCloseTo(3 / 40)
    expect(result.rankings[1].score).toBeCloseTo(3 / 50)
    expect(result.bestSources[key]).toMatchObject({ packId: 'db-b', printId: '200' })
  })

  it('パックから引けないカードは警告し、収録パック未設定の警告は出さない', () => {
    const result = calculatePackRankings(
      withDeck([{ name: 'プロモ限定', r: 0, need: 1, own: 0, packs: [], cardId: '300' }]),
      db,
    )

    expect(result.best).toBeNull()
    expect(result.warnings.map((warning) => warning.message)).toEqual([
      'プロモ限定: パックから引けない絵柄(プロモ等)のため計算対象外です。',
    ])
  })

  it('同じカードでも「どれでも」と「絵柄指定」は別々に集計する', () => {
    const cards = aggregateCards(
      [
        {
          id: 'deck-1',
          name: 'デッキ1',
          cards: [
            { name: 'ピカチュウex', r: 3, need: 2, own: 0, packs: [], cardId: '100' },
            { name: 'ピカチュウex', r: 7, need: 1, own: 0, packs: [], cardId: '100', printIds: ['102'] },
          ],
        },
      ],
      db,
    )
    expect(cards).toHaveLength(2)
  })
})
