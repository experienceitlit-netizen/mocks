// Balão de detalhe ancorado no nó selecionado. Substitui o antigo DetailPanel
// (drawer à direita) mantendo o mesmo conteúdo: chips, descrição, campos de
// governança, corpo markdown, árvore de linhagem e listas de relações.
// A ancoragem segue o nó a cada frame (pan/zoom/física) via getAnchor().
import { useCallback, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import type { GraphNodeData } from './graph-types'
import { isDerivado, isDominio, isRaiz, nodeKind } from './graph-types'
import type { LineageEntry, LineageSource } from './lineage'
import { DEBITO_LABEL, NIVEL_LABEL, domainColor } from './palette'
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
  /** Arestas de saída (este nó consome/produz o alvo). */
  outgoing: Connection[]
  /** Arestas de entrada (quem consome este nó). */
  incoming: Connection[]
  /** Dados ligados a um nó derivado (sistema/origem); vazio para dados. */
  derivadoDados: GraphNodeData[]
  /** Árvore de linhagem montante do dado (null para derivados/fantasmas). */
  lineage: LineageEntry | null
  /** O nó já é o centro do modo foco (esconde o botão Focar). */
  isFocused: boolean
  resolveWikiLink(target: string): string | null
  onNavigate(id: string): void
  /** Entra em modo foco neste nó (ou re-foca, se já em foco). */
  onFocus(id: string): void
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
  showLabel,
}: {
  title: string
  items: Connection[]
  onNavigate(id: string): void
  showLabel: boolean
}) {
  if (items.length === 0) return null
  return (
    <section className="connections">
      <h3>{title}</h3>
      <ul>
        {items.map(({ node, label }) => (
          <li key={node.id}>
            <button type="button" className="wikilink" onClick={() => onNavigate(node.id)}>
              {node.nome}
            </button>
            {showLabel && label !== 'consome' && <span className="edge-label">{label}</span>}
            {node.fantasma && <span className="edge-label">fantasma</span>}
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Linha de fonte/origem na árvore: clicável se real, inerte se placeholder. */
function LineageSourceRow({
  source,
  papel,
  onNavigate,
}: {
  source: LineageSource
  papel: 'fonte' | 'origem'
  onNavigate(id: string): void
}) {
  return (
    <li className="lineage__row">
      <span className="lineage__papel">{papel}</span>
      {source.placeholder ? (
        <span className="lineage__placeholder">{source.node.nome}</span>
      ) : (
        <button type="button" className="wikilink" onClick={() => onNavigate(source.node.id)}>
          {source.node.nome}
        </button>
      )}
    </li>
  )
}

/** Ramo recursivo da linhagem: o dado, sua fonte/origem e seus insumos. */
function LineageBranch({
  entry,
  isRoot = false,
  onNavigate,
}: {
  entry: LineageEntry
  isRoot?: boolean
  onNavigate(id: string): void
}) {
  return (
    <li className="lineage__row">
      {isRoot ? (
        <span className="lineage__self">{entry.data.nome}</span>
      ) : (
        <button type="button" className="wikilink" onClick={() => onNavigate(entry.data.id)}>
          {entry.data.nome}
        </button>
      )}
      {(entry.sistema || entry.origem || entry.insumos.length > 0) && (
        <ul className="lineage__children">
          {entry.sistema && (
            <LineageSourceRow source={entry.sistema} papel="fonte" onNavigate={onNavigate} />
          )}
          {entry.origem && (
            <LineageSourceRow source={entry.origem} papel="origem" onNavigate={onNavigate} />
          )}
          {entry.insumos.map((filho, i) => (
            <LineageBranch key={`${filho.data.id}-${i}`} entry={filho} onNavigate={onNavigate} />
          ))}
        </ul>
      )}
    </li>
  )
}

type BalloonContentProps = Omit<NodeBalloonProps, 'onClose' | 'getAnchor'>

/** Corpo do balão — o mesmo conteúdo do antigo painel lateral, por tipo de nó. */
function BalloonContent({
  node,
  outgoing,
  incoming,
  derivadoDados,
  lineage,
  isFocused,
  resolveWikiLink,
  onNavigate,
  onFocus,
}: BalloonContentProps) {
  const debito = node.debito ?? 'avaliar'
  const kind = nodeKind(node)

  // Nó-raiz do domínio: descrição e a lista de produtos que agrega.
  // Governança não se aplica (owner/CC = "—", nunca ⚠), sem débito/domínio.
  if (isRaiz(node)) {
    return (
      <>
        <header className="node-balloon__header">
          <h2>{node.nome}</h2>
          <div className="chips">
            <span className="chip chip--neutral">{NIVEL_LABEL.raiz}</span>
          </div>
        </header>

        {!isFocused && (
          <button type="button" className="node-balloon__focus" onClick={() => onFocus(node.id)}>
            ⌖ Focar neste nó
          </button>
        )}

        {node.descricao && <p className="node-balloon__descricao">{node.descricao}</p>}

        <div className="fields">
          <Field label="Owner">—</Field>
          <Field label="Centro de custo">—</Field>
        </div>

        <ConnectionList
          title="Agrega →"
          items={outgoing}
          onNavigate={onNavigate}
          showLabel={false}
        />
        {outgoing.length === 0 && <p className="ghost-note">Sem produtos mapeados.</p>}
      </>
    )
  }

  // Nó de domínio: chip na cor da área e os produtos finais que agrega
  // (as arestas de saída "agrega"), clicáveis.
  if (isDominio(node)) {
    return (
      <>
        <header className="node-balloon__header">
          <h2>{node.nome}</h2>
          <div className="chips">
            <span
              className="chip"
              style={{ borderColor: domainColor(node.nome), color: domainColor(node.nome) }}
            >
              Domínio
            </span>
          </div>
        </header>

        {!isFocused && (
          <button type="button" className="node-balloon__focus" onClick={() => onFocus(node.id)}>
            ⌖ Focar neste nó
          </button>
        )}

        <ConnectionList
          title="Produtos finais deste domínio"
          items={outgoing}
          onNavigate={onNavigate}
          showLabel={false}
        />
        {outgoing.length === 0 && <p className="ghost-note">Sem produtos mapeados.</p>}
      </>
    )
  }

  // Conteúdo simplificado para sistema/origem: nome, tipo e dados ligados.
  if (isDerivado(node)) {
    return (
      <>
        <header className="node-balloon__header">
          <h2>{node.nome}</h2>
          <div className="chips">
            <span className="chip chip--neutral">{kind}</span>
          </div>
        </header>

        {!isFocused && (
          <button type="button" className="node-balloon__focus" onClick={() => onFocus(node.id)}>
            ⌖ Focar neste nó
          </button>
        )}

        <section className="connections">
          <h3>{kind === 'sistema' ? 'Dados neste sistema' : 'Dados desta origem'}</h3>
          {derivadoDados.length > 0 ? (
            <ul>
              {derivadoDados.map((dado) => (
                <li key={dado.id}>
                  <button type="button" className="wikilink" onClick={() => onNavigate(dado.id)}>
                    {dado.nome}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ghost-note">Nenhum dado mapeado.</p>
          )}
        </section>
      </>
    )
  }

  return (
    <>
      <header className="node-balloon__header">
        <h2>{node.nome}</h2>
        <div className="chips">
          {node.dominio && (
            <span className="chip" style={{ borderColor: domainColor(node.dominio), color: domainColor(node.dominio) }}>
              {node.dominio}
            </span>
          )}
          {node.nivel ? (
            <span className={`chip chip--nivel-${node.nivel}`}>{NIVEL_LABEL[node.nivel]}</span>
          ) : (
            node.tipo && <span className="chip chip--neutral">{node.tipo}</span>
          )}
          {!node.fantasma && (
            <span className={`chip chip--debito-${debito}`}>Débito: {DEBITO_LABEL[debito]}</span>
          )}
        </div>
      </header>

      {!isFocused && (
        <button type="button" className="node-balloon__focus" onClick={() => onFocus(node.id)}>
          ⌖ Focar neste nó
        </button>
      )}

      {node.fantasma ? (
        <p className="ghost-note">
          Nó fantasma: é referenciado por outro dado, mas ainda não tem arquivo no vault.
        </p>
      ) : (
        <>
          {node.descricao && <p className="node-balloon__descricao">{node.descricao}</p>}

          <div className="fields">
            <Field label="Origem">{node.origem ?? '—'}</Field>
            <Field label="Sistema">{node.sistema ?? '—'}</Field>
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

      {lineage && (
        <section className="connections lineage">
          <h3>Linhagem</h3>
          <ul className="lineage__tree">
            <LineageBranch entry={lineage} isRoot onNavigate={onNavigate} />
          </ul>
        </section>
      )}

      <ConnectionList title="Consome →" items={outgoing} onNavigate={onNavigate} showLabel />
      <ConnectionList
        title="← Consumido por"
        items={incoming}
        onNavigate={onNavigate}
        showLabel={false}
      />
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
  const { onClose, getAnchor, node } = props
  const boxRef = useRef<HTMLElement>(null)
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

  return (
    <aside className="node-balloon" ref={boxRef} role="dialog" aria-label={`Detalhes de ${node.nome}`}>
      <span className="node-balloon__arrow" ref={arrowRef} aria-hidden="true" />
      <div className="node-balloon__body">
        <button type="button" className="node-balloon__close" onClick={onClose} aria-label="Fechar">
          ×
        </button>
        <BalloonContent {...props} />
      </div>
    </aside>
  )
}
