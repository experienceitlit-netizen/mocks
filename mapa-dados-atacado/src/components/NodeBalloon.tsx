// Balão de detalhe ancorado no nó selecionado. Um único layout para TODO
// componente: chips (domínio, nível, tipo de componente, débito, produto de
// dados quando a linha o declara), campos de
// governança, corpo markdown, árvore de linhagem e listas de relações — não há
// variação por categoria de nó, porque não há categorias.
// A ancoragem segue o nó a cada frame (pan/zoom/física) via getAnchor().
import { useCallback, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import type { GraphNodeData } from './graph-types'
import { debitoDe, ehProdutoDeDados, linkLabel, tipoComponenteDe } from './graph-types'
import type { LineageEntry } from './lineage'
import { DEBITO_LABEL, domainColor, produtoChipColor } from './palette'
import { LOSANGO_PONTOS, LOSANGO_S } from './shapes'
import Markdown from './Markdown'

export interface Connection {
  node: GraphNodeData
  label: string
}

/** Posição do nó em coordenadas de tela + raio visual em px. */
export interface BalloonAnchor {
  x: number
  y: number
  r: number
}

interface NodeBalloonProps {
  node: GraphNodeData
  /** Arestas de saída (este componente consome / se associa ao alvo). */
  outgoing: Connection[]
  /** Arestas de entrada (quem consome ou cita este componente). */
  incoming: Connection[]
  /** Árvore de linhagem montante; null quando o nó não está no grafo. */
  lineage: LineageEntry | null
  /** O nó já é o centro do modo foco (esconde o botão Focar). */
  isFocused: boolean
  /** Título do nível pelo slug (chip do nível). */
  nivelTituloDe(slug: string): string
  resolveWikiLink(target: string): string | null
  onNavigate(id: string): void
  /** Entra em modo foco neste nó (ou re-foca, se já em foco). */
  onFocus(id: string): void
  /** Abre o formulário de edição/cadastro do catálogo. Só vem definido no modo
   *  edição (dev server com /api/catalogo). */
  onEdit?: () => void
  /** Confirmação pendente sobre este nó (exclusão pelo teclado): entra no topo
   *  do corpo, antes dos detalhes, para ser lida sem rolar. */
  confirmacao?: ReactNode
  onClose(): void
  /** Âncora em coordenadas de tela; null se o nó não está no grafo atual. */
  getAnchor(): BalloonAnchor | null
}

function Missing() {
  return <span className="missing">⚠ a definir</span>
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field">
      <span className="field__label">{label}</span>
      <span className="field__value">{children}</span>
    </div>
  )
}

