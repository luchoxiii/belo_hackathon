'use client'

import { PrimeReactProvider } from '@primereact/core'
import Aura from '@primeuix/themes/aura'

// PrimeIcons
import 'primeicons/primeicons.css'

export function PrimeProvider({ children }: { children: React.ReactNode }) {
  return (
    <PrimeReactProvider
      theme={{
        preset: Aura,
        options: {
          darkModeSelector: '.dark',
        },
      }}
    >
      {children}
    </PrimeReactProvider>
  )
}
