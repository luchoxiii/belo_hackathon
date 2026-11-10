'use client'

import { createContext, useContext, useState } from 'react'
import { Chat } from '@ai-sdk/react'
import { DefaultChatTransport, type UIMessage } from 'ai'
import { getFinanceState } from '@/lib/finance-store'

const ChatContext = createContext<Chat<UIMessage> | null>(null)

/**
 * La instancia de Chat vive en el layout para que la conversación
 * sobreviva a la navegación entre pantallas.
 */
export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [chat] = useState(
    () =>
      new Chat<UIMessage>({
        transport: new DefaultChatTransport({
          api: '/api/chat',
          body: () => {
            const { events, settings } = getFinanceState()
            return { events, settings }
          },
        }),
      }),
  )

  return <ChatContext.Provider value={chat}>{children}</ChatContext.Provider>
}

export function useChatInstance() {
  const chat = useContext(ChatContext)
  if (!chat) throw new Error('useChatInstance debe usarse dentro de ChatProvider')
  return chat
}
