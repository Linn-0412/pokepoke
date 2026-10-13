// カードDB生成スクリプト
//
// GameWith のカード一覧ページに埋め込まれたデータ (日本語名・ワザ・収録パック・画像ID) と、
// tcgp-deck-qr が使う英語カードDB (QR内のカードIDを持つ) を突き合わせて public/card-db.json を作る。
//
//   npm run build:cards
//
// GameWith 側のデータはJSの式なので eval せず、リテラルだけを読む簡易パーサで解析する。

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const GAMEWITH_LIST_URL = 'https://gamewith.jp/pokemon-tcg-pocket/462535'
const FLIB_BASE = 'https://raw.githubusercontent.com/flibustier/pokemon-tcg-pocket-database/main/dist'
// ポケモン名の日本語 -> 英語辞書 (照合の精度を上げるために使う)
const SPECIES_NAMES_URL = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/pokemon_species_names.csv'
const OUTPUT =resolve(dirname(fileURLToPath(import.meta.url)), '../public/card-db.json')

// アプリ側の RARITIES と同じ並び: ◇ ◇◇ ◇◇◇ ◇◇◇◇ ☆ ☆☆ ☆☆☆ ♛ ✦ ✦✦
const GW_RARITY = { d1: 0, d2: 1, d3: 2, d4: 3, s1: 4, s2: 5, s3: 6, ur: 7, a1: 8, a2: 9 }
const FLIB_RARITY = { C: 0, U: 1, R: 2, RR: 3, AR: 4, SR: 5, SAR: 5, IM: 6, UR: 7, S: 8, SSR: 9, CF: 0, UF: 1, RF: 2 }
const RARITY_COUNT = 10
const VERBOSE = process.argv.includes('--verbose')

// GameWith のパックキー -> 弾コード。新弾が出たらここに追記する。
const GW_PACK_SET = {
  1: 'A1', 2: 'A1', 3: 'A1', 4: 'A1', 14: 'A1',
  8: 'A1a',
  10: 'A2', 11: 'A2', 12: 'A2', 15: 'A2',
  16: 'A2a',
  18: 'A2b',
  20: 'A3', 21: 'A3', 22: 'A3', 24: 'A3',
  26: 'A3a',
  28: 'A3b',
  30: 'A4', 31: 'A4', 32: 'A4', 33: 'A4',
  35: 'A4a',
  37: 'A4b',
  39: 'B1', 40: 'B1', 41: 'B1', 42: 'B1', 43: 'B1',
  46: 'B1a',
  49: 'B2',
  51: 'B2a',
  53: 'B2b',
  55: 'B3',
  58: 'B3a',
  60: 'B3b',
  62: 'B4',
  64: 'B4a',
  66: 'B4b',
}
const PROMO_ROOTS = { 5: 'PROMO-A', 44: 'PROMO-B' }

const GW_ELEMENT = {
  草: 'grass', 炎: 'fire', 水: 'water', 雷: 'lightning', 超: 'psychic',
  闘: 'fighting', 悪: 'darkness', 鋼: 'metal', 龍: 'dragon', 無: 'colorless',
}

