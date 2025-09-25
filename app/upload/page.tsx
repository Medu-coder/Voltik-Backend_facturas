import Link from 'next/link'
import { requireAdmin } from '@/lib/auth'
import UploadForm from '@/components/UploadForm'
import AppShell from '@/components/AppShell'

export default async function UploadPage() {
  await requireAdmin()
  return (
    <AppShell active="invoices">
      <section className="page-header">
        <div>
          <h1>Subir factura</h1>
          <p className="muted">Procesa un nuevo PDF para incorporarlo al sistema.</p>
        </div>
        <Link className="btn btn-secondary" href="/invoices">Volver a facturas</Link>
      </section>

      <section className="card card-narrow" aria-labelledby="upload-form">
        <h2 id="upload-form">Formulario</h2>
        <UploadForm />
      </section>
    </AppShell>
  )
}
