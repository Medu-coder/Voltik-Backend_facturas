'use client'
import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react'

type Kind = 'success' | 'error' | 'info'
type ToastContext = { toast: (m: string, kind?: Kind) => void }

const ToastCtx = createContext<ToastContext>({ toast: () => {} })

export function ToasterProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string>('')
  const [kind, setKind] = useState<Kind>('info')
  const timer = useRef<number | null>(null)

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current) }, [])

  const api = {
    toast: (m: string, k: Kind = 'info') => {
      setKind(k)
      setMsg(m)
      if (timer.current) window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setMsg(''), 3500)
    }
  }

  return (
    <ToastCtx.Provider value={api}>
      {children}
      {msg && (
        <div role="status" className={`toast toast-${kind}`} aria-live="polite">{msg}</div>
      )}
    </ToastCtx.Provider>
  )
}

export function useToast() { return useContext(ToastCtx) }

