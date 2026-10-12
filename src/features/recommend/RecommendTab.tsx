import { AlertTriangle, Trophy } from 'lucide-react'
import { RARITIES } from '../../domain/constants'
import type { CalculationResult, State } from '../../domain/types'

type RecommendTabProps = {
  state: State
  result: CalculationResult
}

export function RecommendTab({ state, result }: RecommendTabProps) {
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
            <ContributionList contributions={result.best.contributions.slice(0, 5)} />
          </>
        ) : (
          <div className="empty-state">
            <h2>おすすめはまだ出せません</h2>
            <p>パック、デッキ、足りないカードの収録先を入力するとランキングが出ます。</p>
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
        <h2>全パックランキング</h2>
        {state.packs.length === 0 ? (
          <p className="empty-line">パックを登録するとランキングが表示されます。</p>
        ) : (
          <div className="ranking-list">
            {result.rankings.map((ranking, index) => (
              <article className="ranking-item" key={ranking.packId}>
                <div className="rank-number">{index + 1}</div>
                <div>
                  <h3>{ranking.packName}</h3>
                  <p>
                    期待枚数 {formatDecimal(ranking.score)} / {formatPacks(ranking.packsPerHit)}
                  </p>
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
            {result.missingCards.map((card) => (
              <article className="missing-card" key={card.name}>
                <div>
                  <h3>{card.name}</h3>
                  <p>
                    {RARITIES[card.r]} / {card.own}枚 / {card.need}枚
                  </p>
                </div>
                <strong>あと{card.missing}枚</strong>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function ContributionList({
  contributions,
}: {
  contributions: { cardName: string; rarity: number; missing: number; probability: number }[]
}) {
  if (contributions.length === 0) {
    return <p className="empty-line">寄与するカードがありません。</p>
  }

  return (
    <div className="contribution-list">
      {contributions.map((item) => (
        <div className="contribution-item" key={`${item.cardName}-${item.rarity}`}>
          <div>
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
