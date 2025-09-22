# Plan de implementación UI mínima (MVP facturas)

Rol: Arquitecto de Software y Full-Stack Senior. Este plan entrega artefactos listos para pegar (archivos, rutas, comandos, .env.example y README inline), cumpliendo el contexto y criterios de aceptación.

Si falta algún dato, se usan placeholders EN_MAYÚSCULAS. Estilo minimal, accesible y sin dependencias pesadas. Se asume guía de estilos `styles.css` ya definida (clases propuestas: `container`, `card`, `button`, `input`, `label`, `table`, `badge`, `toast`).


## Resumen y supuestos
- Next.js (App Router) + Supabase (Auth + Postgres + Storage privado) + n8n (webhooks) según arquitectura dada.
- Bucket privado `invoices` en Supabase Storage. Objetos: `userId/<invoiceId>.pdf`.
- Tabla `invoices` (RLS activas). Campos mínimos usados por la UI: `id (uuid)`, `user_id`, `customer_name (text)`, `date_start (date)`, `date_end (date)`, `issue_date (date)`, `status (text)`, `total (numeric)`, `storage_path (text)`, `json_raw (jsonb)`, `created_at (timestamptz)`.
  - Supuesto: MVP usa `customer_name` denormalizado (texto). Si hay `customers`, adaptar el selector del formulario.
- Orquestación: la subida web encola en n8n vía webhook `N8N_WEBHOOK_URL_ENQUEUE` con payload `{ invoice_id, user_id, storage_path }`.
- Seguridad: no exponer secrets en cliente; operaciones sensibles (subida a Storage, signed URLs) en server routes.
- URLs firmadas con expiración corta (ej. 120s).


## Estructura propuesta (App Router)
- `app/login/page.tsx`
- `app/dashboard/page.tsx`
- `app/invoices/[id]/page.tsx`
- `app/upload/page.tsx`
- `components/InvoiceTable.tsx`
- `components/JsonViewer.tsx`
- `components/UploadForm.tsx`
- `components/Toaster.tsx` (muy liviano para toasts)
- `lib/supabase/server.ts`, `lib/supabase/client.ts`
- `lib/auth.ts`
- Rutas API (server only):
  - `app/api/auth/callback/route.ts` (Magic Link)
  - `app/api/upload/route.ts` (subida PDF + encolar)
  - `app/api/invoices/[id]/download/route.ts` (descarga firmada)
  - `app/api/invoices/[id]/reprocess/route.ts` (reprocesar)
  - `app/api/invoices/export.csv/route.ts` (CSV con filtros)


## Dependencias mínimas y comandos
```bash
# Inicial (usar uno)
yarn add @supabase/supabase-js @supabase/auth-helpers-nextjs
# ó
pnpm add @supabase/supabase-js @supabase/auth-helpers-nextjs
# ó
npm i @supabase/supabase-js @supabase/auth-helpers-nextjs
```


## .env.example (pegar en el root del proyecto Next.js)
```dotenv
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=SUPABASE_SERVICE_ROLE_KEY

# App
NEXT_PUBLIC_APP_URL=https://APP_DOMAIN # p.ej. http://localhost:3000 en dev
STORAGE_INVOICES_BUCKET=invoices
STORAGE_SIGNED_URL_TTL_SECS=120

# n8n (enqueue de procesamiento)
N8N_WEBHOOK_URL_ENQUEUE=https://RAILWAY_OR_CUSTOM_DOMAIN/webhook/INBOUND_KEY
```


## lib: helpers de Supabase/Auth

Archivo: `lib/supabase/server.ts`
```ts
// lib/supabase/server.ts
import { cookies } from 'next/headers'
import { createServerComponentClient, createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'

export const supabaseServer = () => createServerComponentClient({ cookies })
export const supabaseRoute = () => createRouteHandlerClient({ cookies })
```

Archivo: `lib/supabase/client.ts`
```ts
// lib/supabase/client.ts
'use client'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
export const supabaseClient = () => createClientComponentClient()
```

Archivo: `lib/auth.ts`
```ts
// lib/auth.ts
import { redirect } from 'next/navigation'
import { supabaseServer } from './supabase/server'

export async function requireSession() {
  const supabase = supabaseServer()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')
  return session
}
```


## UI: páginas y componentes (snippets listos para pegar)

