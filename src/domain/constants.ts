import type { State } from './types'

export const STORAGE_KEY = 'packnavi'

export const RARITIES = ['◇', '◇◇', '◇◇◇', '◇◇◇◇', '☆', '☆☆', '☆☆☆', '♛'] as const

export const RATE_SOURCE_URL = 'https://gamewith.jp/pokemon-tcg-pocket/466420'

export const RATE_SOURCE_LABEL = 'GameWith 通常封入(99.950%)'

export const DEFAULT_RATES = [3, 1.5, 0.25, 0.0833, 0.1286, 0.025, 0.0111, 0.002] as const

export const RATE_NOTICE =
  'GameWith掲載の通常封入(99.950%)を、1パックあたり期待枚数に換算した初期値です。ハイクラスパックやレア封入は必要に応じて調整してください。'

export const EMPTY_STATE: State = {
  packs: [],
  decks: [],
  rates: [...DEFAULT_RATES],
}

export const RARITY_OPTIONS = RARITIES.map((label, index) => ({
  label,
  value: index,
}))
