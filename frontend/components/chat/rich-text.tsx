import { Fragment } from 'react'

function inline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((chunk, i) =>
    chunk.startsWith('**') && chunk.endsWith('**') && chunk.length > 4 ? (
      <strong key={i} className="font-semibold text-foreground">
        {chunk.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={i}>{chunk}</Fragment>
    ),
  )
}

type Block = { kind: 'p'; text: string } | { kind: 'ul'; items: string[] }

function parse(text: string): Block[] {
  const blocks: Block[] = []
  for (const line of text.split('\n')) {
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/)
    const last = blocks[blocks.length - 1]
    if (bullet) {
      if (last?.kind === 'ul') last.items.push(bullet[1])
      else blocks.push({ kind: 'ul', items: [bullet[1]] })
    } else if (line.trim()) {
      blocks.push({ kind: 'p', text: line.replace(/^#+\s*/, '') })
    }
  }
  return blocks
}

export function RichText({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-3 text-sm leading-relaxed text-foreground/90">
      {parse(text).map((block, i) =>
        block.kind === 'p' ? (
          <p key={i} className="text-pretty">
            {inline(block.text)}
          </p>
        ) : (
          <ul key={i} className="flex flex-col gap-1.5 pl-1">
            {block.items.map((item, j) => (
              <li key={j} className="flex gap-2.5">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                <span className="text-pretty">{inline(item)}</span>
              </li>
            ))}
          </ul>
        ),
      )}
    </div>
  )
}
