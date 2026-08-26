// Barra do modo foco: breadcrumb do caminho navegado, switch de vista
// (Níveis, a linhagem completa em colunas, ou Força, a vizinhança com slider
// de profundidade 1–3) e saída para o mapa completo. Visível só em foco.
import { Fragment } from 'react'

export type Vista = 'niveis' | 'forca'

export interface Crumb {
  id: string
  nome: string
}

interface FocusBarProps {
  path: Crumb[]
  depth: number
  vista: Vista
  /** O nó focado é um dado com linhagem; esconde o switch quando não. */
  canNiveis: boolean
  /** Faixas de nível (retângulos + títulos) visíveis na vista Níveis. */
  bandsOn: boolean
  assocOn: boolean
  /** Clique num item do breadcrumb: volta o foco àquele nó (trunca o caminho). */
  onCrumbClick(index: number): void
  onDepthChange(depth: number): void
  onVistaChange(vista: Vista): void
  onToggleBands(): void
  onToggleAssoc(): void
  onExit(): void
}

export default function FocusBar({
  path,
  depth,
  vista,
  canNiveis,
  bandsOn,
  assocOn,
  onCrumbClick,
  onDepthChange,
  onVistaChange,
  onToggleBands,
  onToggleAssoc,
  onExit,
}: FocusBarProps) {
  const last = path.length - 1
  return (
    <div className="focus-bar" role="navigation" aria-label="Modo foco">
      <nav className="focus-bar__crumbs" aria-label="Caminho navegado">
        <span className="focus-bar__tag">Foco</span>
        {path.map((crumb, i) => (
          <Fragment key={`${crumb.id}-${i}`}>
            {i > 0 && <span className="focus-bar__sep">›</span>}
            {i === last ? (
              <span className="focus-bar__crumb focus-bar__crumb--current" aria-current="page">
                {crumb.nome}
              </span>
            ) : (
              <button
                type="button"
                className="focus-bar__crumb"
                onClick={() => onCrumbClick(i)}
                title={`Voltar o foco para ${crumb.nome}`}
              >
                {crumb.nome}
              </button>
            )}
          </Fragment>
        ))}
      </nav>

      {canNiveis && (
        <div className="focus-bar__vista" role="group" aria-label="Tipo de vista">
          <button
            type="button"
            className={vista === 'niveis' ? 'focus-bar__vista--active' : ''}
            aria-pressed={vista === 'niveis'}
            onClick={() => onVistaChange('niveis')}
            title="Linhagem completa em níveis: origem → fonte → produto"
          >
            Níveis
          </button>
          <button
            type="button"
            className={vista === 'forca' ? 'focus-bar__vista--active' : ''}
            aria-pressed={vista === 'forca'}
            onClick={() => onVistaChange('forca')}
            title="Vizinhança em grafo de força, com profundidade ajustável"
          >
            Força
          </button>
        </div>
      )}

      {vista === 'niveis' && (
        <label
          className="focus-bar__bands"
          title="Mostrar as faixas de nível (retângulos e títulos) atrás do grafo"
        >
          <input type="checkbox" checked={bandsOn} onChange={onToggleBands} />
          Mostrar níveis
        </label>
      )}

      <label
        className="focus-bar__bands"
        title="Mostrar as setas entre os componentes; desligado, só as do nó em destaque aparecem"
      >
        <input type="checkbox" checked={assocOn} onChange={onToggleAssoc} />
        Mostrar associações
      </label>

      {vista === 'forca' && (
        <label className="focus-bar__depth">
          Profundidade <strong>{depth}</strong>
          <input
            type="range"
            min={1}
            max={3}
            step={1}
            value={depth}
            onChange={(e) => onDepthChange(Number(e.target.value))}
            aria-label="Profundidade da vizinhança"
          />
        </label>
      )}

      <button type="button" className="focus-bar__exit" onClick={onExit}>
        Ver mapa completo
      </button>
    </div>
  )
}
