// Legenda fixa (canto inferior esquerdo) das cores, bordas e formas do grafo.
// Cores importadas de palette.ts — fonte única de verdade.
import {
  COLOR_AVALIAR,
  COLOR_CURADO,
  COLOR_DEBITO,
  COLOR_FANTASMA,
  COLOR_LEGADO,
  COLOR_ORIGEM,
  COLOR_RAIZ,
  COLOR_SISTEMA,
  COLOR_SISTEMA_LEGADO,
} from './palette'

interface LegendProps {
  /** Camada de linhagem visível: mostra formas/cores de sistema e origem. */
  layersVisible: boolean
  /** Grafo já migrado para níveis: explica o anel dos produtos finais. */
  hasNiveis: boolean
  /** Grafo já tem o nó-raiz do domínio: explica o hexágono azul. */
  hasRaiz: boolean
}

function Dot({ color }: { color: string }) {
  return <span className="legend__dot" style={{ background: color }} />
}

function Square({ color }: { color: string }) {
  return <span className="legend__square" style={{ background: color }} />
}

function Diamond({ color }: { color: string }) {
  return <span className="legend__diamond" style={{ background: color }} />
}

export default function Legend({ layersVisible, hasNiveis, hasRaiz }: LegendProps) {
  return (
    <div className="legend" aria-label="Legenda do grafo">
      <ul>
        {hasRaiz && (
          <li>
            <span className="legend__hex" style={{ background: COLOR_RAIZ }} /> Atacado — Dados
            (raiz)
          </li>
        )}
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
        {hasNiveis && (
          <li>
            <span className="legend__dot legend__dot--secundario" /> anel = produto secundário /
            final
          </li>
        )}
        {layersVisible && (
          <>
            <li className="legend__divider">
              <Square color={COLOR_SISTEMA} /> sistema
            </li>
            <li>
              <Square color={COLOR_SISTEMA_LEGADO} /> sistema legado / planilha
            </li>
            <li>
              <Diamond color={COLOR_ORIGEM} /> origem
            </li>
          </>
        )}
      </ul>
    </div>
  )
}