### app/login/page.tsx
- Magic Link sin dependencias pesadas; redirige a `/dashboard` tras callback.
- Si ya hay sesión, redirige a `/dashboard`.
```tsx
// app/login/page.tsx
import { supabaseServer } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import LoginForm from './login-form'

export default async function LoginPage() {
  const supabase = supabaseServer()
  const { data: { session } } = await supabase.auth.getSession()
  if (session) redirect('/dashboard')

  return (
    <main className="container">
      <div className="card" style={{ maxWidth: 420, margin: '4rem auto' }}>
        <h1>Accede</h1>
        <p className="muted">Te enviaremos un enlace mágico al email.</p>
        <LoginForm />
      </div>
    </main>
  )
}
```

Archivo auxiliar cliente: `app/login/login-form.tsx`
```tsx
'use client'
import { useState } from 'react'
import { supabaseClient } from '@/lib/supabase/client'
import { Toaster, useToast } from '@/components/Toaster'

export default function LoginForm() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const supabase = supabaseClient()
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback` },
      })
      if (error) throw error
      toast('Enlace enviado. Revisa tu email.', 'success')
    } catch (err: any) {
      toast(err.message || 'Error al enviar enlace', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <form onSubmit={onSubmit} className="vstack" aria-label="Formulario de acceso">
        <label className="label" htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          className="input"
          placeholder="tu@email.com"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-required
        />
        <button className="button" type="submit" disabled={loading} aria-busy={loading}>
          {loading ? 'Enviando…' : 'Enviar enlace mágico'}
        </button>
      </form>
      <Toaster />
    </>
  )
}
```

Callback Magic Link (server): `app/api/auth/callback/route.ts`
```ts
// app/api/auth/callback/route.ts
import { NextResponse } from 'next/server'
import { supabaseRoute } from '@/lib/supabase/server'

export async function GET(req: Request) {
  const supabase = supabaseRoute()
  // Intercambia el code del querystring por sesión y setea cookies
  // auth-helpers admite pasar la URL completa en versiones recientes
  // Si tu versión requiere 'code', extrae con new URL(req.url).searchParams.get('code')
  await supabase.auth.exchangeCodeForSession(req.url as unknown as string)
  return NextResponse.redirect(new URL('/dashboard', process.env.NEXT_PUBLIC_APP_URL))
}
```


### app/dashboard/page.tsx + components/InvoiceTable.tsx
- Protegida: si no hay sesión, redirige a `/login`.
- Lista de facturas (id, cliente, fechas, estado, total) con filtros por fecha.
- Export CSV con los mismos filtros (vía ruta server export.csv).

`app/dashboard/page.tsx`
```tsx
// app/dashboard/page.tsx
import { requireSession } from '@/lib/auth'
import { supabaseServer } from '@/lib/supabase/server'
import Link from 'next/link'
import InvoiceTable from '@/components/InvoiceTable'

export default async function DashboardPage({ searchParams }: { searchParams: { from?: string, to?: string } }) {
  await requireSession()
  const supabase = supabaseServer()

  const from = searchParams.from || new Date(Date.now() - 1000*60*60*24*90).toISOString().slice(0,10)
  const to = searchParams.to || new Date().toISOString().slice(0,10)

  const { data: invoices, error } = await supabase
    .from('invoices')
    .select('id, customer_name, date_start, date_end, status, total, created_at')
    .gte('date_start', from)
    .lte('date_end', to)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  const exportUrl = `/api/invoices/export.csv?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`

  return (
    <main className="container">
      <div className="hstack" style={{ justifyContent: 'space-between', margin: '1rem 0' }}>
        <h1>Dashboard</h1>
        <div className="hstack" style={{ gap: '0.5rem' }}>
          <Link className="button" href="/upload">Subir factura</Link>
          <a className="button" href={exportUrl} download>Export CSV</a>
        </div>
      </div>

      <form className="hstack" role="search" aria-label="Filtrar por fechas" style={{ gap: '0.5rem', marginBottom: '1rem' }}>
        <label className="label" htmlFor="from">Desde</label>
        <input className="input" id="from" name="from" type="date" defaultValue={from} />
        <label className="label" htmlFor="to">Hasta</label>
        <input className="input" id="to" name="to" type="date" defaultValue={to} />
        <button className="button" type="submit">Filtrar</button>
      </form>

      <InvoiceTable invoices={invoices || []} />
    </main>
  )
}
```

`components/InvoiceTable.tsx`
```tsx
// components/InvoiceTable.tsx
'use client'
import Link from 'next/link'

