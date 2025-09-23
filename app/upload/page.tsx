import { requireAdmin } from '@/lib/auth'
import UploadForm from '@/components/UploadForm'

export default async function UploadPage() {
  await requireAdmin()
  return (
    <main className="container">
      <div className="card" style={{ maxWidth: 640, margin: '2rem auto' }}>
        <h1>Subir factura (PDF)</h1>
        <UploadForm />
      </div>
    </main>
  )
}
