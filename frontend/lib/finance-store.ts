'use client'

import { useSyncExternalStore } from 'react'
import {
  DEFAULT_SETTINGS,
  financialEventSchema,
  settingsSchema,
  type FinancialEvent,
  type Settings,
} from './types'
import { buildDemoEvents } from './demo'

type State = { events: FinancialEvent[]; settings: Settings }

const STORAGE_KEY = 'belo-finance:v1'
const EMPTY_STATE: State = { events: [], settings: DEFAULT_SETTINGS }

let state: State = EMPTY_STATE
let loaded = false
const listeners = new Set<() => void>()

function load() {
  if (loaded || typeof window === 'undefined') return
  loaded = true
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw)
    const events = Array.isArray(parsed?.events)
      ? parsed.events.flatMap((e: unknown) => {
          const result = financialEventSchema.safeParse(e)
          return result.success ? [result.data] : []
        })
      : []
    const settings = settingsSchema.safeParse(parsed?.settings)
    state = { events, settings: settings.success ? settings.data : DEFAULT_SETTINGS }
  } catch {
    state = EMPTY_STATE
  }
}

function commit(next: State) {
  state = next
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Almacenamiento lleno o bloqueado: el estado sigue vivo en memoria.
  }
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY) return
    loaded = false
    load()
    listener()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

export function getFinanceState() {
  load()
  return state
}

const getServerState = () => EMPTY_STATE
const subscribeHydration = () => () => {}

export const financeActions = {
  addEvent(event: Omit<FinancialEvent, 'id'>) {
    const next = { ...event, id: crypto.randomUUID() }
    commit({ ...getFinanceState(), events: [...getFinanceState().events, next] })
  },
  updateEvent(event: FinancialEvent) {
    const current = getFinanceState()
    commit({ ...current, events: current.events.map((e) => (e.id === event.id ? event : e)) })
  },
  removeEvent(id: string) {
    const current = getFinanceState()
    commit({ ...current, events: current.events.filter((e) => e.id !== id) })
  },
  updateSettings(settings: Settings) {
    commit({ ...getFinanceState(), settings })
  },
  loadDemo() {
    const current = getFinanceState()
    commit({ ...current, events: [...current.events, ...buildDemoEvents()] })
  },
  clearEvents() {
    commit({ ...getFinanceState(), events: [] })
  },
  resetAll() {
    commit(EMPTY_STATE)
  },
}

export function useFinance() {
  const { events, settings } = useSyncExternalStore(subscribe, getFinanceState, getServerState)
  const hydrated = useSyncExternalStore(
    subscribeHydration,
    () => true,
    () => false,
  )
  return { events, settings, hydrated, ...financeActions }
}
