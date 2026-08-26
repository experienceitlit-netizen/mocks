import type { Debito } from './graph-types'
import { DEBITO_LABEL, domainColor } from './palette'

/** Lado do filtro de nível ("ambos" casa com os dois). */
export type NivelFiltro = 'primario' | 'final'

export interface Counts {
  total: number
  comDebito: number
  semOwner: number
}

interface FiltersProps {
  dominios: string[]
  selectedDominios: ReadonlySet<string>
  selectedDebitos: ReadonlySet<Debito>
  /** Grupo "Nível" só aparece quando o grafo já traz `nivel` nos dados. */
  hasNiveis: boolean
  selectedNiveis: ReadonlySet<NivelFiltro>
  somenteSemOwner: boolean
  /** Camada de linhagem (sistemas/origens) visível no grafo. */
  layersOn: boolean
  assocOn: boolean
  counts: Counts
  hasActiveFilter: boolean
  onToggleDominio(dominio: string): void
  onToggleDebito(debito: Debito): void
  onToggleNivel(nivel: NivelFiltro): void
  onToggleSemOwner(): void
  onToggleLayers(): void
  onToggleAssoc(): void
  onClear(): void
}

const DEBITOS: Debito[] = ['sim', 'nao', 'avaliar']

const NIVEIS: { valor: NivelFiltro; label: string }[] = [
  { valor: 'primario', label: 'Produto primário' },
  { valor: 'final', label: 'Produto final' },
]

export default function Filters({
  dominios,
  selectedDominios,
  selectedDebitos,
  hasNiveis,
  selectedNiveis,
  somenteSemOwner,
  layersOn,
  assocOn,
  counts,
  hasActiveFilter,
  onToggleDominio,
  onToggleDebito,
  onToggleNivel,
  onToggleSemOwner,
  onToggleLayers,
  onToggleAssoc,
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

      {hasNiveis && (
        <div className="filters__group">
          <span className="filters__label">Nível</span>
          <div className="filters__chips">
            {NIVEIS.map(({ valor, label }) => {
              const active = selectedNiveis.has(valor)
              return (
                <button
                  key={valor}
                  type="button"
                  className={`filter-chip${active ? ' filter-chip--active' : ''}`}
                  onClick={() => onToggleNivel(valor)}
                  aria-pressed={active}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <label className="filters__toggle">
        <input type="checkbox" checked={somenteSemOwner} onChange={onToggleSemOwner} />
        Somente sem owner
      </label>

      <label className="filters__toggle" title="Mostrar sistemas e origens (linhagem) no grafo">
        <input type="checkbox" checked={layersOn} onChange={onToggleLayers} />
        Fontes e origens
      </label>

      <label
        className="filters__toggle"
        title="Mostrar as setas entre os componentes; desligado, só as do nó em destaque aparecem"
      >
        <input type="checkbox" checked={assocOn} onChange={onToggleAssoc} />
        Mostrar associações
      </label>

      {hasActiveFilter && (
        <button type="button" className="filters__clear" onClick={onClear}>
          Limpar filtros
        </button>
      )}
    </aside>
  )
}
