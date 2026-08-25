// Legenda fixa (canto inferior esquerdo) das cores e bordas do grafo.
// Cores importadas de palette.ts — fonte única de verdade.
import {
  COLOR_AVALIAR,
  COLOR_CURADO,
  COLOR_DEBITO,
  COLOR_FANTASMA,
  COLOR_LEGADO,
} from './palette'

function Dot({ color }: { color: string }) {
  return <span className="legend__dot" style={{ background: color }} />
}

export default function Legend() {
  return (
    <div className="legend" aria-label="Legenda do grafo">
      <ul>
        <li>
          <Dot color={COLOR_DEBITO} /> débito técnico
        </li>
        <li>
          <Dot color={COLOR_AVALIAR} /> a confirmar
        </li>
        <li>
          <Dot color={COLOR_LEGADO} /> legado / on-premise
        </li>
        <li>
          <Dot color={COLOR_CURADO} /> curado / governado
        </li>
        <li>
          <span className="legend__dot legend__dot--fantasma" style={{ borderColor: COLOR_FANTASMA }} />{' '}
          fantasma (sem arquivo)
        </li>
        <li>
          <span className="legend__dot legend__dot--incompleto" /> borda tracejada = sem owner ou
          centro de custo
        </li>
      </ul>
    </div>
  )
}
