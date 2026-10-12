import type { Pack } from '../domain/types'

type ChipSelectorProps = {
  packs: Pack[]
  selected: string[]
  onChange: (packIds: string[]) => void
}

export function ChipSelector({ packs, selected, onChange }: ChipSelectorProps) {
  const selectedSet = new Set(selected)

  if (packs.length === 0) {
    return <p className="muted small">先にパックを登録してください。</p>
  }

  return (
    <div className="chip-list" aria-label="収録パック">
      {packs.map((pack) => {
        const active = selectedSet.has(pack.id)
        return (
          <button
            className={`chip ${active ? 'active' : ''}`}
            key={pack.id}
            type="button"
            onClick={() => {
              if (active) {
                onChange(selected.filter((id) => id !== pack.id))
              } else {
                onChange([...selected, pack.id])
              }
            }}
          >
            {pack.name}
          </button>
        )
      })}
    </div>
  )
}
