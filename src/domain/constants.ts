import type { State } from './types'

export const STORAGE_KEY = 'packnavi'

export const RARITIES = ['◇', '◇◇', '◇◇◇', '◇◇◇◇', '☆', '☆☆', '☆☆☆', '♛', '✦', '✦✦'] as const

/** これ以下のレアリティは「対戦用の通常版」として、どの絵柄でもよい扱いにする */
export const MAX_PLAY_RARITY = 3

// ✦ / ✦✦ は色違い収録パックの値
export const DEFAULT_RATES = [3, 1.5, 0.25, 0.0833, 0.1286, 0.025, 0.0111, 0.002, 0.0357, 0.0167] as const

export const RATE_NOTICE =
  '手動で追加したパック用の排出率です。カードDBに収録済みのパックは、弾ごとの排出率(レアパック・+1パック込み)を自動で使います。'

export const EMPTY_STATE: State = {
  packs: [],
  decks: [],
  rates: [...DEFAULT_RATES],
}

export const RARITY_OPTIONS = RARITIES.map((label, index) => ({
  label,
  value: index,
}))
