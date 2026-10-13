import { X } from 'lucide-react'
import { useEffect } from 'react'
import { cardImageUrl } from '../data/cardDb'
import { RARITIES } from '../domain/constants'
import type { CardDb, DbCard } from '../domain/types'

type CardImageProps = {
  db: CardDb
  printId: string
  alt: string
  size?: 's' | 'm'
  className?: string
}

export function CardImage({ db, printId, alt, size = 's', className = 'card-thumb' }: CardImageProps) {
  return (
    <img
      alt={alt}
      className={className}
      decoding="async"
      height={size === 's' ? 120 : 379}
      loading="lazy"
      referrerPolicy="no-referrer"
      src={cardImageUrl(db, printId, size)}
      width={size === 's' ? 86 : 272}
    />
  )
}

type CardDetailProps = {
  db: CardDb
  card: DbCard
  printId?: string
  onClose: () => void
}

/** 大きい画像とワザ・収録パックを表示するダイアログ */
export function CardDetail({ db, card, printId, onClose }: CardDetailProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const shown = printId ?? card.prints[0]?.id
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        aria-label={card.name}
        aria-modal="true"
        className="card-detail"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <button className="icon-only-button modal-close" type="button" onClick={onClose} title="閉じる">
          <X size={18} />
        </button>
        {shown ? <CardImage alt={card.name} className="card-large" db={db} printId={shown} size="m" /> : null}
        <div className="card-detail-body">
          <h2>{card.name}</h2>
          <p className="muted small">
            {card.kind === 'P' ? `${card.type}タイプ${card.hp ? ` / HP${card.hp}` : ''}` : card.type === 'サ' ? 'サポート' : 'トレーナーズ'}
            {card.en ? ` / ${card.en}` : ''}
          </p>
          {card.ability ? (
            <p className="small">
              <strong>特性 {card.ability.n}</strong> {card.ability.t}
            </p>
          ) : null}
          {(card.moves ?? []).map((move) => (
            <p className="small" key={move.n}>
              <strong>
                {move.n} {move.v !== '-' ? move.v : ''}
              </strong>{' '}
              <span className="muted">[{move.c}]</span> {move.t}
            </p>
          ))}
          {card.text ? <p className="small">{card.text}</p> : null}
          <h3>収録</h3>
          <ul className="print-list">
            {card.prints.map((print) => (
              <li key={print.id}>
                <span className="rarity-label">{print.r == null ? 'プロモ' : RARITIES[print.r]}</span>
                <span>
                  {print.packs.length > 0
                    ? print.packs.map((packId) => db.packsById.get(packId)?.name ?? packId).join(' / ')
                    : 'パック外 (プロモ等)'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
