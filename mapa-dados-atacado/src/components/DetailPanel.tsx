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

interface DetailPanelProps {
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

export default function DetailPanel({
  node,
  outgoing,
  incoming,
  derivadoDados,
  lineage,
  isFocused,
  resolveWikiLink,
  onNavigate,
  onFocus,
  onClose,
}: DetailPanelProps) {
  const debito = node.debito ?? 'avaliar'
  const kind = nodeKind(node)

  // Painel do nó-raiz do domínio: descrição e a lista de produtos que agrega.
  // Governança não se aplica (owner/CC = "—", nunca ⚠), sem débito/domínio.
  if (isRaiz(node)) {
    return (
      <aside className="detail-panel" role="dialog" aria-label={`Detalhes de ${node.nome}`}>
        <button type="button" className="detail-panel__close" onClick={onClose} aria-label="Fechar">
          ×
        </button>

        <header className="detail-panel__header">
          <h2>{node.nome}</h2>
          <div className="chips">
            <span className="chip chip--neutral">{NIVEL_LABEL.raiz}</span>
          </div>
        </header>

        {!isFocused && (
          <button type="button" className="detail-panel__focus" onClick={() => onFocus(node.id)}>
            ⌖ Focar neste nó
          </button>
        )}

        {node.descricao && <p className="detail-panel__descricao">{node.descricao}</p>}

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
      </aside>
    )
  }

  // Painel do nó de domínio: chip na cor da área e os produtos finais que
  // agrega (as arestas de saída "agrega"), clicáveis.
  if (isDominio(node)) {
    return (
      <aside className="detail-panel" role="dialog" aria-label={`Detalhes de ${node.nome}`}>
        <button type="button" className="detail-panel__close" onClick={onClose} aria-label="Fechar">
          ×
        </button>

        <header className="detail-panel__header">
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
          <button type="button" className="detail-panel__focus" onClick={() => onFocus(node.id)}>
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
      </aside>
    )
  }

  // Painel simplificado para sistema/origem: nome, tipo e dados ligados.
  if (isDerivado(node)) {
    return (
      <aside className="detail-panel" role="dialog" aria-label={`Detalhes de ${node.nome}`}>
        <button type="button" className="detail-panel__close" onClick={onClose} aria-label="Fechar">
          ×
        </button>

        <header className="detail-panel__header">
          <h2>{node.nome}</h2>
          <div className="chips">
            <span className="chip chip--neutral">{kind}</span>
          </div>
        </header>

        {!isFocused && (
          <button type="button" className="detail-panel__focus" onClick={() => onFocus(node.id)}>
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
      </aside>
    )
  }

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
        <button type="button" className="detail-panel__focus" onClick={() => onFocus(node.id)}>
          ⌖ Focar neste nó
        </button>
      )}

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
    </aside>
  )
}