async function main() {
  const [html, flibCards, flibExtra, pullRates, speciesCsv] = await Promise.all([
    fetchText(GAMEWITH_LIST_URL),
    fetchJson(`${FLIB_BASE}/cards.json`),
    fetchJson(`${FLIB_BASE}/cards.extra.json`),
    fetchJson(`${FLIB_BASE}/pullRates.json`),
    fetchText(SPECIES_NAMES_URL),
  ])

  const gw = parseGameWith(html)
  const packs = buildPackCatalog(gw.packDatas)
  const gwCards = buildGwCards(gw.pokemonDatas, packs)
  attachSpeciesNames(gwCards, parseSpeciesNames(speciesCsv))
  const entities = buildEntities(flibCards, flibExtra)
  const { links, unmatchedEntities, weak } = matchEntities(entities, gwCards)

  const qr = {}
  for (const [entityKey, gwCard] of links) {
    qr[entityKey] = gwCard.id
    gwCard.en = entities.get(entityKey).name
  }

  for (const pack of packs.pullable) {
    pack.rates = setRates(pullRates[pack.set])
  }
  computePools(packs.pullable, gwCards)

  const output = {
    version: 1,
    generatedAt: new Date().toISOString(),
    sources: [GAMEWITH_LIST_URL, `${FLIB_BASE}/cards.json`, `${FLIB_BASE}/pullRates.json`],
    imageBase: 'https://img.gamewith.jp/article_tools/pokemon-tcg-pocket/gacha/',
    packs: packs.pullable.map(({ id, name, set, rates, pool }) => ({ id, name, set, rates, pool })),
    cards: gwCards.map(serializeCard),
    qr,
  }

  await mkdir(dirname(OUTPUT), { recursive: true })
  await writeFile(OUTPUT, JSON.stringify(output))

  console.log(`packs: ${output.packs.length}`)
  console.log(`cards: ${output.cards.length} (prints: ${gwCards.reduce((sum, card) => sum + card.prints.length, 0)})`)
  console.log(`QR entities linked: ${links.size} / ${entities.size}`)
  if (unmatchedEntities.length > 0) {
    console.log(`unmatched QR entities (${unmatchedEntities.length}):`)
    for (const entity of unmatchedEntities.slice(0, 40)) {
      console.log(`  ${entity.key} ${entity.name} ${[...entity.prints].join(',')}`)
    }
  }
  console.log(`weak name matches: ${weak.length}${VERBOSE ? '' : ' (--verbose で一覧表示)'}`)
  if (VERBOSE) for (const line of weak) console.log(`  ${line}`)
  const unknownPackKeys = [...packs.unknown]
  if (unknownPackKeys.length > 0) {
    console.log(`WARNING: GW_PACK_SET に未登録のパック: ${unknownPackKeys.join(', ')}`)
  }
}

// ---------------------------------------------------------------- GameWith

function parseGameWith(html) {
  const result = {}
  for (const name of ['packDatas', 'pokemonDatas']) {
    const marker = `window.wmt.${name}=`
    const index = html.indexOf(marker)
    if (index < 0) {
      throw new Error(`GameWith のページから ${name} が見つかりません。ページ構成が変わった可能性があります。`)
    }
    result[name] = new LiteralParser(html, index + marker.length).parseValue()
  }
  return result
}

// JS のオブジェクト/配列/文字列/数値リテラルだけを読む簡易パーサ。
class LiteralParser {
  constructor(text, position) {
    this.text = text
    this.pos = position
  }

  parseValue() {
    this.skipSpace()
    const char = this.text[this.pos]
    if (char === '[') return this.parseArray()
    if (char === '{') return this.parseObject()
    if (char === "'" || char === '"') return this.parseString()
    const match = /^-?\d+(\.\d+)?/.exec(this.text.slice(this.pos, this.pos + 32))
    if (match) {
      this.pos += match[0].length
      return Number(match[0])
    }
    const word = /^(true|false|null)/.exec(this.text.slice(this.pos, this.pos + 5))
    if (word) {
      this.pos += word[0].length
      return JSON.parse(word[0])
    }
    throw new Error(`Unexpected token at ${this.pos}: ${this.text.slice(this.pos, this.pos + 30)}`)
  }

  parseArray() {
    const values = []
    this.pos += 1
    for (;;) {
      this.skipSpace()
      if (this.text[this.pos] === ']') {
        this.pos += 1
        return values
      }
      values.push(this.parseValue())
      this.skipSpace()
      if (this.text[this.pos] === ',') this.pos += 1
    }
  }

  parseObject() {
    const value = {}
    this.pos += 1
    for (;;) {
      this.skipSpace()
      if (this.text[this.pos] === '}') {
        this.pos += 1
        return value
      }
      const key = this.parseKey()
      this.skipSpace()
      this.expect(':')
      value[key] = this.parseValue()
      this.skipSpace()
      if (this.text[this.pos] === ',') this.pos += 1
    }
  }

