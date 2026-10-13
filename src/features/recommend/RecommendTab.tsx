import { AlertTriangle, Trophy } from 'lucide-react'
import { CardImage } from '../../components/CardImage'
import { representativePrint } from '../../data/cardDb'
import { RARITIES } from '../../domain/constants'
import type { CalculationResult, CardDb, PackContribution, State } from '../../domain/types'

type RecommendTabProps = {
  state: State
  result: CalculationResult
  db: CardDb | null
}

export function RecommendTab({ state, result, db }: RecommendTabProps) {
  return (
    <div className="tab-panel">
      <section className="best-pack">
        <div className="best-pack-heading">
          <Trophy size={24} />
          <span>今引くならこのパック</span>
        </div>
        {result.best ? (
          <>
            <h2>{result.best.packName}</h2>
            <div className="metric-grid">
              <div>
                <span className="metric-label">期待枚数</span>
                <strong>{formatDecimal(result.best.score)}</strong>
              </div>
              <div>
                <span className="metric-label">約何パックに1枚</span>
                <strong>{formatPacks(result.best.packsPerHit)}</strong>
              </div>
            </div>
            <ContributionList contributions={result.best.contributions.slice(0, 5)} db={db} />
          </>
        ) : (
          <div className="empty-state">
            <h2>おすすめはまだ出せません</h2>
            <p>パックタブでほしいカードをタップするか、デッキを登録するとランキングが出ます。</p>
          </div>
        )}
      </section>

      {result.warnings.length > 0 ? (
        <section className="warning-list">
          <h2>
            <AlertTriangle size={18} />
            確認が必要な項目
          </h2>
          <ul>
            {result.warnings.map((warning) => (
              <li key={warning.id}>{warning.message}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h2>パックランキング</h2>
        {result.rankings.length === 0 ? (
          <p className="empty-line">
            {state.packs.length === 0 && result.missingCards.length === 0
              ? 'ほしいカードを登録するとランキングが表示されます。'
              : '不足カードが出るパックがありません。'}
          </p>
        ) : (
          <div className="ranking-list">
            {result.rankings.map((ranking, index) => (
              <article className="ranking-item" key={ranking.packId}>
                <div className="rank-number">{index + 1}</div>
                <div className="ranking-body">
                  <h3>{ranking.packName}</h3>
                  <p>
                    期待枚数 {formatDecimal(ranking.score)} / {formatPacks(ranking.packsPerHit)}
                  </p>
                  {ranking.contributions.length > 0 ? (
                    <p className="small">
                      {ranking.contributions
                        .slice(0, 4)
                        .map((item) => item.cardName)
                        .join('・')}
                      {ranking.contributions.length > 4 ? ` 他${ranking.contributions.length - 4}種` : ''}
                    </p>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2>足りないカード</h2>
        {result.missingCards.length === 0 ? (
          <p className="empty-line">不足カードはありません。</p>
        ) : (
          <div className="missing-list">
            {result.missingCards.map((card) => {
              const dbCard = card.cardId ? db?.cardsById.get(card.cardId) : undefined
              const source = result.bestSources[card.key]
              const printId = source?.printId ?? (dbCard ? representativePrint(dbCard, card.printIds).id : undefined)
              return (
                <article className="missing-card" key={card.key}>
                  {db && printId ? <CardImage alt={card.name} db={db} printId={printId} /> : null}
                  <div className="missing-card-body">
                    <h3>{card.name}</h3>
                    <p>
                      {RARITIES[card.r]}
                      {card.cardId && !card.printIds?.length ? '〜 (どの絵柄でも)' : ''} / {card.own}枚 / {card.need}枚
                    </p>
                    {source ? (
                      <p className="small best-source">
                        一番出やすい: {source.packName} ({formatPercent(source.probability)})
                      </p>
                    ) : null}
                  </div>
                  <strong>あと{card.missing}枚</strong>
                </article>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

function ContributionList({ contributions, db }: { contributions: PackContribution[]; db: CardDb | null }) {
  if (contributions.length === 0) {
    return <p className="empty-line">寄与するカードがありません。</p>
  }

  return (
    <div className="contribution-list">
      {contributions.map((item) => (
        <div className="contribution-item" key={item.cardKey}>
          {db && item.printId ? <CardImage alt={item.cardName} className="mini-thumb" db={db} printId={item.printId} /> : null}
          <div className="contribution-body">
            <strong>{item.cardName}</strong>
            <span>
              {RARITIES[item.rarity]} / あと{item.missing}枚
            </span>
          </div>
          <b>{formatPercent(item.probability)}</b>
        </div>
      ))}
    </div>
  )
}

function formatDecimal(value: number): string {
  return value.toFixed(value >= 1 ? 2 : 4)
}

function formatPacks(value: number | null): string {
  if (!value || !Number.isFinite(value)) {
    return '-'
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)}パック`
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(value >= 0.01 ? 2 : 3)}%`
}