type Row = {
  id: string
  customer_name: string | null
  date_start: string | null
  date_end: string | null
  status: string | null
  total: number | null
}

export default function InvoiceTable({ invoices }: { invoices: Row[] }) {
  return (
    <div className="card">
      <div className="table-responsive">
        <table className="table" role="table" aria-label="Listado de facturas">
          <thead>
            <tr>
              <th>ID</th>
              <th>Cliente</th>
              <th>Periodo</th>
              <th>Estado</th>
              <th style={{ textAlign: 'right' }}>Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <em>No hay facturas en el rango seleccionado.</em>
                </td>
              </tr>
            )}
            {invoices.map((r) => (
              <tr key={r.id}>
                <td><code>{r.id.slice(0, 8)}</code></td>
                <td>{r.customer_name || '—'}</td>
                <td>{fmtDate(r.date_start)} — {fmtDate(r.date_end)}</td>
                <td><span className={`badge badge-${badge(r.status)}`}>{r.status}</span></td>
                <td style={{ textAlign: 'right' }}>{fmtMoney(r.total)}</td>
                <td><Link className="button" href={`/invoices/${r.id}`}>Ver</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function fmtDate(d?: string | null) {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString() } catch { return d }
}
function fmtMoney(n?: number | null) {
  if (n == null) return '—'
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR' }).format(n)
}
function badge(status?: string | null) {
  switch ((status || '').toLowerCase()) {
    case 'queued':
    case 'pending': return 'warn'
    case 'processed':
    case 'done': return 'ok'
    case 'error': return 'error'
    default: return 'neutral'
  }
}
```


### app/invoices/[id]/page.tsx + components/JsonViewer.tsx
- Protegida; muestra normalizado + json_raw.
- Botones: “Descargar PDF” (ruta server de descarga) y “Reprocesar”.

`app/invoices/[id]/page.tsx`
```tsx
// app/invoices/[id]/page.tsx
import { requireSession } from '@/lib/auth'
import { supabaseServer } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'

import JsonViewer from '@/components/JsonViewer'

export default async function InvoiceDetail({ params }: { params: { id: string } }) {
  await requireSession()
  const supabase = supabaseServer()

  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', params.id)
    .single()

  if (error || !data) return notFound()

  const downloadHref = `/api/invoices/${params.id}/download`
  const reprocessHref = `/api/invoices/${params.id}/reprocess`

  return (
    <main className="container">
      <div className="hstack" style={{ justifyContent: 'space-between', margin: '1rem 0' }}>
        <h1>Factura {params.id.slice(0,8)}</h1>
        <div className="hstack" style={{ gap: '0.5rem' }}>
          <a className="button" href={downloadHref}>Descargar PDF</a>
          <form action={reprocessHref} method="post">
            <button className="button" type="submit">Reprocesar</button>
          </form>
        </div>
      </div>

      <section className="card" aria-labelledby="resumen">
        <h2 id="resumen">Resumen</h2>
        <dl className="grid">
          <div><dt>Cliente</dt><dd>{data.customer_name || '—'}</dd></div>
          <div><dt>Periodo</dt><dd>{fmt(data.date_start)} — {fmt(data.date_end)}</dd></div>
          <div><dt>Fecha emisión</dt><dd>{fmt(data.issue_date)}</dd></div>
          <div><dt>Estado</dt><dd><span className={`badge badge-${badge(data.status)}`}>{data.status}</span></dd></div>
          <div><dt>Total</dt><dd>{money(data.total)}</dd></div>
          <div><dt>CUPS</dt><dd>{data.cups || '—'}</dd></div>
          <div><dt>Tarifa/Peajes</dt><dd>{data.tariff || data.peajes || '—'}</dd></div>
          <div><dt>€/kWh</dt><dd>{data.eur_kwh ?? '—'}</dd></div>
          <div><dt>€/kW</dt><dd>{data.eur_kw ?? '—'}</dd></div>
        </dl>
      </section>

      <section className="card" aria-labelledby="raw">
        <h2 id="raw">json_raw</h2>
        <JsonViewer value={data.json_raw} />
      </section>
    </main>
  )
}

function fmt(d?: string | null) { return d ? new Date(d).toLocaleDateString() : '—' }
function money(n?: number | null) {
  if (n == null) return '—'
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR' }).format(n)
}
function badge(status?: string | null) {
  switch ((status || '').toLowerCase()) {
    case 'queued':
    case 'pending': return 'warn'
    case 'processed':
    case 'done': return 'ok'
    case 'error': return 'error'
    default: return 'neutral'
  }
}
```

`components/JsonViewer.tsx`
```tsx
// components/JsonViewer.tsx
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
```


### app/upload/page.tsx + components/UploadForm.tsx
- Protegida; formulario con validación local PDF ≤10MB + selección de cliente.
- Al enviar: `POST /api/upload` → enqueue en n8n → toast de éxito/error.

`app/upload/page.tsx`
```tsx
// app/upload/page.tsx
import { requireSession } from '@/lib/auth'
import UploadForm from '@/components/UploadForm'

export default async function UploadPage() {
  await requireSession()
  return (
    <main className="container">
      <div className="card" style={{ maxWidth: 640, margin: '2rem auto' }}>
        <h1>Subir factura (PDF)</h1>
        <UploadForm />
      </div>
    </main>
  )
}
```

`components/UploadForm.tsx`
```tsx
// components/UploadForm.tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Toaster, useToast } from './Toaster'

export default function UploadForm() {
  const [file, setFile] = useState<File | null>(null)
  const [customer, setCustomer] = useState('')
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()
  const router = useRouter()

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] || null
    if (!f) return setFile(null)
    if (f.type !== 'application/pdf') {
      toast('El archivo debe ser PDF', 'error'); e.currentTarget.value = ''; return
    }
    if (f.size > 10 * 1024 * 1024) {
      toast('Máximo 10MB', 'error'); e.currentTarget.value = ''; return
    }
    setFile(f)
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) return toast('Selecciona un PDF', 'error')
    if (!customer) return toast('Indica el cliente', 'error')
    setLoading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('customer_name', customer)
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      if (!res.ok) throw new Error(await res.text())
      toast('Encolado para procesamiento', 'success')
      setTimeout(() => router.push('/dashboard'), 600)
    } catch (err: any) {
      toast(err.message || 'Error al subir', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <form onSubmit={onSubmit} className="vstack" aria-label="Subida de factura">
        <label className="label" htmlFor="customer">Cliente</label>
        <input id="customer" name="customer" className="input" required value={customer} onChange={(e) => setCustomer(e.target.value)} />

        <label className="label" htmlFor="file">PDF (≤10MB)</label>
        <input id="file" name="file" className="input" type="file" accept="application/pdf" onChange={onFileChange} required />

        <button className="button" type="submit" disabled={loading} aria-busy={loading}>
          {loading ? 'Subiendo…' : 'Subir y procesar'}
        </button>
      </form>
      <Toaster />
    </>
  )
}
```

`components/Toaster.tsx` (opcional pero ligero)
```tsx
// components/Toaster.tsx
'use client'
import { createContext, useContext, useEffect, useRef, useState } from 'react'