  parseKey() {
    const char = this.text[this.pos]
    if (char === "'" || char === '"') return this.parseString()
    const match = /^[A-Za-z_$][\w$]*/.exec(this.text.slice(this.pos, this.pos + 64))
    if (!match) throw new Error(`Invalid key at ${this.pos}`)
    this.pos += match[0].length
    return match[0]
  }

  parseString() {
    const quote = this.text[this.pos]
    let out = ''
    this.pos += 1
    for (;;) {
      const char = this.text[this.pos]
      if (char === undefined) throw new Error('Unterminated string')
      this.pos += 1
      if (char === quote) return out
      if (char !== '\\') {
        out += char
        continue
      }
      const next = this.text[this.pos]
      this.pos += 1
      if (next === 'n') out += '\n'
      else if (next === 't') out += '\t'
      else if (next === 'u') {
        out += String.fromCharCode(parseInt(this.text.slice(this.pos, this.pos + 4), 16))
        this.pos += 4
      } else out += next
    }
  }

  expect(char) {
    if (this.text[this.pos] !== char) throw new Error(`Expected ${char} at ${this.pos}`)
    this.pos += 1
  }

  skipSpace() {
    while (/\s/.test(this.text[this.pos] ?? '')) this.pos += 1
  }
}

// GameWith のパック階層を「実際に引けるパック」に展開する。
// 例: 最強の遺伝子(親) = ピカチュウ / ミュウツー / リザードン / 共通。共通カードは3パックすべてに入る。
function buildPackCatalog(packDatas) {
  const byKey = new Map(packDatas.map((pack) => [String(pack.k), pack]))
  const parentOf = new Map()
  for (const pack of packDatas) {
    for (const child of pack.children ?? []) parentOf.set(String(child), String(pack.k))
  }

  const promoSet = (key) => {
    let current = key
    while (current) {
      if (PROMO_ROOTS[current]) return PROMO_ROOTS[current]
      current = parentOf.get(current)
    }
    return null
  }
  const isCommon = (pack) => /共通$/.test(pack.n)

  const pullable = []
  const unknown = new Set()
  for (const pack of packDatas) {
    const key = String(pack.k)
    if (promoSet(key) || pack.children?.length || isCommon(pack)) continue
    const set = GW_PACK_SET[key]
    if (!set) unknown.add(`${key}:${pack.n}`)
    const parent = byKey.get(parentOf.get(key) ?? '')
    pullable.push({
      id: `gw${key}`,
      key,
      // 「空と海の導きホウオウ」→「空と海の導き ホウオウ」
      name: parent && pack.n.startsWith(parent.n) ? `${parent.n} ${pack.n.slice(parent.n.length)}` : pack.n,
      set: set ?? null,
    })
  }

  const pullableKeys = new Set(pullable.map((pack) => pack.key))
  // GameWith のパックキー1つを、引けるパックIDの一覧に展開する
  const expand = (key) => {
    key = String(key)
    const pack = byKey.get(key)
    if (!pack) return []
    if (pullableKeys.has(key)) return [`gw${key}`]
    if (pack.children?.length) return pack.children.flatMap(expand)
    const parent = parentOf.get(key)
    if (isCommon(pack) && parent) {
      return byKey.get(parent).children.filter((child) => pullableKeys.has(String(child))).map((child) => `gw${child}`)
    }
    return []
  }

  const setOf = (key) => GW_PACK_SET[key] ?? promoSet(String(key))

  return { pullable, unknown, expand, setOf }
}

