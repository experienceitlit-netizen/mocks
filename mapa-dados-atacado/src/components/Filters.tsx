import type { Debito, NivelDef } from './graph-types'
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
  /** TODOS os níveis do bloco `niveis`, na ordem das colunas: cada um vira um
   *  chip de filtro. Nenhum nível é especial. */
  niveis: readonly NivelDef[]
  /** Slugs de nível selecionados. */
  selectedNiveis: ReadonlySet<string>
  somenteSemOwner: boolean
  /** Esmaece tudo que não é produto de dados — a leitura de reunião "o que
   *  destes componentes é produto?". */
  somenteProdutos: boolean
  ligacoesOn: boolean
  counts: Counts
  hasActiveFilter: boolean
  onToggleDominio(dominio: string): void
  onToggleDebito(debito: Debito): void
  onToggleNivel(slug: string): void
  onToggleSemOwner(): void
  onToggleProdutos(): void
  onToggleLigacoes(): void
  onClear(): void
}

const DEBITOS: Debito[] = ['sim', 'nao', 'avaliar']

export default function Filters({
  dominios,
  selectedDominios,
  selectedDebitos,
  niveis,
  selectedNiveis,
  somenteSemOwner,
  somenteProdutos,
  ligacoesOn,
  counts,
  hasActiveFilter,
  onToggleDominio,
  onToggleDebito,
  onToggleNivel,
  onToggleSemOwner,
  onToggleProdutos,
  onToggleLigacoes,
  onClear,
}: FiltersProps) {
  return (
    <aside className="filters">
      <p className="filters__counter">
        <strong>{counts.total}</strong> componentes • <strong>{counts.comDebito}</strong> com débito
        • <strong>{counts.semOwner}</strong> sem owner
      </p>

      {niveis.length > 0 && (
        <div className="filters__group">
          <span className="filters__label">Nível</span>
          <div className="filters__chips">
            {niveis.map((nv) => {
              const active = selectedNiveis.has(nv.slug)
              return (
                <button
                  key={nv.slug}
                  type="button"
                  className={`filter-chip${active ? ' filter-chip--active' : ''}`}
                  onClick={() => onToggleNivel(nv.slug)}
                  aria-pressed={active}
                >
                  {nv.titulo}
                </button>
              )
            })}
          </div>
        </div>
      )}

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

      <label
        className="filters__toggle"
        title="Esmaece os componentes que não estão marcados como produto de dados (os octógonos do mapa)"
      >
        <input type="checkbox" checked={somenteProdutos} onChange={onToggleProdutos} />
        Somente produtos de dados
      </label>

      <label
        className="filters__toggle"
        title="Mostrar as setas entre os componentes quando nada está em destaque; com o mouse ou o clique num nó, só as dele aparecem de qualquer jeito"
      >
        <input type="checkbox" checked={ligacoesOn} onChange={onToggleLigacoes} />
        Mostrar ligações
      </label>

      {hasActiveFilter && (
        <button type="button" className="filters__clear" onClick={onClear}>
          Limpar filtros
        </button>
      )}
    </aside>
  )
}
