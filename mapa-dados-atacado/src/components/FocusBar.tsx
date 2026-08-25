// Barra do modo foco: breadcrumb do caminho navegado, slider de profundidade
// (1–3) e saída para o mapa completo. Visível só quando há um nó em foco.
import { Fragment } from 'react'

export interface Crumb {
  id: string
  nome: string
}

interface FocusBarProps {
  path: Crumb[]
  depth: number
  /** Clique num item do breadcrumb: volta o foco àquele nó (trunca o caminho). */
  onCrumbClick(index: number): void
  onDepthChange(depth: number): void
  onExit(): void
}

export default function FocusBar({ path, depth, onCrumbClick, onDepthChange, onExit }: FocusBarProps) {
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

      <button type="button" className="focus-bar__exit" onClick={onExit}>
        Ver mapa completo
      </button>
    </div>
  )
}