function buildGwCards(pokemonDatas, packs) {
  return pokemonDatas.map((raw) => {
    const printsRaw = [{ id: raw.id, r: raw.r, p: raw.p }, ...(raw.ver ?? [])]
    const prints = printsRaw.map((print) => {
      const keys = String(print.p ?? '').split(',').map((key) => key.trim()).filter(Boolean)
      return {
        id: String(print.id),
        r: print.r === 'pr' ? null : (GW_RARITY[print.r] ?? null),
        packs: [...new Set(keys.flatMap(packs.expand))],
        sets: [...new Set(keys.map(packs.setOf).filter(Boolean))],
        promo: print.r === 'pr' || keys.every((key) => packs.setOf(key)?.startsWith('PROMO')),
      }
    })
    return {
      id: String(raw.id),
      name: raw.n,
      kind: raw.c,
      type: raw.t,
      element: GW_ELEMENT[raw.t] ?? null,
      hp: raw.hp ? Number(raw.hp) : undefined,
      stage: (raw.o ?? []).find((value) => value !== 'ex'),
      ex: (raw.o ?? []).includes('ex'),
      moves: (raw.mv ?? []).map((move) => ({ n: move.n, v: move.v, c: move.c, t: move.t || undefined })),
      ability: raw.ab,
      text: raw.txt,
      prints,
      romaji: normalizeRomaji(kanaToRomaji(raw.n)),
      hasKanji: /[一-鿿]/.test(raw.n),
    }
  })
}

function serializeCard(card) {
  const out = {
    id: card.id,
    name: card.name,
    kind: card.kind,
    type: card.type,
  }
  if (card.en) out.en = card.en
  if (card.hp) out.hp = card.hp
  if (card.moves.length > 0) out.moves = card.moves
  if (card.ability) out.ability = card.ability
  if (card.text) out.text = card.text
  out.prints = card.prints.map((print) => {
    const value = { id: print.id, r: print.r, packs: print.packs }
    if (print.promo) value.promo = true
    return value
  })
  return out
}

// ------------------------------------------------------------- 英語DB (QR)

function buildEntities(flibCards, flibExtra) {
  const extraByImage = new Map(flibExtra.map((card) => [card.image, card]))
  const entities = new Map()
  for (const card of flibCards) {
    const match = /^c(PK|TR)_\d+_(\d{6})_\d+_(.+?)_[A-Z]+\.webp$/.exec(decodeURIComponent(card.image ?? ''))
    if (!match) continue
    const type = match[1] === 'PK' ? 'pokemon' : 'trainer'
    const key = `${type}:${Number(match[2])}`
    const extra = extraByImage.get(card.image) ?? {}
    let entity = entities.get(key)
    if (!entity) {
      entity = {
        key,
        kind: type === 'pokemon' ? 'P' : 'T',
        name: card.name,
        romaji: normalizeRomaji(match[3]),
        element: extra.element ? String(extra.element).toLowerCase() : null,
        prints: [],
      }
      entities.set(key, entity)
    }
    if (!entity.element && extra.element) entity.element = String(extra.element).toLowerCase()
    const rarity = card.set.startsWith('PROMO') ? 'P' : FLIB_RARITY[card.rarity]
    entity.prints.push(`${card.set}|${rarity}`)
    const origin = { set: card.set, order: Number(card.number) }
    if (!entity.origin || compareOrigin(origin, entity.origin) < 0) entity.origin = origin
  }
  assignOrderPositions([...entities.values()])
  return entities
}

// 初出の弾 (通常弾を優先) と弾内の並び順。GameWith のIDは弾内でほぼカード番号順に振られている。
const SET_ORDER = [...new Set(Object.values(GW_PACK_SET))]

function setRank(set) {
  const index = SET_ORDER.indexOf(set)
  return index >= 0 ? index : SET_ORDER.length + (set.startsWith('PROMO-A') ? 0 : 1)
}

function compareOrigin(a, b) {
  return setRank(a.set) - setRank(b.set) || a.order - b.order
}

