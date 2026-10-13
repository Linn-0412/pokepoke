import { decodePayload, decodeQrPixels, loadCardDatabase } from 'tcgp-deck-qr'
import { RARITIES } from '../domain/constants'
import type { Card, CardDb, Deck, ImportedDeck, ImportedDeckCard, State } from '../domain/types'
import { cardFromDb, displayRarity, findUniqueCardByName } from './cardDb'
import { createId, findKnownCard, findKnownCardById, normalizeLookup } from './storage'

type DecodedCardInfo = {
  key: string
  name: string
  cardId?: string
  r?: number
  sourcePackNames: string[]
  unresolvedNr?: number
  note?: string
}

type CardDatabaseLike = Awaited<ReturnType<typeof loadCardDatabase>>

export async function decodeDeckQrImage(file: File, db: CardDb | null): Promise<ImportedDeck> {
  const image = await fileToImageData(file)
  const decoded = decodeQrPixels(image)
  if (!decoded) {
    throw new Error('QRコードを読み取れませんでした。画像をトリミングするか、コード文字列を貼り付けてください。')
  }
  return decodeDeckText(decoded.payload, db, `QR画像 (${decoded.method})`)
}

export async function decodeDeckText(text: string, db: CardDb | null, source = '貼り付け'): Promise<ImportedDeck> {
  const trimmed = text.trim()
  if (!trimmed) {
    throw new Error('コードまたはデッキリストを入力してください。')
  }

  const jsonDeck = tryParseJsonDeck(trimmed)
  if (jsonDeck) {
    return jsonDeck
  }

  const candidates = extractDeckCodeCandidates(trimmed)
  const warnings: string[] = []
  for (const candidate of candidates) {
    try {
      return await decodePayloadCandidate(candidate, source, warnings, db)
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : String(error))
    }
  }

  const plainDeck = parsePlainDeckText(trimmed)
  if (plainDeck.cards.length > 0) {
    return plainDeck
  }

  throw new Error('対応できるQRコード/デッキリストとして解析できませんでした。')
}

export function createDeckFromImported(imported: ImportedDeck, state: State, db: CardDb | null): Deck {
  const cards = imported.cards.map((card): Card => {
    const dbCard = db ? (card.cardId ? db.cardsById.get(card.cardId) : findUniqueCardByName(db, card.name)) : undefined
    if (dbCard) {
      const known = findKnownCardById(dbCard.id, state.decks)
      return cardFromDb(dbCard, { need: Math.max(1, card.count), own: known?.own ?? 0 })
    }
    const known = findKnownCard(card.name, state.decks)
    const matchedPacks = matchPackNames(card.sourcePackNames ?? [], state)
    return {
      name: card.name,
      r: known?.r ?? card.r ?? 0,
      need: Math.max(1, card.count),
      own: known?.own ?? 0,
      packs: known?.packs.length ? [...known.packs] : matchedPacks,
    }
  })

  return {
    id: createId('deck'),
    name: imported.name,
    cards,
  }
}

async function decodePayloadCandidate(
  candidate: string,
  source: string,
  warnings: string[],
  db: CardDb | null,
): Promise<ImportedDeck> {
  const payload = decodePayload(candidate)
  // 同梱のカードDBで引けないIDがあるときだけ、外部の英語DBにフォールバックする
  const allIds = [
    ...payload.pokemonIds.map((id) => `pokemon:${id}`),
    ...payload.trainerIds.map((id) => `trainer:${id}`),
  ]
  const needsFallback = !db || allIds.some((key) => !db.qr[key])
  const database = needsFallback ? await loadDatabaseSafely(warnings) : null
  const describe = (id: number, type: 'pokemon' | 'trainer') =>
    describeFromCardDb(id, type, db) ?? describeCard(id, type, database)
  const decodedCards = [
    ...payload.pokemonIds.map((id) => describe(id, 'pokemon')),
    ...payload.trainerIds.map((id) => describe(id, 'trainer')),
  ]

  const byKey = new Map<string, ImportedDeckCard>()
  for (const card of decodedCards) {
    const current = byKey.get(card.key)
    if (current) {
      current.count += 1
      continue
    }
    byKey.set(card.key, {
      name: card.name,
      cardId: card.cardId,
      count: 1,
      r: card.r,
      sourcePackNames: card.sourcePackNames,
      unresolvedNr: card.unresolvedNr,
      note: card.note,
    })
  }

  if (payload.energyTypes.length > 0) {
    warnings.push(`エネルギー情報もQRに含まれていますが、このツールではカード枚数のみ取り込みます。`)
  }

  return {
    name: 'QR取り込みデッキ',
    cards: [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name, 'ja')),
    source,
    rawCode: candidate,
    warnings,
  }
}

