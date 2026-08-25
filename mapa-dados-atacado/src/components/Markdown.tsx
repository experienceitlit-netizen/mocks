// Renderizador de markdown mínimo, próprio, sem dependências (decisão: não
// instalar lib de markdown). Cobre o que as observações do catálogo usam:
// parágrafos, listas com "-", títulos "#", **negrito**, `código` e wikilinks
// [[Alvo]] / [[Alvo|rotulo-da-aresta]] como spans clicáveis que navegam o
// grafo. O resto é exibido como texto puro.
import type { ReactNode } from 'react'

interface MarkdownProps {
  text: string
  /** Resolve o alvo de um wikilink (nome ou id) para o id do nó, ou null. */
  resolveWikiLink(target: string): string | null
  onNavigate(id: string): void
}

const INLINE_RE = /\[\[([^\]]+)\]\]|\*\*([^*]+)\*\*|`([^`]+)`/g

function renderInline(
  text: string,
  keyPrefix: string,
  resolveWikiLink: MarkdownProps['resolveWikiLink'],
  onNavigate: MarkdownProps['onNavigate'],
): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let i = 0
  for (const m of text.matchAll(INLINE_RE)) {
    const idx = m.index
    if (idx > last) out.push(text.slice(last, idx))
    const key = `${keyPrefix}-${i++}`
    if (m[1] !== undefined) {
      // [[Alvo]] ou [[Alvo|rotulo]] — o rotulo é da aresta, exibimos o alvo.
      const target = m[1].split('|')[0].trim()
      const id = resolveWikiLink(target)
      out.push(
        id ? (
          <button key={key} type="button" className="wikilink" onClick={() => onNavigate(id)}>
            {target}
          </button>
        ) : (
          <span key={key} className="wikilink wikilink--broken" title="Nó não encontrado no catálogo">
            {target}
          </span>
        ),
      )
    } else if (m[2] !== undefined) {
      out.push(<strong key={key}>{m[2]}</strong>)
    } else if (m[3] !== undefined) {
      out.push(<code key={key}>{m[3]}</code>)
    }
    last = idx + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

export default function Markdown({ text, resolveWikiLink, onNavigate }: MarkdownProps) {
  const blocks = text
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0)

  return (
    <div className="markdown">
      {blocks.map((block, bi) => {
        const lines = block.split('\n').map((l) => l.trim())
        if (lines.every((l) => /^[-*] /.test(l))) {
          return (
            <ul key={bi}>
              {lines.map((l, li) => (
                <li key={li}>
                  {renderInline(l.replace(/^[-*] /, ''), `${bi}-${li}`, resolveWikiLink, onNavigate)}
                </li>
              ))}
            </ul>
          )
        }
        const heading = /^(#{1,6}) (.*)$/.exec(lines[0])
        if (heading && lines.length === 1) {
          return <h4 key={bi}>{renderInline(heading[2], `${bi}`, resolveWikiLink, onNavigate)}</h4>
        }
        return <p key={bi}>{renderInline(lines.join(' '), `${bi}`, resolveWikiLink, onNavigate)}</p>
      })}
    </div>
  )
}
