'use client'
import { useState } from 'react'

export default function JsonViewer({ value }: { value: unknown }) {
  const [expanded, setExpanded] = useState(true)
  return (
    <div>
      <div className="hstack" style={{ justifyContent: 'space-between', marginBottom: '0.5rem' }}>
        <button className="button" onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'Contraer' : 'Expandir'}
        </button>
        <button className="button" onClick={() => copy(JSON.stringify(value, null, 2))}>Copiar</button>
      </div>
      <pre aria-live="polite" style={{ maxHeight: expanded ? 480 : 180, overflow: 'auto' }}>
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  )
}

function copy(text: string) {
  navigator.clipboard?.writeText(text)
}

