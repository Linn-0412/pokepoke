import { Download, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { parseStateJson, serializeState } from '../data/storage'
import type { State } from '../domain/types'

type ExportImportProps = {
  state: State
  onImport: (state: State) => void
}

export function ExportImport({ state, onImport }: ExportImportProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [message, setMessage] = useState('')

  const exportJson = () => {
    const blob = new Blob([serializeState(state)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `packnavi-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
    setMessage('JSONを書き出しました。')
  }

  const importJson = async (file: File | undefined) => {
    if (!file) {
      return
    }
    try {
      const text = await file.text()
      onImport(parseStateJson(text))
      setMessage('JSONを読み込みました。')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'JSONを読み込めませんでした。')
    } finally {
      if (inputRef.current) {
        inputRef.current.value = ''
      }
    }
  }

  return (
    <div className="data-actions">
      <button className="icon-button" type="button" onClick={exportJson} title="JSONを書き出す">
        <Download size={18} />
        <span>書き出し</span>
      </button>
      <button
        className="icon-button"
        type="button"
        onClick={() => inputRef.current?.click()}
        title="JSONを読み込む"
      >
        <Upload size={18} />
        <span>読み込み</span>
      </button>
      <input
        ref={inputRef}
        className="visually-hidden"
        type="file"
        accept="application/json,.json"
        onChange={(event) => void importJson(event.target.files?.[0])}
      />
      {message ? <span className="action-message">{message}</span> : null}
    </div>
  )
}