async function loadDatabaseSafely(warnings: string[]): Promise<CardDatabaseLike | null> {
  try {
    return await loadCardDatabase()
  } catch {
    warnings.push('カード名DBを取得できなかったため、QR内のID名で取り込みます。')
    return null
  }
}

function describeFromCardDb(
  entityId: number,
  entityType: 'pokemon' | 'trainer',
  db: CardDb | null,
): DecodedCardInfo | null {
  const key = `${entityType}:${entityId}`
  const card = db?.cardsById.get(db.qr[key] ?? '')
  if (!card) {
    return null
  }
  return {
    key,
    name: card.name,
    cardId: card.id,
    r: displayRarity(card),
    sourcePackNames: [],
  }
}

function describeCard(
  entityId: number,
  entityType: 'pokemon' | 'trainer',
  database: CardDatabaseLike | null,
): DecodedCardInfo {
  if (!database) {
    const label = entityType === 'pokemon' ? 'Pokemon' : 'Trainer'
    return {
      key: `${entityType}:${entityId}`,
      name: `${label} #${entityId}`,
      sourcePackNames: [],
      unresolvedNr: entityId,
      note: 'カード名DB未取得',
    }
  }

  const record = database.describe(entityId, entityType)
  const prints = Array.isArray(record.prints) && record.prints.length > 0 ? record.prints : [record]
  const preferred = prints[0]
  const name = typeof preferred.name === 'string' ? preferred.name : `${entityType} #${entityId}`
  const rarity = inferRarity(prints)
  const sourcePackNames = [
    ...new Set(
      prints.flatMap((print) => (Array.isArray(print.packs) ? print.packs : [])).filter(isString),
    ),
  ]

  return {
    key: `${entityType}:${entityId}`,
    name,
    r: rarity,
    sourcePackNames,
    unresolvedNr: entityId,
    note: rarity == null ? 'レアリティは手動確認してください。' : undefined,
  }
}

function inferRarity(records: { rarity?: string }[]): number | undefined {
  for (const record of records) {
    const rarity = normalizeRarityText(record.rarity)
    const index = RARITIES.findIndex((label) => label === rarity)
    if (index >= 0) {
      return index
    }
  }
  return undefined
}

function normalizeRarityText(value: unknown): string {
  const text = String(value ?? '').trim()
  const diamondCount = (text.match(/[◇◊◆♦]/g) ?? []).length
  if (diamondCount > 0) {
    return '◇'.repeat(Math.min(diamondCount, 4))
  }
  const starCount = (text.match(/[☆★]/g) ?? []).length
  if (starCount > 0) {
    return '☆'.repeat(Math.min(starCount, 3))
  }
  if (/crown|クラウン|♛/i.test(text)) {
    return '♛'
  }
  if (/four|4|rare\s*diamond/i.test(text)) {
    return '◇◇◇◇'
  }
  if (/three|3/i.test(text)) {
    return '◇◇◇'
  }
  if (/two|2/i.test(text)) {
    return '◇◇'
  }
  if (/one|1|common/i.test(text)) {
    return '◇'
  }
  return text
}

