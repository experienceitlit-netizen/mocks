// Visão de tabela do catálogo: uma linha POR COMPONENTE, com o nível na
// primeira coluna e a relação de saída (Consome/Upstream) na última.
// Autocontido: a integração no App só precisa passar nós, arestas, níveis e
// (opcional) onSelectNode.
import { useMemo, useState } from 'react'
import type { GraphLinkData, GraphNodeData, NivelDef, VerboDef } from './graph-types'
import { tipoComponenteDe } from './graph-types'
import { VERBO_PADRAO } from './graph-build'
import { DEBITO_LABEL, domainColor } from './palette'
import {
  buildRows,
  domainLabel,
  isPendingValue,
  matchesFilter,
  sortRows,
  statusLabel,
  type RelacaoDeSaida,
  type SortDir,
  type SortKey,
} from './table-utils'
import './TableView.css'

export interface TableViewProps {
  nodes: GraphNodeData[]
  /** Arestas entre componentes; o `label` de cada uma é o verbo. */
  links: GraphLinkData[]
  /** Bloco `niveis`: título e ordem da coluna Nível. */
  niveis: readonly NivelDef[]
  /** Bloco `verbos`: o título que aparece antes do nome na coluna de relação
   *  (e que o filtro procura). Vazio = só o verbo padrão, que não é escrito. */
  verbos: readonly VerboDef[]
  /** Clique no nome de um componente → navegação para o mapa. */
  onSelectNode?: (id: string) => void
}

interface SortState {
  key: SortKey
  dir: SortDir
}

const SORT_LABEL: Record<SortKey, string> = {
  nivel: 'Nível',
  nome: 'Nome',
  tipo: 'Tipo de componente',
  dominio: 'Domínio',
  debito: 'Débito',
  status: 'Status',
  owner: 'Owner',
  centroDeCusto: 'Centro de custo',
}

/** Célula de texto: null = "não se aplica" (—), ausência/vazio = "⚠ a
 *  definir" âmbar e pendências ("a confirmar"…) em cinza itálico. */
function ValueCell({ value }: { value: string | null | undefined }) {
  if (value === null) return <>—</>
  if (value === undefined || value.trim() === '') {
    return <span className="table-view__missing">⚠ a definir</span>
  }
  if (isPendingValue(value)) {
    return <span className="table-view__pending">{value}</span>
  }
  return <>{value}</>
}

/** Lista de relações de saída, empilhadas e clicáveis (→ mapa).
 *
 *  O verbo vem ANTES do nome ("Envia · Ingestion API bulk") e só quando não é
 *  o padrão: escrevê-lo em toda linha repetiria o que o cabeçalho da coluna já
 *  diz, e a tabela de hoje (55 arestas, todas `consome`) ficaria ilegível. */
function RelacaoCell({
  itens,
  onSelectNode,
}: {
  itens: readonly RelacaoDeSaida[]
  onSelectNode?: (id: string) => void
}) {
  if (itens.length === 0) return <span className="table-view__none">—</span>
  return (
    <>
      {itens.map(({ node, verbo, verboTitulo }) => {
        const conteudo = (
          <>
            {verbo !== VERBO_PADRAO && (
              <span className="table-view__verbo">{verboTitulo} · </span>
            )}
            {node.nome}
          </>
        )
        // A chave é o par (alvo, verbo): dois verbos entre os mesmos dois
        // componentes são duas relações, e duas linhas na célula.
        const chave = `${node.id}\u0000${verbo}`
        return onSelectNode ? (
          <button
            key={chave}
            type="button"
            className="table-view__name-link table-view__rel"
            onClick={() => onSelectNode(node.id)}
            title="Ver no mapa"
          >
            {conteudo}
          </button>
        ) : (
          <span key={chave} className="table-view__name table-view__rel">
            {conteudo}
          </span>
        )
      })}
    </>
  )
}

function SortHeader({
  colKey,
  sort,
  onSort,
  children,
}: {
  colKey: SortKey
  sort: SortState
  onSort: (key: SortKey) => void
  children: string
}) {
  const active = sort.key === colKey
  const ariaSort = active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'
  return (
    <th aria-sort={ariaSort} scope="col">
      <button
        type="button"
        className={`table-view__sort${active ? ' table-view__sort--active' : ''}`}
        onClick={() => onSort(colKey)}
        title={`Ordenar por ${SORT_LABEL[colKey]}`}
      >
        {children}
        <span className="table-view__sort-arrow" aria-hidden="true">
          {active ? (sort.dir === 'asc' ? '▲' : '▼') : '⇅'}
        </span>
      </button>
    </th>
  )
}

