// Legenda fixa (canto inferior esquerdo) das cores, bordas e formas do grafo.
// Cores importadas de palette.ts — fonte única de verdade.
import {
  COLOR_AVALIAR,
  COLOR_CURADO,
  COLOR_DEBITO,
  COLOR_FANTASMA,
  COLOR_FONTE_SECUNDARIA,
  COLOR_LEGADO,
  COLOR_ORIGEM,
  COLOR_RAIZ,
  COLOR_SISTEMA,
  COLOR_SISTEMA_LEGADO,
  nivelCustomColor,
} from './palette'

interface LegendProps {
  /** Camada de linhagem visível: mostra formas/cores de sistema e origem. */
  layersVisible: boolean
  /** Grafo já migrado para níveis: explica o anel dos produtos finais. */
  hasNiveis: boolean
  /** Grafo já tem o nó-raiz do domínio: explica o hexágono azul. */
  hasRaiz: boolean
  /** Grafo já tem nós de domínio derivados: explica o quadrado arredondado. */
  hasDominios: boolean
  /** Grafo já tem fontes secundárias (tabelas UCS) derivadas. */
  hasFsec: boolean
  /** Níveis customizados COM nós presentes no grafo: cada um vira uma entrada
   *  própria (em vez de uma linha genérica "nível customizado") porque a cor
   *  é derivada do slug — a legenda é o único lugar que documenta o mapeamento
   *  cor → nível para o leitor. */
  niveisCustom: ReadonlyArray<{ slug: string; titulo: string }>
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

export default function Legend({
  layersVisible,
  hasNiveis,
  hasRaiz,
  hasDominios,
  hasFsec,
  niveisCustom,
}: LegendProps) {
  return (
    <div className="legend" aria-label="Legenda do grafo">
      <ul>
        {hasRaiz && (
          <li>
            <span className="legend__hex" style={{ background: COLOR_RAIZ }} /> Atacado — Dados
            (raiz)
          </li>
        )}
        {hasDominios && (
          <li>
            <span className="legend__dominio" /> domínio (cor da área)
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
            <span className="legend__dot legend__dot--secundario" /> anel = produto final
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
            {hasFsec && (
              <li>
                <span className="legend__fsec" style={{ background: COLOR_FONTE_SECUNDARIA }} />{' '}
                fonte secundária (UCS)
              </li>
            )}
            {niveisCustom.map((nv) => (
              <li key={nv.slug}>
                <span className="legend__fsec" style={{ background: nivelCustomColor(nv.slug) }} />{' '}
                {nv.titulo} (nível customizado)
              </li>
            ))}
            <li>
              <Diamond color={COLOR_ORIGEM} /> origem
            </li>
          </>
        )}
        <li className="legend__hint">botão direito no nó = detalhes · clique fixa o destaque</li>
      </ul>
    </div>
  )
}