function assignOrderPositions(items) {
  const bySet = new Map()
  for (const item of items) {
    if (!item.origin) continue
    const list = bySet.get(item.origin.set) ?? []
    list.push(item)
    bySet.set(item.origin.set, list)
  }
  for (const list of bySet.values()) {
    list.sort((a, b) => a.origin.order - b.origin.order)
    list.forEach((item, index) => {
      item.position = list.length > 1 ? index / (list.length - 1) : 0
    })
  }
}

function orderScore(entity, card) {
  if (!entity.origin || !card.origin || entity.origin.set !== card.origin.set) return 0
  return Math.max(0, 1 - Math.abs(entity.position - card.position) * 10)
}

// QRのカードID (エンティティ) と GameWith のカードを1対1で対応付ける。
// 収録弾×レアリティの重なりを主に、タイプと名前の類似度で補強した貪欲マッチング。
function matchEntities(entities, gwCards) {
  for (const card of gwCards) {
    for (const print of card.prints) {
      for (const set of print.sets) {
        const origin = { set, order: Number(card.id) }
        if (!card.origin || compareOrigin(origin, card.origin) < 0) card.origin = origin
      }
    }
  }
  assignOrderPositions(gwCards)

  const gwPrintKeys = new Map(
    gwCards.map((card) => [
      card,
      card.prints.flatMap((print) =>
        print.sets.map((set) => `${set}|${set.startsWith('PROMO') || print.r == null ? 'P' : print.r}`),
      ),
    ]),
  )

  const bySetKey = new Map()
  for (const [card, keys] of gwPrintKeys) {
    for (const key of keys) {
      const list = bySetKey.get(key) ?? []
      list.push(card)
      bySetKey.set(key, list)
    }
  }

  const candidates = []
  for (const entity of entities.values()) {
    const seen = new Set()
    for (const key of entity.prints) {
      for (const card of bySetKey.get(key) ?? []) {
        if (seen.has(card) || card.kind !== entity.kind) continue
        seen.add(card)
        const overlap = multisetOverlap(entity.prints, gwPrintKeys.get(card))
        const nameScore = card.speciesEn
          ? Number(normalizeEnglish(entity.name).includes(card.speciesEn))
          : similarity(entity.romaji, card.romaji)
        // 漢字を含む名前はローマ字で比べられないので、弾内の並び順を強めに使う
        const orderWeight = card.hasKanji ? 1 : 0.3
        // タイプはDB間で食い違うことがあるので除外ではなく減点
        const elementPenalty = entity.element && card.element && entity.element !== card.element ? 0.5 : 0
        const score = overlap * 2 + nameScore + orderScore(entity, card) * orderWeight - elementPenalty
        if (score >= 1.2) candidates.push({ entity, card, nameScore, score })
      }
    }
  }
  candidates.sort((a, b) => b.score - a.score)

  const scoreOf = new Map(candidates.map((candidate) => [`${candidate.entity.key}|${candidate.card.id}`, candidate]))
  const pairScore = (entity, card) => scoreOf.get(`${entity.key}|${card.id}`)?.score
  const cardOf = new Map()
  const ownerOf = new Map()
  const assign = (entity, card) => {
    cardOf.set(entity, card)
    ownerOf.set(card, entity)
  }

  for (const { entity, card } of candidates) {
    if (cardOf.has(entity) || ownerOf.has(card)) continue
    assign(entity, card)
  }

  // 貪欲法の取り合いを局所的に直す: 入れ替え / 空いているカードへの付け替えで合計スコアが上がるなら採用
  const candidatesOf = new Map()
  for (const candidate of candidates) {
    const list = candidatesOf.get(candidate.entity) ?? []
    list.push(candidate)
    candidatesOf.set(candidate.entity, list)
  }
  for (let round = 0; round < 10; round += 1) {
    let changed = false
    for (const { entity, card, score } of candidates) {
      const currentCard = cardOf.get(entity)
      if (currentCard === card) continue
      const currentScore = currentCard ? pairScore(entity, currentCard) : 0
      const other = ownerOf.get(card)
      const otherScore = other ? pairScore(other, card) : 0

      // other の行き先: entity が今持っているカード、または空いているカード
      let otherTarget = null
      let otherTargetScore = 0
      if (other) {
        for (const alternative of candidatesOf.get(other) ?? []) {
          const free = !ownerOf.has(alternative.card) || alternative.card === currentCard
          if (free && alternative.card !== card && alternative.score > otherTargetScore) {
            otherTarget = alternative.card
            otherTargetScore = alternative.score
          }
        }
      }

      if (score + otherTargetScore > currentScore + otherScore + 1e-9) {
        if (currentCard) ownerOf.delete(currentCard)
        if (other) cardOf.delete(other)
        assign(entity, card)
        if (other && otherTarget) assign(other, otherTarget)
        changed = true
      }
    }
    if (!changed) break
  }

  const links = new Map()
  const weak = []
  for (const [entity, card] of cardOf) {
    links.set(entity.key, card)
    const { nameScore, score } = scoreOf.get(`${entity.key}|${card.id}`)
    if (nameScore < 0.6) weak.push(`${entity.key} ${entity.name} (${entity.romaji}) -> ${card.name} (${card.romaji}) score=${score.toFixed(2)}`)
  }

  const unmatchedEntities = [...entities.values()].filter((entity) => !links.has(entity.key))
  return { links, unmatchedEntities, weak }
}