type Kind = 'success' | 'error' | 'info'
const ToastCtx = createContext<{ toast: (m: string, kind?: Kind) => void }>({ toast: () => {} })

export function Toaster() {
  const [msg, setMsg] = useState<string>('')
  const [kind, setKind] = useState<Kind>('info')
  const timer = useRef<number | null>(null)

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current) }, [])

  return (
    <ToastCtx.Provider value={{ toast: (m, k = 'info') => {
      setKind(k); setMsg(m); if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setMsg(''), 3500)
    } }}>
      {msg && (
        <div role="status" className={`toast toast-${kind}`} aria-live="polite">{msg}</div>
      )}
    </ToastCtx.Provider>
  )
}

export function useToast() { return useContext(ToastCtx) }
```


## Rutas API (server)

### Subida y encolado: `app/api/upload/route.ts`
```ts
// app/api/upload/route.ts
import { NextResponse } from 'next/server'
import { supabaseRoute } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: Request) {
  const supabase = supabaseRoute()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const form = await req.formData()
  const file = form.get('file') as File | null
  const customer_name = String(form.get('customer_name') || '')
  if (!file) return NextResponse.json({ error: 'Missing file' }, { status: 400 })
  if (!customer_name) return NextResponse.json({ error: 'Missing customer_name' }, { status: 400 })
  if (file.type !== 'application/pdf') return NextResponse.json({ error: 'Invalid mime' }, { status: 400 })
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: 'Too large' }, { status: 400 })

  const invoiceId = crypto.randomUUID()
  const path = `${user.id}/${invoiceId}.pdf`

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const bucket = process.env.STORAGE_INVOICES_BUCKET || 'invoices'
  const n8n = process.env.N8N_WEBHOOK_URL_ENQUEUE

  const admin = createClient(url, serviceKey)

  const arrayBuffer = await file.arrayBuffer()
  const { error: upErr } = await admin.storage.from(bucket).upload(path, new Uint8Array(arrayBuffer), {
    contentType: 'application/pdf',
    upsert: false,
  })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  const { error: insErr } = await admin.from('invoices').insert({
    id: invoiceId,
    user_id: user.id,
    customer_name,
    storage_path: path,
    status: 'queued',
  })
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

  if (n8n) {
    try {
      await fetch(n8n, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ invoice_id: invoiceId, user_id: user.id, storage_path: path }),
      })
    } catch (e) {
      // No bloquear UI por fallo de webhook, queda 'queued' para reintento desde botón
    }
  }

  return NextResponse.json({ ok: true, id: invoiceId })
}
```

### Descarga firmada: `app/api/invoices/[id]/download/route.ts`
```ts
// app/api/invoices/[id]/download/route.ts
import { NextResponse } from 'next/server'
import { supabaseRoute } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = supabaseRoute()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', process.env.NEXT_PUBLIC_APP_URL))

  const { data, error } = await supabase
    .from('invoices')
    .select('storage_path, user_id')
    .eq('id', params.id)
    .single()
  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (data.user_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const bucket = process.env.STORAGE_INVOICES_BUCKET || 'invoices'
  const ttl = Number(process.env.STORAGE_SIGNED_URL_TTL_SECS || '120')

  const admin = createClient(url, serviceKey)
  const { data: signed, error: signErr } = await admin.storage.from(bucket).createSignedUrl(data.storage_path, ttl)
  if (signErr || !signed) return NextResponse.json({ error: signErr?.message || 'Sign error' }, { status: 500 })

  return NextResponse.redirect(signed.signedUrl)
}
```

### Reprocesar: `app/api/invoices/[id]/reprocess/route.ts`
```ts
// app/api/invoices/[id]/reprocess/route.ts
import { NextResponse } from 'next/server'
import { supabaseRoute } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = supabaseRoute()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('invoices')
    .select('storage_path, user_id')
    .eq('id', params.id)
    .single()
  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (data.user_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const admin = createClient(url, serviceKey)
  await admin.from('invoices').update({ status: 'queued' }).eq('id', params.id)

  const n8n = process.env.N8N_WEBHOOK_URL_ENQUEUE
  if (n8n) {
    try {
      await fetch(n8n, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ invoice_id: params.id, user_id: user.id, storage_path: data.storage_path, retry: true }) })
    } catch {}
  }

  return NextResponse.redirect(new URL(`/invoices/${params.id}`, process.env.NEXT_PUBLIC_APP_URL))
}
```

### Export CSV: `app/api/invoices/export.csv/route.ts`
```ts
// app/api/invoices/export.csv/route.ts
import { NextResponse } from 'next/server'
import { supabaseRoute } from '@/lib/supabase/server'

