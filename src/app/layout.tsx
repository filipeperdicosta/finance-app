import type { Metadata, Viewport } from 'next'
import { Fraunces, Hanken_Grotesk, JetBrains_Mono } from 'next/font/google'
import './globals.css'

// Fraunces: wordmark + números grandes do Hero (itálico, com carácter).
// Hanken Grotesk: corpo/UI, substitui a stack de sistema em toda a app.
// JetBrains Mono: valores tabulares (montantes, listas) — já era mono antes,
// só ganha uma face com mais personalidade.
const fraunces = Fraunces({ subsets: ['latin'], style: ['italic', 'normal'], weight: ['500', '600'], variable: '--font-display', display: 'swap' })
const hanken = Hanken_Grotesk({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-body', display: 'swap' })
const jbMono = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '500', '700'], variable: '--font-mono', display: 'swap' })

export const metadata: Metadata = {
  title: 'Bio',
  description: 'Balance It Out — controla as tuas finanças',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Bio',
  },
}

export const viewport: Viewport = {
  themeColor: '#14110F',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt">
      <body className={`${fraunces.variable} ${hanken.variable} ${jbMono.variable}`} style={{ margin: 0, padding: 0, background: '#14110F' }}>
        {children}
      </body>
    </html>
  )
}
