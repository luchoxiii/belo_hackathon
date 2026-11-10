import type { Metadata, Viewport } from 'next'
import { DM_Sans, Fraunces } from 'next/font/google'
import { PrimeProvider } from '@/components/providers/primereact-provider'
import './globals.css'

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  weight: ['400', '500', '600', '700']
})

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-heading',
  weight: ['500', '600', '700'],
})

export const metadata: Metadata = {
  title: 'Ruculapp — Tu asistente financiero inteligente',
  description:
    'Controlá tus gastos, proyectá tu futuro financiero y tomá mejores decisiones con IA. Análisis mensual, IPC integrado y alertas de renovaciones.',
}

export const viewport: Viewport = {
  themeColor: '#FDF8F3',
  colorScheme: 'light',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR" className={`${dmSans.variable} ${fraunces.variable}`}>
      <body className="font-sans antialiased">
        <PrimeProvider>
          {children}
        </PrimeProvider>
      </body>
    </html>
  )
}
