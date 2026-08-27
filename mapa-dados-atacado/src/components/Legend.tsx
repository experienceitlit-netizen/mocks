// Legenda fixa (canto inferior esquerdo). Duas dimensões independentes:
// a COR diz a situação de débito do componente, a FORMA diz o tipo de
// componente. O nível não tem marca visual própria — ele é a coluna da vista
// em níveis e a coluna "Nível" da tabela.
import {
  COLOR_AVALIAR,
  COLOR_CURADO,
  COLOR_DEBITO,
  COLOR_FANTASMA,
  COLOR_LEGADO,
} from './palette'
import { FORMAS_LEGENDA } from './shapes'

function Dot({ color }: { color: string }) {
  return <span className="legend__dot" style={{ background: color }} />
}

interface LegendProps {
  /** Modo edição ativo (há store): a dica do atalho de exclusão só aparece
   *  onde a tecla faz alguma coisa. */
  podeExcluir?: boolean
}

export default function Legend({ podeExcluir = false }: LegendProps) {
  return (
    <div className="legend" aria-label="Legenda do grafo">
      <ul>
        <li className="legend__title">Cor = débito técnico</li>
        <li>
          <Dot color={COLOR_DEBITO} /> débito técnico
        </li>
        <li>
          <Dot color={COLOR_AVALIAR} /> a avaliar
        </li>
        <li>
          <Dot color={COLOR_LEGADO} /> legado / planilha
        </li>
        <li>
          <Dot color={COLOR_CURADO} /> curado / governado
        </li>
        <li>
          <span
            className="legend__dot legend__dot--fantasma"
            style={{ borderColor: COLOR_FANTASMA }}
          />{' '}
          fantasma (citado, sem linha)
        </li>
        <li>
          <span className="legend__dot legend__dot--incompleto" /> borda tracejada = sem owner ou
          centro de custo
        </li>

        <li className="legend__title legend__divider">Forma = tipo de componente</li>
        {FORMAS_LEGENDA.map(({ tipo, def }) => (
          <li key={tipo}>
            <span className={def.css} /> {tipo}
            {def.nota !== undefined && <em className="legend__nota"> · {def.nota}</em>}
          </li>
        ))}

        <li className="legend__hint">
          o nível de cada componente é a coluna em que ele aparece
        </li>
        <li className={podeExcluir ? 'legend__hint' : 'legend__hint legend__hint--last'}>
          botão direito no nó = detalhes · clique fixa o destaque
        </li>
        {podeExcluir && (
          <li className="legend__hint legend__hint--last">
            Delete (ou Backspace) no nó em evidência = excluir · Enter confirma
          </li>
        )}
      </ul>
    </div>
  )
}
