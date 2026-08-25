// Visão de tabela dos dados do Atacado — espelho da tabela executiva em
// cadeias: uma linha por cadeia primário→secundário (derivada das arestas
// "consome"), com Domínio | Origem | Fonte | Fonte secundária | Produto
// primário | Produto secundário | Débito | Status vindos do primário. Autocontido: a integração
// no App só precisa passar nós, arestas e (opcional) onSelectNode.
import { useMemo, useState } from 'react'
import type { GraphLinkData, GraphNodeData } from './graph-types'
import { DEBITO_LABEL, NIVEL_LABEL, domainColor } from './palette'
import {
  buildChains,
  domainLabel,
  isPendingValue,
  matchesFilter,
  sortChains,
  statusLabel,
  type SortDir,
  type SortKey,
} from './table-utils'
import './TableView.css'

export interface TableViewProps {
  nodes: GraphNodeData[]
  /** Arestas "consome": definem as cadeias primário→secundário. */
  links: GraphLinkData[]
  /** Clique no nome de um produto → navegação para o mapa. */
  onSelectNode?: (id: string) => void
}

interface SortState {
  key: SortKey
  dir: SortDir
}

const SORT_LABEL: Record<SortKey, string> = {
  dominio: 'Domínio',
  primario: 'Produto primário',
  secundario: 'Produto secundário',
  debito: 'Débito',
  status: 'Status',
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

/** Nome de produto clicável (→ mapa) com chip opcional de nível. */
function ProductCell({
  node,
  chip,
  onSelectNode,
}: {
  node: GraphNodeData | null
  chip?: string
  onSelectNode?: (id: string) => void
}) {
  if (node === null) return <span className="table-view__none">—</span>
  return (
    <>
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
      {chip !== undefined && (
        <span className="table-view__kind table-view__kind--nivel">{chip}</span>
      )}
    </>
  )
}

/** Fontes secundárias (tabelas UCS) do primário, empilhadas na mesma célula
 *  e clicáveis (→ mapa); sem mapeamento = "—". */
function FsecCell({
  fontes,
  onSelectNode,
}: {
  fontes: GraphNodeData[]
  onSelectNode?: (id: string) => void
}) {
  if (fontes.length === 0) return <span className="table-view__none">—</span>
  return (
    <>
      {fontes.map((f) =>
        onSelectNode ? (
          <button
            key={f.id}
            type="button"
            className="table-view__name-link table-view__fsec"
            onClick={() => onSelectNode(f.id)}
            title="Ver no mapa"
          >
            {f.nome}
          </button>
        ) : (
          <span key={f.id} className="table-view__name table-view__fsec">
            {f.nome}
          </span>
        ),
      )}
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

export function TableView({ nodes, links, onSelectNode }: TableViewProps) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortState>({ key: 'dominio', dir: 'asc' })

  const chains = useMemo(() => buildChains(nodes, links), [nodes, links])

  const rows = useMemo(() => {
    const visible = chains.filter((row) => matchesFilter(row, query))
    return sortChains(visible, sort.key, sort.dir)
  }, [chains, query, sort])

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
          placeholder="Filtrar por produto, descrição, origem ou fonte…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Filtrar cadeias"
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
              <th scope="col">Fonte secundária</th>
              <SortHeader colKey="primario" sort={sort} onSort={handleSort}>
                Produto primário
              </SortHeader>
              <SortHeader colKey="secundario" sort={sort} onSort={handleSort}>
                Produto secundário
              </SortHeader>
              <SortHeader colKey="debito" sort={sort} onSort={handleSort}>
                Débito
              </SortHeader>
              <SortHeader colKey="status" sort={sort} onSort={handleSort}>
                Status
              </SortHeader>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const { primario, secundario } = row
              const prev = i > 0 ? rows[i - 1] : undefined
              const dominio = primario.dominio ?? 'A definir'
              const groupStart =
                prev === undefined || (prev.primario.dominio ?? 'A definir') !== dominio
              const color = domainColor(primario.dominio)
              return (
                <tr
                  key={row.key}
                  className={groupStart ? 'table-view__row--group-start' : undefined}
                >
                  <td className="table-view__cell--dominio">
                    {groupStart ? (
                      <span
                        className="table-view__domain-chip"
                        style={{ borderColor: color, color }}
                      >
                        {domainLabel(primario.dominio)}
                      </span>
                    ) : (
                      <span
                        className="table-view__domain-tick"
                        style={{ background: color }}
                        title={domainLabel(primario.dominio)}
                      />
                    )}
                  </td>
                  <td className="table-view__cell--origem">
                    <ValueCell value={primario.origem} />
                  </td>
                  <td className="table-view__cell--sistema">
                    <ValueCell value={primario.sistema} />
                  </td>
                  <td className="table-view__cell--fsec">
                    <FsecCell
                      fontes={row.fontesSecundarias}
                      onSelectNode={onSelectNode}
                    />
                  </td>
                  <td className="table-view__cell--nome">
                    <ProductCell
                      node={primario}
                      chip={primario.nivel === 'ambos' ? NIVEL_LABEL.ambos : undefined}
                      onSelectNode={onSelectNode}
                    />
                  </td>
                  <td className="table-view__cell--nome">
                    <ProductCell node={secundario} onSelectNode={onSelectNode} />
                  </td>
                  <td className="table-view__cell--debito">
                    {primario.debito ? (
                      <span
                        className={`table-view__chip table-view__chip--debito-${primario.debito}`}
                      >
                        {DEBITO_LABEL[primario.debito]}
                      </span>
                    ) : (
                      <span className="table-view__missing">⚠ a definir</span>
                    )}
                  </td>
                  <td className="table-view__cell--status">
                    {primario.status ? (
                      <span className={`table-view__status table-view__status--${primario.status}`}>
                        {statusLabel(primario.status)}
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
                <td colSpan={8} className="table-view__empty">
                  Nenhuma cadeia corresponde ao filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="table-view__footer">
        {rows.length} de {chains.length} cadeias exibidas
      </div>
    </div>
  )
}

export default TableView
