declare module 'tcgp-deck-qr' {
  export type QrDecodeResult = {
    payload: string
    method: string
    version?: number
    errorCorrectionLevel?: string
    mask?: number
  }

  export type DecodedPayload = {
    trainerIds: number[]
    pokemonIds: number[]
    energyTypes: number[]
  }

  export type CardEntityType = 'pokemon' | 'trainer'

  export type CardRecord = {
    entityId?: number
    entityType?: CardEntityType
    name: string
    set?: string
    number?: number
    rarity?: string
    packs?: string[]
    prints?: CardRecord[]
    [key: string]: unknown
  }

  export class CardDatabase {
    constructor(rawRecords: CardRecord[])
    describe(entityId: number, entityType: CardEntityType): CardRecord
  }

  export function decodeQrPixels(image: ImageData): QrDecodeResult | null
  export function decodePayload(payload: string): DecodedPayload
  export function loadCardDatabase(options?: { source?: string }): Promise<CardDatabase>
}
