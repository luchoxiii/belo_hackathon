import type { UIMessage } from 'ai'
import { RichText } from './rich-text'
import { ToolPart } from './tool-part'

export function ChatMessage({ message }: { message: UIMessage }) {
  if (message.role === 'user') {
    const text = message.parts.map((p) => (p.type === 'text' ? p.text : '')).join('')
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm leading-relaxed text-primary-foreground">
          {text}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {message.parts.map((part, i) => {
        if (part.type === 'text') {
          return part.text ? <RichText key={i} text={part.text} /> : null
        }
        if (part.type.startsWith('tool-')) {
          return <ToolPart key={i} part={part} />
        }
        return null
      })}
    </div>
  )
}
