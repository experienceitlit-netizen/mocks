// Visão de tabela dos dados do Atacado — espelho da tabela executiva que
// originou o projeto (Domínio | Origem | Fonte | Produto/dado | Descrição |
// Centro de custo | Owner | Débito | Status). Autocontido: a integração no
// App só precisa passar os nós e (opcional) onSelectNode.
import { useMemo, useState } from 'react'
import type { GraphLinkData, GraphNodeData } from './graph-types'
import { DEBITO_LABEL, domainColor } from './palette'
import {
  domainLabel,
  isDataNode,
  isPendingValue,
  matchesFilter,
  sortNodes,
  statusLabel,
  type SortDir,
  type SortKey,
} from './table-utils'
import './TableView.css'

export interface TableViewProps {
  nodes: GraphNodeData[]
  /** Aceito para futura evolução (ex.: coluna "consome"); não usado hoje. */
  links?: GraphLinkData[]
  /** Clique no nome do produto/dado → navegação para o mapa. */
  onSelectNode?: (id: string) => void
}

interface SortState {
  key: SortKey
  dir: SortDir
}

const SORT_LABEL: Record<SortKey, string> = {
  dominio: 'Domínio',
  nome: 'Produto / dado',
  debito: 'Débito',
  status: 'Status',
}

/** Célula de texto: pendências ("a confirmar"…) em cinza itálico e
 *  ausências em "⚠ a definir" âmbar (mesmo padrão do DetailPanel). */
function ValueCell({ value }: { value: string | null | undefined }) {
  if (value === null || value === undefined || value.trim() === '') {
    return <span className="table-view__missing">⚠ a definir</span>
  }
  if (isPendingValue(value)) {
    return <span className="table-view__pending">{value}</span>
  }
  return <>{value}</>
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

export function TableView({ nodes, onSelectNode }: TableViewProps) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortState>({ key: 'dominio', dir: 'asc' })

  const dataNodes = useMemo(() => nodes.filter(isDataNode), [nodes])

  const rows = useMemo(() => {
    const visible = dataNodes.filter((n) => matchesFilter(n, query))
    return sortNodes(visible, sort.key, sort.dir)
  }, [dataNodes, query, sort])

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
          placeholder="Filtrar por nome, descrição, origem ou sistema…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Filtrar dados"
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
              <SortHeader colKey="dominio" sort={sort} onSort={handleSort}>
                Domínio
              </SortHeader>
              <th scope="col">Origem</th>
              <th scope="col">Fonte (sistema)</th>
              <SortHeader colKey="nome" sort={sort} onSort={handleSort}>
                Produto / dado
              </SortHeader>
              <th scope="col">Descrição</th>
              <th scope="col">Centro de custo</th>
              <th scope="col">Owner</th>
              <SortHeader colKey="debito" sort={sort} onSort={handleSort}>
                Débito
              </SortHeader>
              <SortHeader colKey="status" sort={sort} onSort={handleSort}>
                Status
              </SortHeader>
            </tr>
          </thead>
          <tbody>
            {rows.map((node, i) => {
              const prev = i > 0 ? rows[i - 1] : undefined
              const groupStart =
                prev === undefined || (prev.dominio ?? 'A definir') !== (node.dominio ?? 'A definir')
              const color = domainColor(node.dominio)
              return (
                <tr
                  key={node.id}
                  className={groupStart ? 'table-view__row--group-start' : undefined}
                >
                  <td className="table-view__cell--dominio">
                    {groupStart ? (
                      <span
                        className="table-view__domain-chip"
                        style={{ borderColor: color, color }}
                      >
                        {domainLabel(node.dominio)}
                      </span>
                    ) : (
                      <span
                        className="table-view__domain-tick"
                        style={{ background: color }}
                        title={domainLabel(node.dominio)}
                      />
                    )}
                  </td>
                  <td className="table-view__cell--origem">
                    <ValueCell value={node.origem} />
                  </td>
                  <td className="table-view__cell--sistema">
                    <ValueCell value={node.sistema} />
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
                    {(node.tipo === 'produto' || node.tipo === 'insumo') && (
                      <span className={`table-view__kind table-view__kind--${node.tipo}`}>
                        {node.tipo}
                      </span>
                    )}
                  </td>
                  <td className="table-view__cell--descricao">
                    <ValueCell value={node.descricao} />
                  </td>
                  <td className="table-view__cell--cc">
                    <ValueCell value={node.centroDeCusto} />
                  </td>
                  <td className="table-view__cell--owner">
                    <ValueCell value={node.owner} />
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
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="table-view__empty">
                  Nenhum dado corresponde ao filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="table-view__footer">
        {rows.length} de {dataNodes.length} dados exibidos
      </div>
    </div>
  )
}

export default TableView