function multisetOverlap(a, b) {
  const counts = new Map()
  for (const key of a) counts.set(key, (counts.get(key) ?? 0) + 1)
  let common = 0
  for (const key of b) {
    const count = counts.get(key) ?? 0
    if (count > 0) {
      common += 1
      counts.set(key, count - 1)
    }
  }
  return common / Math.max(a.length, b.length)
}

// ------------------------------------------------------------ 排出率・プール

// 弾ごとのパック種別 (通常 / レア / +1 など) を出現率で重み付けし、1パックあたりの期待枚数にする。
function setRates(setRates) {
  if (!setRates) return null
  const rates = new Array(RARITY_COUNT).fill(0)
  for (const packType of Object.values(setRates)) {
    const weight = Number(packType.appearance_rate) / 100
    for (const slot of Object.values(packType.slots ?? {})) {
      for (const [rarity, percent] of Object.entries(slot)) {
        const index = FLIB_RARITY[rarity]
        if (index == null) continue
        rates[index] += (weight * Number(percent)) / 100
      }
    }
  }
  return rates.map((rate) => Number(rate.toFixed(5)))
}

function computePools(pullable, gwCards) {
  const pools = new Map(pullable.map((pack) => [pack.id, new Array(RARITY_COUNT).fill(0)]))
  for (const card of gwCards) {
    for (const print of card.prints) {
      if (print.r == null) continue
      for (const packId of print.packs) pools.get(packId)[print.r] += 1
    }
  }
  for (const pack of pullable) pack.pool = pools.get(pack.id)
}

// ------------------------------------------------------------- 名前の正規化

function parseSpeciesNames(csv) {
  const byId = new Map()
  for (const line of csv.split(/\r?\n/).slice(1)) {
    const [id, language, name] = line.split(',')
    if (!name) continue
    const entry = byId.get(id) ?? {}
    if (language === '1') entry.ja = name
    if (language === '9') entry.en = name
    byId.set(id, entry)
  }
  return [...byId.values()]
    .filter((entry) => entry.ja && entry.en)
    .sort((a, b) => b.ja.length - a.ja.length)
}

// 「メガリザードンXex」「ロケット団のスリーパー」などから、含まれる種族名を最長一致で探す
function attachSpeciesNames(gwCards, species) {
  for (const card of gwCards) {
    if (card.kind !== 'P') continue
    const katakana = card.name.replace(/[ぁ-ゖ]/g, (char) => String.fromCharCode(char.charCodeAt(0) + 0x60))
    const hit = species.find((entry) => katakana.includes(entry.ja))
    if (hit) card.speciesEn = normalizeEnglish(hit.en)
  }
}

