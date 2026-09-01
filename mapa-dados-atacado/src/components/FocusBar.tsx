// Barra do modo foco: breadcrumb do caminho navegado, switch de vista
// (Níveis, a linhagem completa em colunas, ou Força, a vizinhança com slider
// de profundidade 1–3), o ALCANCE do foco, os chips por tipo de ligação e a
// saída para o mapa completo.
//
// Os dois controles novos são vizinhos de propósito — e ficam AQUI, e não no
// painel de filtros, porque a pergunta que os trouxe é "dentro do foco":
//
//   o ALCANCE decide quem ENTRA na vista (é um parâmetro do buildLineage);
//   os CHIPS decidem quais LIGAÇÕES aparecem entre quem já entrou — a mesma
//     natureza do "Mostrar ligações" ao lado, e nunca escondem um componente.
import { Fragment } from 'react'
import type { Alcance } from './lineage'
import type { VerboDef } from './graph-types'

export type Vista = 'niveis' | 'forca'

export interface Crumb {
  id: string
  nome: string
}

/** Rótulo curto e explicação de cada posição do alcance. Fica junto do
 *  controle porque é texto de tela; a semântica das três é do lineage.ts. */
const ALCANCE_OPCOES: ReadonlyArray<{ valor: Alcance; rotulo: string; ajuda: string }> = [
  {
    valor: 'montante',
    rotulo: 'Montante',
    ajuda: 'Só a cadeia de que o componente depende, recursiva',
  },
  {
    valor: 'vizinhos',
    rotulo: '+ Vizinhos',
    ajuda: 'A cadeia montante mais todo vizinho direto, em qualquer sentido',
  },
  {
    valor: 'ambos',
    rotulo: 'Dois sentidos',
    ajuda: 'Montante e jusante, os dois recursivos',
  },
]

interface FocusBarProps {
  path: Crumb[]
  depth: number
  vista: Vista
  /** Há componente em foco? Sem foco a vista é o inventário, e aí o alcance
   *  não tem de onde partir — o controle some. */
  emFoco: boolean
  alcance: Alcance
  /** Faixas de nível (retângulos + títulos) visíveis na vista Níveis. */
  bandsOn: boolean
  ligacoesOn: boolean
  /** Vocabulário INTEIRO, na ordem do arquivo: um chip por verbo. A lista vem
   *  do dado (bloco `verbos`, editável em "⇢ Verbos"), nunca do código — verbo
   *  novo ganha chip sozinho. */
  verbos: readonly VerboDef[]
  /** Slugs com o chip apagado (ver arestas-visiveis.ts). */
  verbosOcultos: ReadonlySet<string>
  /** Clique num item do breadcrumb: volta o foco àquele nó (trunca o caminho). */
  onCrumbClick(index: number): void
  onDepthChange(depth: number): void
  onVistaChange(vista: Vista): void
  onAlcanceChange(alcance: Alcance): void
  onToggleBands(): void
  onToggleLigacoes(): void
  onToggleVerbo(slug: string): void
  onExit(): void
}

export default function FocusBar({
  path,
  depth,
  vista,
  emFoco,
  alcance,
  bandsOn,
  ligacoesOn,
  verbos,
  verbosOcultos,
  onCrumbClick,
  onDepthChange,
  onVistaChange,
  onAlcanceChange,
  onToggleBands,
  onToggleLigacoes,
  onToggleVerbo,
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

      <div className="focus-bar__vista" role="group" aria-label="Tipo de vista">
        <button
          type="button"
          className={vista === 'niveis' ? 'focus-bar__vista--active' : ''}
          aria-pressed={vista === 'niveis'}
          onClick={() => onVistaChange('niveis')}
          title="Linhagem completa em colunas, uma por nível"
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

      {vista === 'niveis' && emFoco && (
        <div className="focus-bar__alcance" role="group" aria-label="Alcance do foco">
          <span className="focus-bar__label">Alcance</span>
          <div className="focus-bar__vista">
            {ALCANCE_OPCOES.map(({ valor, rotulo, ajuda }) => (
              <button
                key={valor}
                type="button"
                className={alcance === valor ? 'focus-bar__vista--active' : ''}
                aria-pressed={alcance === valor}
                onClick={() => onAlcanceChange(valor)}
                title={ajuda}
              >
                {rotulo}
              </button>
            ))}
          </div>
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
        <input type="checkbox" checked={ligacoesOn} onChange={onToggleLigacoes} />
        Mostrar ligações
      </label>

      {verbos.length > 0 && (
        <div className="focus-bar__verbos" role="group" aria-label="Tipos de ligação visíveis">
          <span className="focus-bar__label">Tipos</span>
          <div className="focus-bar__chips">
            {verbos.map((v) => {
              const visivel = !verbosOcultos.has(v.slug)
              return (
                <button
                  key={v.slug}
                  type="button"
                  className={`filter-chip${visivel ? ' filter-chip--active' : ''}`}
                  aria-pressed={visivel}
                  onClick={() => onToggleVerbo(v.slug)}
                  title={
                    visivel
                      ? `Esconder as ligações "${v.titulo}" do mapa`
                      : `Mostrar as ligações "${v.titulo}" no mapa`
                  }
                >
                  {v.titulo}
                </button>
              )
            })}
          </div>
        </div>
      )}

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
