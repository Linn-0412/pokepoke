import { encodePayload } from 'tcgp-deck-qr'
import cardDbJson from '../../public/card-db.json?raw'
import { describe, expect, it } from 'vitest'
import { EMPTY_STATE } from '../domain/constants'
import type { CardDbData } from '../domain/types'
import { indexCardDb } from './cardDb'
import { createDeckFromImported, decodeDeckText } from './deckImport'

const db = indexCardDb(JSON.parse(cardDbJson) as CardDbData)

describe('QR取り込み (同梱カードDB)', () => {
  it('QRのカードIDを日本語名・DBカードに変換する', async () => {
    // A1 ピカチュウex (960) x2, A2b ピカチュウex (5410) x1, 博士の研究 (40) x2
    const payload = encodePayload({ pokemonIds: [960, 960, 5410], trainerIds: [40, 40], energyTypes: [] })
    const imported = await decodeDeckText(payload, db)
    const names = imported.cards.map((card) => `${card.name}x${card.count}`).sort()
    expect(names).toEqual(['ピカチュウexx1', 'ピカチュウexx2', '博士の研究x2'].sort())
    expect(imported.cards.every((card) => card.cardId)).toBe(true)

    // 同名でもワザが違えば別カード
    const pikachus = imported.cards.filter((card) => card.name === 'ピカチュウex')
    const moves = pikachus.map((card) => db.cardsById.get(card.cardId!)!.moves!.map((move) => move.n).join())
    expect(new Set(moves).size).toBe(2)

    const deck = createDeckFromImported(imported, EMPTY_STATE, db)
    const research = deck.cards.find((card) => card.name === '博士の研究')!
    // ◇◇版はプロモ限定なので、パックから引けるのは☆☆版だけ
    expect(research).toMatchObject({ r: 5, need: 2, own: 0 })
    expect(research.cardId).toBeTruthy()
  })
})
