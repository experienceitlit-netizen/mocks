import type { Debito } from './graph-types'
import { DEBITO_LABEL, domainColor } from './palette'

export interface Counts {
  total: number
  comDebito: number
  semOwner: number
}

interface FiltersProps {
  dominios: string[]
  selectedDominios: ReadonlySet<string>
  selectedDebitos: ReadonlySet<Debito>
  somenteSemOwner: boolean
  /** Camada de linhagem (sistemas/origens) visível no grafo. */
  layersOn: boolean
  counts: Counts
  hasActiveFilter: boolean
  onToggleDominio(dominio: string): void
  onToggleDebito(debito: Debito): void
  onToggleSemOwner(): void
  onToggleLayers(): void
  onClear(): void
}

const DEBITOS: Debito[] = ['sim', 'nao', 'avaliar']

export default function Filters({
  dominios,
  selectedDominios,
  selectedDebitos,
  somenteSemOwner,
  layersOn,
  counts,
  hasActiveFilter,
  onToggleDominio,
  onToggleDebito,
  onToggleSemOwner,
  onToggleLayers,
  onClear,
}: FiltersProps) {
  return (
    <aside className="filters">
      <p className="filters__counter">
        <strong>{counts.total}</strong> dados • <strong>{counts.comDebito}</strong> com débito •{' '}
        <strong>{counts.semOwner}</strong> sem owner
      </p>

      <div className="filters__group">
        <span className="filters__label">Domínio</span>
        <div className="filters__chips">
          {dominios.map((d) => {
            const active = selectedDominios.has(d)
            return (
              <button
                key={d}
                type="button"
                className={`filter-chip${active ? ' filter-chip--active' : ''}`}
                style={active ? { borderColor: domainColor(d), color: domainColor(d) } : undefined}
                onClick={() => onToggleDominio(d)}
                aria-pressed={active}
              >
                {d}
              </button>
            )
          })}
        </div>
      </div>

      <div className="filters__group">
        <span className="filters__label">Débito técnico</span>
        <div className="filters__chips">
          {DEBITOS.map((d) => {
            const active = selectedDebitos.has(d)
            return (
              <button
                key={d}
                type="button"
                className={`filter-chip${active ? ' filter-chip--active' : ''}`}
                onClick={() => onToggleDebito(d)}
                aria-pressed={active}
              >
                {DEBITO_LABEL[d]}
              </button>
            )
          })}
        </div>
      </div>

      <label className="filters__toggle">
        <input type="checkbox" checked={somenteSemOwner} onChange={onToggleSemOwner} />
        Somente sem owner
      </label>

      <label className="filters__toggle" title="Mostrar sistemas e origens (linhagem) no grafo">
        <input type="checkbox" checked={layersOn} onChange={onToggleLayers} />
        Fontes e origens
      </label>

      {hasActiveFilter && (
        <button type="button" className="filters__clear" onClick={onClear}>
          Limpar filtros
        </button>
      )}
    </aside>
  )
}