export function TableView({ nodes, links, niveis, verbos, onSelectNode }: TableViewProps) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortState>({ key: 'nivel', dir: 'asc' })

  const componentes = useMemo(
    () => buildRows(nodes, links, niveis, verbos),
    [nodes, links, niveis, verbos],
  )

  const rows = useMemo(() => {
    const visible = componentes.filter((row) => matchesFilter(row, query))
    return sortRows(visible, sort.key, sort.dir)
  }, [componentes, query, sort])

  const handleSort = (key: SortKey) => {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' },
    )
  }

  return (
    <div className="table-view">
      <div className="table-view__toolbar">
        <input
          type="search"
          className="table-view__filter"
          placeholder="Filtrar por nome, nível, domínio, owner, verbo ou relação…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Filtrar componentes"
        />
        {query !== '' && (
          <button
            type="button"
            className="table-view__clear"
            onClick={() => setQuery('')}
          >
            limpar
          </button>
        )}
      </div>

      <div className="table-view__scroll">
        <table className="table-view__table">
          <thead>
            <tr>
              <SortHeader colKey="nivel" sort={sort} onSort={handleSort}>
                Nível
              </SortHeader>
              <SortHeader colKey="nome" sort={sort} onSort={handleSort}>
                Nome
              </SortHeader>
              <SortHeader colKey="tipo" sort={sort} onSort={handleSort}>
                Tipo de componente
              </SortHeader>
              <SortHeader colKey="dominio" sort={sort} onSort={handleSort}>
                Domínio
              </SortHeader>
              <SortHeader colKey="debito" sort={sort} onSort={handleSort}>
                Débito
              </SortHeader>
              <SortHeader colKey="status" sort={sort} onSort={handleSort}>
                Status
              </SortHeader>
              <SortHeader colKey="owner" sort={sort} onSort={handleSort}>
                Owner
              </SortHeader>
              <SortHeader colKey="centroDeCusto" sort={sort} onSort={handleSort}>
                Centro de custo
              </SortHeader>
              <th scope="col">Consome/Upstream</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const { node } = row
              const prev = i > 0 ? rows[i - 1] : undefined
              const groupStart = prev === undefined || prev.nivel !== row.nivel
              const cor = domainColor(node.dominio)
              return (
                <tr
                  key={row.key}
                  className={groupStart ? 'table-view__row--group-start' : undefined}
                >
                  <td className="table-view__cell--nivel">
                    <span className="table-view__nivel">{row.nivelTitulo}</span>
                  </td>
                  <td className="table-view__cell--nome">
                    {onSelectNode ? (
                      <button
                        type="button"
                        className="table-view__name-link"
                        onClick={() => onSelectNode(node.id)}
                        title="Ver no mapa"
                      >
                        {node.nome}
                      </button>
                    ) : (
                      <span className="table-view__name">{node.nome}</span>
                    )}
                  </td>
                  <td className="table-view__cell--tipo">
                    <span className="table-view__kind">{tipoComponenteDe(node)}</span>
                  </td>
                  <td className="table-view__cell--dominio">
                    <span className="table-view__domain-chip" style={{ borderColor: cor, color: cor }}>
                      {domainLabel(node.dominio)}
                    </span>
                  </td>
                  <td className="table-view__cell--debito">
                    {node.debito ? (
                      <span className={`table-view__chip table-view__chip--debito-${node.debito}`}>
                        {DEBITO_LABEL[node.debito]}
                      </span>
                    ) : (
                      <span className="table-view__missing">⚠ a definir</span>
                    )}
                  </td>
                  <td className="table-view__cell--status">
                    {node.status ? (
                      <span className={`table-view__status table-view__status--${node.status}`}>
                        {statusLabel(node.status)}
                      </span>
                    ) : (
                      <span className="table-view__missing">⚠ a definir</span>
                    )}
                  </td>
                  <td className="table-view__cell--owner">
                    <ValueCell value={node.owner ?? undefined} />
                  </td>
                  <td className="table-view__cell--owner">
                    <ValueCell value={node.centroDeCusto ?? undefined} />
                  </td>
                  <td className="table-view__cell--rel">
                    <RelacaoCell itens={row.consome} onSelectNode={onSelectNode} />
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="table-view__empty">
                  Nenhum componente corresponde ao filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="table-view__footer">
        {rows.length} de {componentes.length} componentes
      </div>
    </div>
  )
}

export default TableView