function normalizeEnglish(value) {
  return value.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

const KANA = {
  ア: 'A', イ: 'I', ウ: 'U', エ: 'E', オ: 'O', カ: 'KA', キ: 'KI', ク: 'KU', ケ: 'KE', コ: 'KO',
  サ: 'SA', シ: 'SHI', ス: 'SU', セ: 'SE', ソ: 'SO', タ: 'TA', チ: 'CHI', ツ: 'TSU', テ: 'TE', ト: 'TO',
  ナ: 'NA', ニ: 'NI', ヌ: 'NU', ネ: 'NE', ノ: 'NO', ハ: 'HA', ヒ: 'HI', フ: 'FU', ヘ: 'HE', ホ: 'HO',
  マ: 'MA', ミ: 'MI', ム: 'MU', メ: 'ME', モ: 'MO', ヤ: 'YA', ユ: 'YU', ヨ: 'YO',
  ラ: 'RA', リ: 'RI', ル: 'RU', レ: 'RE', ロ: 'RO', ワ: 'WA', ヲ: 'O', ン: 'N',
  ガ: 'GA', ギ: 'GI', グ: 'GU', ゲ: 'GE', ゴ: 'GO', ザ: 'ZA', ジ: 'JI', ズ: 'ZU', ゼ: 'ZE', ゾ: 'ZO',
  ダ: 'DA', ヂ: 'JI', ヅ: 'ZU', デ: 'DE', ド: 'DO', バ: 'BA', ビ: 'BI', ブ: 'BU', ベ: 'BE', ボ: 'BO',
  パ: 'PA', ピ: 'PI', プ: 'PU', ペ: 'PE', ポ: 'PO', ヴ: 'VU',
  ァ: 'A', ィ: 'I', ゥ: 'U', ェ: 'E', ォ: 'O', ャ: 'YA', ュ: 'YU', ョ: 'YO',
}

function kanaToRomaji(name) {
  const katakana = name.replace(/[ぁ-ゖ]/g, (char) => String.fromCharCode(char.charCodeAt(0) + 0x60))
  let out = ''
  for (let i = 0; i < katakana.length; i += 1) {
    const char = katakana[i]
    const next = katakana[i + 1]
    if (char === 'ッ') continue
    if (char === 'ー') {
      out += out.at(-1) ?? ''
      continue
    }
    let romaji = KANA[char]
    if (romaji === undefined) {
      out += /[A-Za-z0-9]/.test(char) ? char.toUpperCase() : ''
      continue
    }
    // キャ / シュ / チョ などの拗音
    if (next && 'ャュョ'.includes(next) && romaji.endsWith('I') && romaji.length > 1) {
      romaji = romaji.replace(/(SH|CH|J)I$/, '$1').replace(/I$/, 'Y') + KANA[next].slice(1)
      i += 1
    } else if (next && 'ァィゥェォ'.includes(next)) {
      romaji = romaji.replace(/[AIUEO]$/, '') + KANA[next]
      i += 1
    }
    out += romaji
  }
  return out
}

function normalizeRomaji(value) {
  return value
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .replace(/L/g, 'R')
    .replace(/OU/g, 'O')
    .replace(/([AIUEO])\1+/g, '$1')
    .replace(/([B-DF-HJ-NP-TV-Z])\1+/g, '$1')
    .replace(/M([BP])/g, 'N$1')
}

function similarity(a, b) {
  if (!a || !b) return 0
  const longest = Math.max(a.length, b.length)
  return 1 - levenshtein(a, b) / longest
}

function levenshtein(a, b) {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i]
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    previous = current
  }
  return previous[b.length]
}

// ------------------------------------------------------------------- fetch

async function fetchText(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (packnavi card-db builder)' } })
  if (!response.ok) throw new Error(`${url}: ${response.status}`)
  return response.text()
}

async function fetchJson(url) {
  return JSON.parse(await fetchText(url))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
