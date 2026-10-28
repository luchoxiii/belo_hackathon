import { AppShell } from '@/components/app-shell'
import { ChatProvider } from '@/components/chat/chat-provider'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ChatProvider>
      <AppShell>{children}</AppShell>
    </ChatProvider>
  )
}
