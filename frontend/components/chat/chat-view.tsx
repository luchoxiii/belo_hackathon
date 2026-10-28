'use client'

import { useEffect, useRef, useState } from 'react'
import { useChat } from '@ai-sdk/react'
import { ArrowUp, Mountain, RotateCcw, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useChatInstance } from './chat-provider'
import { ChatMessage } from './chat-message'

const SUGGESTIONS = [
  '¿Me puedo ir de vacaciones en marzo del año que viene?',
  '¿Cómo voy a estar de plata en 6 meses?',
  '¿Cuál es el mes más ajustado de mi año?',
  '¿Puedo gastar $800.000 en una notebook en enero?',
]

// Contextual quick replies based on what the AI is asking
const AMOUNT_REPLIES = [
  { label: '$300.000', value: '$300.000' },
  { label: '$500.000', value: '$500.000' },
  { label: '$1.000.000', value: '$1.000.000' },
  { label: '$2.000.000', value: '$2.000.000' },
]

const MONTH_REPLIES = [
  { label: 'Enero', value: 'enero' },
  { label: 'Marzo', value: 'marzo' },
  { label: 'Junio', value: 'junio' },
  { label: 'Diciembre', value: 'diciembre' },
]

const FOLLOW_UP_REPLIES = [
  { label: '¿Qué pasa si gasto menos?', value: '¿Qué pasa si gasto menos?' },
  { label: '¿Cuánto podría gastar máximo?', value: '¿Cuánto podría gastar como máximo?' },
  { label: '¿En qué otro mes me conviene?', value: '¿En qué otro mes me convendría hacerlo?' },
  { label: 'Dame consejos de ahorro', value: 'Dame consejos para ahorrar y llegar mejor' },
]

function detectQuickReplies(lastMessage: string | undefined): { label: string; value: string }[] | null {
  if (!lastMessage) return null
  const lower = lastMessage.toLowerCase()

  // If asking for amount
  if (lower.includes('cuánto') && (lower.includes('gastar') || lower.includes('presupuesto') || lower.includes('monto'))) {
    return AMOUNT_REPLIES
  }

  // If asking for month
  if (lower.includes('qué mes') || lower.includes('cuándo') || lower.includes('en qué fecha')) {
    return MONTH_REPLIES
  }

  // If just gave an evaluation result (contains verdict words)
  if (lower.includes('sí, podés') || lower.includes('no, no llegás') || lower.includes('justo') || lower.includes('proyección')) {
    return FOLLOW_UP_REPLIES
  }

  return null
}

export function ChatView() {
  const chat = useChatInstance()
  const { messages, sendMessage, status, stop, error, regenerate } = useChat({ chat })
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  const busy = status === 'submitted' || status === 'streaming'

  // Get the last assistant message text for quick replies
  const lastAssistantMessage = messages
    .filter(m => m.role === 'assistant')
    .pop()
  const lastAssistantText = lastAssistantMessage?.parts
    ?.filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    ?.map(p => p.text)
    ?.join(' ')

  const quickReplies = !busy ? detectQuickReplies(lastAssistantText) : null

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, status])

  function submit(text: string) {
    const trimmed = text.trim()
    if (!trimmed || busy) return
    sendMessage({ text: trimmed })
    setInput('')
  }

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6" aria-live="polite" aria-atomic="false">
          {messages.length === 0 ? (
            <EmptyState onPick={submit} />
          ) : (
            messages.map((message) => <ChatMessage key={message.id} message={message} />)
          )}

          {status === 'submitted' && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <span className="flex gap-1" aria-hidden="true">
                <span className="size-1.5 animate-bounce rounded-full bg-primary [animation-delay:-0.3s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-primary [animation-delay:-0.15s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-primary" />
              </span>
              el asistente está pensando
            </div>
          )}

          {/* Quick reply buttons */}
          {quickReplies && quickReplies.length > 0 && (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Respuestas rápidas sugeridas">
              {quickReplies.map((reply) => (
                <button
                  key={reply.value}
                  type="button"
                  onClick={() => submit(reply.value)}
                  className="rounded-full border border-primary/40 bg-primary/5 px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/15 hover:border-primary"
                >
                  {reply.label}
                </button>
              ))}
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="flex items-center justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm"
            >
              <span>Algo salió mal al consultar a el asistente.</span>
              <Button variant="outline" size="sm" onClick={() => regenerate()}>
                <RotateCcw className="size-3.5" aria-hidden="true" />
                Reintentar
              </Button>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit(input)
        }}
        className="shrink-0 border-t border-border bg-background px-4 py-3"
      >
        <div className="mx-auto flex w-full max-w-2xl items-end gap-2 rounded-2xl border border-input bg-card p-2 focus-within:border-primary focus-within:ring-3 focus-within:ring-ring/30">
          <label htmlFor="chat-input" className="sr-only">
            Preguntale algo a el asistente
          </label>
          <span id="chat-input-hint" className="sr-only">
            Presioná Enter para enviar, Shift+Enter para nueva línea
          </span>
          <textarea
            id="chat-input"
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (
                e.key === 'Enter' &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing &&
                e.keyCode !== 229
              ) {
                e.preventDefault()
                submit(input)
              }
            }}
            placeholder="Preguntale a el asistente sobre tu plata…"
            aria-describedby="chat-input-hint"
            className="max-h-32 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-base leading-relaxed outline-none placeholder:text-muted-foreground md:text-sm"
          />
          {busy ? (
            <Button type="button" size="icon" variant="secondary" onClick={() => stop()} aria-label="Detener generación">
              <Square className="size-4" aria-hidden="true" />
            </Button>
          ) : (
            <Button type="submit" size="icon" disabled={!input.trim()} aria-label="Enviar mensaje">
              <ArrowUp className="size-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      </form>
    </div>
  )
}

function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="flex flex-col items-center gap-8 pt-8 text-center md:pt-16">
      <div className="flex flex-col items-center gap-4">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground" aria-hidden="true">
          <Mountain className="size-7" />
        </span>
        <div className="flex flex-col gap-2">
          <h1 className="text-balance text-2xl font-semibold md:text-3xl">¿Qué querés saber de tu plata?</h1>
          <p className="max-w-sm text-pretty text-sm leading-relaxed text-muted-foreground">
            el asistente proyecta tu saldo con tus ingresos, gastos y la inflación para decirte si llegás.
          </p>
        </div>
      </div>
      <nav aria-label="Preguntas sugeridas">
        <ul className="flex w-full flex-col gap-2">
          {SUGGESTIONS.map((text) => (
            <li key={text}>
              <button
                type="button"
                onClick={() => onPick(text)}
                className="w-full rounded-xl border border-border bg-card px-4 py-3 text-left text-sm leading-relaxed transition-colors hover:border-primary hover:bg-primary/10 focus:border-primary focus:ring-2 focus:ring-ring"
              >
                {text}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