export async function GET(req: Request) {
  const supabase = supabaseRoute()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from') || '1900-01-01'
  const to = searchParams.get('to') || '2999-12-31'

  const { data, error } = await supabase
    .from('invoices')
    .select('id, customer_name, date_start, date_end, status, total')
    .gte('date_start', from)
    .lte('date_end', to)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = data || []
  const header = ['id','customer','date_start','date_end','status','total']
  const csv = [header.join(','), ...rows.map(r => [r.id, q(r.customer_name), r.date_start, r.date_end, r.status, r.total ?? ''].join(','))].join('\n')

  return new NextResponse(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="invoices_${from}_${to}.csv"`,
    }
  })
}

function q(v: any) { if (v == null) return ''; const s = String(v).replaceAll('\"','\"\"'); return `\"${s}\"` }
```


## Accesibilidad y estilos
- Inputs y botones con `aria-label`, `aria-busy`, `role="status"` en toasts.
- Contrastes y tamaños coherentes con `styles.css`.
- Tablas con `role="table"` y `th`/`td` adecuados.


## README (operativa y despliegue)

### Desarrollo local
```bash
# 1) Variables de entorno
cp .env.example .env.local
# Rellena NEXT_PUBLIC_SUPABASE_URL / ANON_KEY / SERVICE_ROLE_KEY y URLs

# 2) Instalar deps
pnpm install

# 3) Lanzar dev server
pnpm dev
```

- Crear bucket privado en Supabase Storage: nombre `invoices`.
- Asegurar RLS en tabla `invoices` con políticas para que cada usuario solo vea sus filas.
- Opcional: índice por `user_id, date_start, date_end`.

Ejemplo (orientativo) de RLS (ajusta a tu schema):
```sql
alter table public.invoices enable row level security;
create policy "own rows" on public.invoices for select using ( auth.uid() = user_id );
create policy "own rows insert" on public.invoices for insert with check ( auth.uid() = user_id );
create policy "own rows update" on public.invoices for update using ( auth.uid() = user_id );
```

### Despliegue (Vercel)
- Setear envs en Vercel: todas las de `.env.example`.
- Domains: `NEXT_PUBLIC_APP_URL=https://TU_APP.vercel.app`.
- Revisar que las rutas API y callbacks estén permitidos en Supabase Auth (Redirect URLs).


## Pruebas rápidas (curl/comandos)

1) Login Magic Link
- Probar flujo manual: introducir email en `/login` y completar desde correo.

2) Subida → Encolado → Toast
```bash
# Necesita JWT de usuario (p. ej., desde supabase dashboard o devTools tras login)
USER_JWT=JWT_USUARIO
curl -i -X POST \
  -H "Authorization: Bearer $USER_JWT" \
  -F "customer_name=ACME" \
  -F "file=@/ruta/a/factura.pdf;type=application/pdf" \
  https://APP_DOMAIN/api/upload
```
- Esperado: `200 { ok: true, id: "..." }` y en UI toast “Encolado…”.

