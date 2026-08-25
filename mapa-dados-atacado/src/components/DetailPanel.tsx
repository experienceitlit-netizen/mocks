import type { ReactNode } from 'react'
import type { GraphNodeData } from './graph-types'
import { DEBITO_LABEL, domainColor } from './palette'
import Markdown from './Markdown'

export interface Connection {
  node: GraphNodeData
  label: string
}

interface DetailPanelProps {
  node: GraphNodeData
  /** Arestas de saída (este nó consome/produz o alvo). */
  outgoing: Connection[]
  /** Arestas de entrada (quem consome este nó). */
  incoming: Connection[]
  resolveWikiLink(target: string): string | null
  onNavigate(id: string): void
  onClose(): void
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

export default function DetailPanel({
  node,
  outgoing,
  incoming,
  resolveWikiLink,
  onNavigate,
  onClose,
}: DetailPanelProps) {
  const debito = node.debito ?? 'avaliar'
  return (
    <aside className="detail-panel" role="dialog" aria-label={`Detalhes de ${node.nome}`}>
      <button type="button" className="detail-panel__close" onClick={onClose} aria-label="Fechar">
        ×
      </button>

      <header className="detail-panel__header">
        <h2>{node.nome}</h2>
        <div className="chips">
          {node.dominio && (
            <span className="chip" style={{ borderColor: domainColor(node.dominio), color: domainColor(node.dominio) }}>
              {node.dominio}
            </span>
          )}
          {node.tipo && <span className="chip chip--neutral">{node.tipo}</span>}
          {!node.fantasma && (
            <span className={`chip chip--debito-${debito}`}>Débito: {DEBITO_LABEL[debito]}</span>
          )}
        </div>
      </header>

      {node.fantasma ? (
        <p className="ghost-note">
          Nó fantasma: é referenciado por outro dado, mas ainda não tem arquivo no vault.
        </p>
      ) : (
        <>
          {node.descricao && <p className="detail-panel__descricao">{node.descricao}</p>}

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
    </aside>
  )
}
