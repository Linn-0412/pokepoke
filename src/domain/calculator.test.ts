import { describe, expect, it } from 'vitest'
import { calculatePackRankings } from './calculator'
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