function ConnectionList({
  title,
  items,
  onNavigate,
}: {
  title: string
  items: Connection[]
  onNavigate(id: string): void
}) {
  if (items.length === 0) return null
  return (
    <section className="connections">
      <h3>{title}</h3>
      <ul>
        {items.map(({ node }) => (
          <li key={node.id}>
            <button type="button" className="wikilink" onClick={() => onNavigate(node.id)}>
              {node.nome}
            </button>
            {node.fantasma === true && <span className="edge-label">fantasma</span>}
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Ramo recursivo da linhagem: o componente e tudo de que ele depende. O
 *  rótulo da aresta só aparece quando não é o consumo padrão. */
function LineageBranch({
  entry,
  papel,
  isRoot = false,
  onNavigate,
}: {
  entry: LineageEntry
  papel?: string
  isRoot?: boolean
  onNavigate(id: string): void
}) {
  return (
    <li className="lineage__row">
      {papel !== undefined && <span className="lineage__papel">{papel}</span>}
      {isRoot ? (
        <span className="lineage__self">{entry.data.nome}</span>
      ) : (
        <button type="button" className="wikilink" onClick={() => onNavigate(entry.data.id)}>
          {entry.data.nome}
        </button>
      )}
      {entry.upstream.length > 0 && (
        <ul className="lineage__children">
          {entry.upstream.map(({ label, entry: filho }, i) => (
            <LineageBranch
              key={`${filho.data.id}-${i}`}
              entry={filho}
              papel={label === 'consome' ? undefined : label}
              onNavigate={onNavigate}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

type BalloonContentProps = Omit<NodeBalloonProps, 'onClose' | 'getAnchor'>

/** Corpo do balão — o mesmo para qualquer componente. */
function BalloonContent({
  node,
  outgoing,
  incoming,
  lineage,
  isFocused,
  nivelTituloDe,
  resolveWikiLink,
  onNavigate,
  onFocus,
  onEdit,
}: BalloonContentProps) {
  const debito = debitoDe(node)
  const nivel = node.nivel ?? ''
  // As duas relações de saída têm listas próprias: consumo de dado e
  // associação declarada apontam para coisas diferentes.
  const consome = outgoing.filter((c) => linkLabel({ label: c.label }) === 'consome')
  const associacoes = outgoing.filter((c) => linkLabel({ label: c.label }) === 'vem de')

  return (
    <>
      <header className="node-balloon__header">
        <h2>{node.nome}</h2>
        <div className="chips">
          {nivel !== '' && <span className="chip chip--nivel">{nivelTituloDe(nivel)}</span>}
          <span className="chip chip--neutral">{tipoComponenteDe(node)}</span>
          {node.dominio && (
            <span
              className="chip"
              style={{ borderColor: domainColor(node.dominio), color: domainColor(node.dominio) }}
            >
              {node.dominio}
            </span>
          )}
          {node.fantasma !== true && (
            <span className={`chip chip--debito-${debito}`}>Débito: {DEBITO_LABEL[debito]}</span>
          )}
          {/* Só quando é: um chip "não é produto de dados" em toda linha comum
              poluiria o cabeçalho. O chip repete em palavras a marca que o nó
              tem no mapa, e traz o próprio losango junto — é a forma que o
              leitor precisa reconhecer lá.
              O texto do chip fica no peso normal de propósito: o negrito é o
              canal que distingue um nó dos OUTROS no mapa, e aqui já não há
              outros — o balão é de um nó só, e o chip já nomeia a bandeira. */}
          {ehProdutoDeDados(node) && (
            <span
              className="chip"
              style={{ borderColor: produtoChipColor(node), color: produtoChipColor(node) }}
            >
              <svg
                className="chip__losango"
                viewBox={`${-LOSANGO_S} ${-LOSANGO_S} ${2 * LOSANGO_S} ${2 * LOSANGO_S}`}
                aria-hidden="true"
              >
                <polygon
                  points={LOSANGO_PONTOS.map(([x, y]) => `${x},${y}`).join(' ')}
                  fill="currentColor"
                />
              </svg>
              Produto de dados
            </span>
          )}
        </div>
      </header>

      {(!isFocused || onEdit) && (
        <div className="node-balloon__actions">
          {!isFocused && (
            <button type="button" className="node-balloon__focus" onClick={() => onFocus(node.id)}>
              ⌖ Focar neste nó
            </button>
          )}
          {onEdit && (
            <button type="button" className="node-balloon__edit" onClick={onEdit}>
              ✎ Editar
            </button>
          )}
        </div>
      )}

      {node.fantasma === true ? (
        <p className="ghost-note">
          Nó fantasma: é citado por outro componente, mas ainda não tem linha no catálogo.
        </p>
      ) : (
        <>
          {node.descricao && <p className="node-balloon__descricao">{node.descricao}</p>}

          <div className="fields">
            {node.status && <Field label="Status">{node.status}</Field>}
            <Field label="Owner">{node.owner ? node.owner : <Missing />}</Field>
            <Field label="Centro de custo">
              {node.centroDeCusto ? node.centroDeCusto : <Missing />}
            </Field>
          </div>

          {node.corpo && (
            <Markdown text={node.corpo} resolveWikiLink={resolveWikiLink} onNavigate={onNavigate} />
          )}
        </>
      )}

      {lineage && lineage.upstream.length > 0 && (
        <section className="connections lineage">
          <h3>Linhagem</h3>
          <ul className="lineage__tree">
            <LineageBranch entry={lineage} isRoot onNavigate={onNavigate} />
          </ul>
        </section>
      )}

      <ConnectionList title="Consome →" items={consome} onNavigate={onNavigate} />
      <ConnectionList title="Associações →" items={associacoes} onNavigate={onNavigate} />
      <ConnectionList title="← Consumido por" items={incoming} onNavigate={onNavigate} />
      {outgoing.length === 0 && incoming.length === 0 && (
        <p className="ghost-note">Sem conexões mapeadas.</p>
      )}
    </>
  )
}

/** Distância entre a borda do nó e o balão (comprimento visível da seta). */
const GAP = 12
/** Margem mínima até as bordas da viewport. */
const MARGIN = 10
/** Limite superior: o balão fica abaixo do topbar. */
const TOP_MIN = 58
/** A ponta da seta nunca encosta nos cantos arredondados do balão. */
const ARROW_INSET = 18

type Side = 'right' | 'left' | 'below' | 'above' | 'free'

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max)
}

export default function NodeBalloon(props: NodeBalloonProps) {
  const { onClose, getAnchor, node, confirmacao } = props
  const boxRef = useRef<HTMLElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const arrowRef = useRef<HTMLSpanElement>(null)

  // Posiciona o balão colado ao nó, com FLIP de lado para caber na viewport.
  // Escreve estilos direto no DOM (sem setState) para seguir pan/zoom/física
  // a cada frame sem re-renderizar o React.
  const place = useCallback(() => {
    const el = boxRef.current
    const arrow = arrowRef.current
    if (!el || !arrow) return
    const vw = window.innerWidth
    const vh = window.innerHeight
    const w = el.offsetWidth
    const h = el.offsetHeight
    const a = getAnchor()
    let side: Side
    let left: number
    let top: number
    if (!a) {
      // Nó fora do grafo atual (ex.: relação clicada na vista de linhagem que
      // não pertence à cadeia exibida): cartão fixo à direita, sem seta.
      side = 'free'
      left = Math.max(MARGIN, vw - w - MARGIN)
      top = TOP_MIN
    } else {
      const fitsRight = a.x + a.r + GAP + w + MARGIN <= vw
      const fitsLeft = a.x - a.r - GAP - w >= MARGIN
      const fitsBelow = a.y + a.r + GAP + h + MARGIN <= vh
      const fitsAbove = a.y - a.r - GAP - h >= TOP_MIN
      side = fitsRight
        ? 'right'
        : fitsLeft
          ? 'left'
          : fitsBelow
            ? 'below'
            : fitsAbove
              ? 'above'
              : 'right'
      if (side === 'right' || side === 'left') {
        left = side === 'right' ? a.x + a.r + GAP : a.x - a.r - GAP - w
        top = clamp(a.y - h / 2, TOP_MIN, Math.max(TOP_MIN, vh - h - MARGIN))
        arrow.style.top = `${Math.round(clamp(a.y - top, ARROW_INSET, h - ARROW_INSET))}px`
        arrow.style.left = ''
      } else {
        top = side === 'below' ? a.y + a.r + GAP : a.y - a.r - GAP - h
        left = clamp(a.x - w / 2, MARGIN, Math.max(MARGIN, vw - w - MARGIN))
        arrow.style.left = `${Math.round(clamp(a.x - left, ARROW_INSET, w - ARROW_INSET))}px`
        arrow.style.top = ''
      }
      // Nenhum lado coube (nó no meio de uma viewport minúscula): garante que
      // o balão pelo menos não vaze para fora à direita.
      left = Math.min(left, Math.max(MARGIN, vw - w - MARGIN))
    }
    el.style.left = `${Math.round(left)}px`
    el.style.top = `${Math.round(top)}px`
    if (el.dataset.side !== side) el.dataset.side = side
    el.style.visibility = 'visible'
  }, [getAnchor])

  useEffect(() => {
    let raf = 0
    const tick = () => {
      place()
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [place])

  // O corpo rola: uma confirmação que aparece com o balão já rolado ficaria
  // acima da área visível.
  const temConfirmacao = confirmacao !== undefined && confirmacao !== null
  useEffect(() => {
    if (temConfirmacao && bodyRef.current) bodyRef.current.scrollTop = 0
  }, [temConfirmacao])

  return (
    <aside className="node-balloon" ref={boxRef} role="dialog" aria-label={`Detalhes de ${node.nome}`}>
      <span className="node-balloon__arrow" ref={arrowRef} aria-hidden="true" />
      <div className="node-balloon__body" ref={bodyRef}>
        <button type="button" className="node-balloon__close" onClick={onClose} aria-label="Fechar">
          ×
        </button>
        {confirmacao}
        <BalloonContent {...props} />
      </div>
    </aside>
  )
}
