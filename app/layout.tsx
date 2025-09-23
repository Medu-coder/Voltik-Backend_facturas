import '@/styles.css'
import type { ReactNode } from 'react'
import { ToasterProvider } from '@/components/Toaster'

export const metadata = {
  title: 'Voltik · Facturas',
  description: 'MVP de ingesta y consulta de facturas',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>
        <ToasterProvider>
          {children}
        </ToasterProvider>
      </body>
    </html>
  )}