3) Dashboard y filtros
```bash
open https://APP_DOMAIN/dashboard?from=2024-01-01&to=2024-12-31
```
- Esperado: tabla con resultados en el rango, botón Export CSV.

4) Export CSV
```bash
curl -L -H "Authorization: Bearer $USER_JWT" \
  "https://APP_DOMAIN/api/invoices/export.csv?from=2024-01-01&to=2024-12-31" -o invoices.csv
```
- Esperado: fichero CSV con columnas: id, customer, date_start, date_end, status, total.

5) Detalle y descarga
```bash
open https://APP_DOMAIN/invoices/INVOICE_ID
curl -I -H "Authorization: Bearer $USER_JWT" https://APP_DOMAIN/api/invoices/INVOICE_ID/download
```
- Esperado: 307 redirect a URL firmada (expira ~120s). UI muestra normalizado + json_raw y botones.

6) Reprocesar
```bash
curl -i -X POST -H "Authorization: Bearer $USER_JWT" \
  https://APP_DOMAIN/api/invoices/INVOICE_ID/reprocess
```
- Esperado: 307 → `/invoices/INVOICE_ID`, estado cambiado a `queued`, n8n invocado.


## Validaciones contra criterios de aceptación
- Redirección sin sesión: `requireSession()` en `/dashboard`, `/invoices/[id]`, `/upload` redirige a `/login`.
- Subida en `/upload`: valida PDF ≤10MB; encola procesamiento vía `/api/upload`; muestra toast de éxito/error.
- `/dashboard`: lista (id, cliente, fechas, estado, total) y filtra por fecha con `searchParams`; botón `Export CSV`.
- `/invoices/[id]`: muestra campos normalizados + `json_raw`; botón “Descargar PDF” con URL firmada; botón “Reprocesar”.


## Notas y riesgos
- Ajustar la firma `exchangeCodeForSession` según versión de `@supabase/auth-helpers-nextjs` instalada.
- Si se evita SERVICE_ROLE para Storage, crear políticas Storage precisas para escritura solo en `user_id/…` y usar cliente con sesión en server; en MVP se usa service role en server routes para simplicidad (sin exponer al cliente).
- `styles.css`: asegurar clases mencionadas o adaptar nombres.
- `customers`: si existe tabla, cambiar `customer_name` por selector `customer_id` y hacer join/foreign key.


## Checklist de entrega
- [ ] Páginas y componentes listos para pegar (snippets aquí).  
- [ ] Rutas API server para upload/download/reprocess/export.  
- [ ] .env.example incluido.  
- [ ] Pruebas rápidas curl/comandos.  
- [ ] Validación contra criterios de aceptación.

*** Fin del plan ***
