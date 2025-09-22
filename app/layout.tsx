export const metadata = {
  title: 'Backend API',
  description: 'Voltik invoices backend API',
}

export default function RootLayout(props: any) {
  return (
    <html lang="es">
      <body>
        {props.children}
      </body>
    </html>
  )
}

