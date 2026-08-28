// Legenda fixa (canto inferior esquerdo). Dimensões independentes: a COR diz a
// situação de débito do componente, a FORMA diz se ele é produto de dados, o
// ÍCONE interno diz o tipo de componente, e as bordas tracejadas dizem o resto.
// O nível não tem marca visual própria — ele é a coluna da vista em níveis e a
// coluna "Nível" da tabela.
//
// As amostras são desenhadas a partir da MESMA geometria do canvas (shapes.ts),
// em SVG: legenda e mapa não têm como divergir.
import {
  COLOR_AVALIAR,
  COLOR_CURADO,
  COLOR_DEBITO,
  COLOR_FANTASMA,
  COLOR_LEGADO,
} from './palette'
import type { GlifoDef } from './shapes'
import { GLIFOS_LEGENDA, LOSANGO_PONTOS, LOSANGO_S, pesoDoRotulo } from './shapes'

function Dot({ color }: { color: string }) {
  return <span className="legend__dot" style={{ background: color }} />
}

/** Meia-janela da amostra: o raio do nó (1) mais a folga da ponta do losango,
 *  para a silhueta maior não encostar na borda do SVG. */
const VIEW = LOSANGO_S + 0.08

const PONTOS_LOSANGO = LOSANGO_PONTOS.map(([x, y]) => `${x},${y}`).join(' ')

/** Silhueta da amostra — o mesmo círculo/losango do mapa. `tom` separa as duas
 *  seções: na de forma o que interessa é o contorno (cinza claro, como o
 *  texto); na de ícone o nó é só o fundo do glifo (cinza mais escuro, para o
 *  branco do ícone saltar como salta sobre a cor do nó no mapa). */
function Amostra({
  produto = false,
  glifo = null,
  tom = '#b0b0b0',
}: {
  produto?: boolean
  glifo?: GlifoDef | null
  tom?: string
}) {
  return (
    <svg
      className="legend__amostra"
      viewBox={`${-VIEW} ${-VIEW} ${2 * VIEW} ${2 * VIEW}`}
      aria-hidden="true"
    >
      {produto ? (
        <polygon points={PONTOS_LOSANGO} fill={tom} />
      ) : (
        <circle cx="0" cy="0" r="1" fill={tom} />
      )}
      {glifo?.partes.map((parte, i) =>
        parte.forma === 'poligono' ? (
          <polygon
            key={i}
            points={parte.pontos.map(([x, y]) => `${x},${y}`).join(' ')}
            fill="#ffffff"
          />
        ) : (
          <line
            key={i}
            x1={parte.de[0]}
            y1={parte.de[1]}
            x2={parte.a[0]}
            y2={parte.a[1]}
            stroke="#ffffff"
            strokeWidth={glifo.traco}
            strokeLinecap="round"
          />
        ),
      )}
    </svg>
  )
}

/** Tom do nó nas amostras de ícone: escuro o bastante para o glifo branco ter o
 *  mesmo contraste que tem sobre as cores de débito. */
const TOM_ICONE = '#6e6e6e'

/** Complemento do rótulo do tipo. Sem glifo, o nó liso é a informação — a
 *  legenda diz isso em vez de deixar a linha parecendo um desenho que faltou. */
function notaDoTipo(def: GlifoDef | null): string {
  if (def === null) return 'sem ícone'
  return def.nota ?? ''
}

interface LegendProps {
  /** Modo edição ativo (há store): a dica do atalho de exclusão só aparece
   *  onde a tecla faz alguma coisa. */
  podeExcluir?: boolean
  /** Quantos nós estão com o tamanho ajustado à mão nesta sessão. Zero esconde
   *  o botão de restaurar: ele não tem o que fazer. */
  redimensionados?: number
  onRestaurarTamanhos?(): void
}

export default function Legend({
  podeExcluir = false,
  redimensionados = 0,
  onRestaurarTamanhos,
}: LegendProps) {
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

        {/* A bandeira ocupa DOIS canais, e a legenda diz os dois: a silhueta,
            que se lê de perto, e o peso do rótulo, que é o que sobra quando o
            mapa inteiro cabe na tela e os nós viram pontos. A amostra de texto
            usa o mesmo pesoDoRotulo do canvas. */}
        <li className="legend__title legend__divider">Forma = produto de dados</li>
        <li>
          <Amostra produto /> losango = produto de dados
        </li>
        <li>
          <Amostra /> círculo = demais componentes
        </li>
        <li>
          <span className="legend__amostra legend__amostra--rotulo" aria-hidden="true">
            <span style={{ fontWeight: pesoDoRotulo(true) }}>Aa</span>
          </span>{' '}
          nome em negrito = o mesmo produto
        </li>
        <li className="legend__nota legend__nota--linha">
          o negrito atravessa o zoom em que a forma já não se lê
        </li>

        <li className="legend__title legend__divider">Ícone = tipo de componente</li>
        {GLIFOS_LEGENDA.map(({ tipo, def }) => {
          const nota = notaDoTipo(def)
          return (
            <li key={tipo}>
              <Amostra glifo={def} tom={TOM_ICONE} /> {tipo}
              {nota !== '' && <em className="legend__nota"> · {nota}</em>}
            </li>
          )
        })}
        <li className="legend__nota legend__nota--linha">
          o ícone só aparece com o nó grande o bastante na tela
        </li>

        <li className="legend__hint">
          o nível de cada componente é a coluna em que ele aparece
        </li>
        <li className="legend__hint">
          botão direito no nó = detalhes · clique fixa o destaque
        </li>
        {/* O gesto de borda não tem botão nem menu — a dica é o único lugar que
            o anuncia, junto com o cursor de alça que aparece ao passar por lá.
            Em DUAS linhas curtas de propósito: `.legend li` é nowrap, e uma
            linha comprida esticaria o painel por cima do mapa. */}
        <li className="legend__hint legend__hint--last">
          arraste a borda do nó = tamanho na tela (o F5 desfaz)
        </li>
        <li className="legend__hint legend__hint--last">
          arraste a borda direita da faixa = largura da coluna
        </li>
        <li className="legend__hint legend__hint--last">
          duplo clique na borda restaura · na Força, destaque antes
        </li>
        {podeExcluir && (
          <li className="legend__hint legend__hint--last">
            Delete (ou Backspace) no nó em evidência = excluir · Enter confirma
          </li>
        )}
        {redimensionados > 0 && onRestaurarTamanhos && (
          <li className="legend__hint legend__hint--last">
            <button type="button" className="legend__restaurar" onClick={onRestaurarTamanhos}>
              ↺ restaurar os tamanhos ({redimensionados})
            </button>
          </li>
        )}
      </ul>
    </div>
  )
}