function extractDeckCodeCandidates(text: string): string[] {
  const candidates = new Set<string>()
  candidates.add(text)

  try {
    const url = new URL(text)
    for (const key of ['code', 'deck', 'payload', 'qr', 'data']) {
      const value = url.searchParams.get(key)
      if (value) {
        candidates.add(value)
      }
    }
    for (const chunk of [...url.pathname.split('/'), url.hash.replace(/^#/, '')]) {
      if (chunk) {
        candidates.add(decodeURIComponent(chunk))
      }
    }
  } catch {
    // Plain payloads and deck texts are not URLs.
  }

  for (const match of text.matchAll(/[A-Za-z0-9+/]{8,}={0,2}/g)) {
    candidates.add(match[0])
  }

  return [...candidates].map((candidate) => candidate.trim()).filter(Boolean)
}

function tryParseJsonDeck(text: string): ImportedDeck | null {
  try {
    const parsed = JSON.parse(text) as {
      name?: unknown
      cards?: unknown
      pokemon?: unknown
      trainers?: unknown
    }
    const rawCards = [
      ...(Array.isArray(parsed.cards) ? parsed.cards : []),
      ...(Array.isArray(parsed.pokemon) ? parsed.pokemon : []),
      ...(Array.isArray(parsed.trainers) ? parsed.trainers : []),
    ]
    const cards = rawCards.map(jsonCardToImported).filter((card): card is ImportedDeckCard => card != null)
    if (cards.length === 0) {
      return null
    }
    return {
      name: typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim() : 'JSON取り込みデッキ',
      cards,
      source: 'JSON',
      warnings: [],
    }
  } catch {
    return null
  }
}

function jsonCardToImported(value: unknown): ImportedDeckCard | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const card = value as { name?: unknown; count?: unknown; need?: unknown; rarity?: unknown; r?: unknown }
  if (typeof card.name !== 'string' || !card.name.trim()) {
    return null
  }
  const count = Number(card.count ?? card.need ?? 1)
  const rarity = Number(card.r)
  return {
    name: card.name.trim(),
    count: Number.isFinite(count) && count > 0 ? Math.floor(count) : 1,
    r: Number.isInteger(rarity) ? Math.min(Math.max(rarity, 0), RARITIES.length - 1) : inferRarity([{ rarity: String(card.rarity ?? '') }]),
  }
}

function parsePlainDeckText(text: string): ImportedDeck {
  const byName = new Map<string, ImportedDeckCard>()
  for (const line of text.split(/\r?\n/)) {
    const parsed = parseDeckLine(line)
    if (!parsed) {
      continue
    }
    const key = normalizeLookup(parsed.name)
    const current = byName.get(key)
    if (current) {
      current.count += parsed.count
    } else {
      byName.set(key, parsed)
    }
  }

  return {
    name: 'テキスト取り込みデッキ',
    cards: [...byName.values()],
    source: 'テキスト',
    warnings: ['テキスト取り込みではレアリティと収録パックは自動判定できません。'],
  }
}

function parseDeckLine(line: string): ImportedDeckCard | null {
  const cleaned = line.replace(/^[-*・]\s*/, '').trim()
  if (!cleaned || /^#+\s*/.test(cleaned)) {
    return null
  }

  const leadingCount = /^(\d+)\s*[xX×枚]?\s+(.+)$/.exec(cleaned)
  if (leadingCount) {
    return { count: Number(leadingCount[1]), name: leadingCount[2].trim() }
  }

  const trailingCount = /^(.+?)\s*[xX×]\s*(\d+)$/.exec(cleaned)
  if (trailingCount) {
    return { count: Number(trailingCount[2]), name: trailingCount[1].trim() }
  }

  return { count: 1, name: cleaned }
}

function matchPackNames(sourcePackNames: string[], state: State): string[] {
  const normalizedSource = new Set(sourcePackNames.map(normalizeLookup))
  return state.packs
    .filter((pack) => normalizedSource.has(normalizeLookup(pack.name)))
    .map((pack) => pack.id)
}

function fileToImageData(file: File): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = image.naturalWidth
        canvas.height = image.naturalHeight
        const context = canvas.getContext('2d')
        if (!context) {
          throw new Error('画像を処理できませんでした。')
        }
        context.drawImage(image, 0, 0)
        resolve(context.getImageData(0, 0, canvas.width, canvas.height))
      } catch (error) {
        reject(error)
      } finally {
        URL.revokeObjectURL(url)
      }
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('画像ファイルを開けませんでした。'))
    }
    image.src = url
  })
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}
