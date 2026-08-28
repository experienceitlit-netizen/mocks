// Legenda fixa (canto inferior esquerdo). Dimensões independentes: a COR diz a
// situação de débito do componente, a FORMA diz se ele é produto de dados e o
// ÍCONE interno diz o tipo de componente.
// O nível não tem marca visual própria — ele é a coluna da vista em níveis e a
// coluna "Nível" da tabela.
//
// As amostras são desenhadas a partir da MESMA geometria do canvas (shapes.ts),
// em SVG: legenda e mapa não têm como divergir. Inclusive as de COR — a amostra
// de débito do nó com logo é o mesmo anel grosso que o canvas traça, na mesma
// espessura relativa (DEBITO_BORDA).
import { COLOR_AVALIAR, COLOR_CURADO, COLOR_DEBITO, FUNDO_MARCA } from './palette'
import type { TipoComponente } from './graph-types'
import { TIPOS_COMPONENTE_GRUPOS } from './graph-types'
import type { GlifoDef } from './shapes'
// pesoDoRotulo NÃO entra aqui: o negrito do produto de dados continua sendo
// desenhado pelo canvas (Graph.tsx), mas a legenda deixou de anunciá-lo.
import {
  DEBITO_BORDA,
  GLIFO_DE,
  GLIFO_MARCA_ESCALA,
  LOSANGO_PONTOS,
  LOSANGO_S,
} from './shapes'

function Dot({ color }: { color: string }) {
  return <span className="legend__dot" style={{ background: color }} />
}

function pontosSvg(pontos: readonly (readonly [number, number])[]): string {
  return pontos.map(([x, y]) => `${x},${y}`).join(' ')
}

/** Meia-janela da amostra: o raio do nó (1) mais a folga da ponta do losango,
 *  para a silhueta maior não encostar na borda do SVG. */
const VIEW = LOSANGO_S + 0.08

const PONTOS_LOSANGO = pontosSvg(LOSANGO_PONTOS)

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
      {/* As MESMAS listas de pontos que o canvas percorre: polígono preenchido
          vira <polygon>, contorno vira <polygon fill="none"> (fechado) ou
          <polyline> (aberto). Nenhuma coordenada é recalculada aqui — e a cor de
          cada peça é a que ela declara, que é o que faz a logo aparecer na
          legenda com as cores da marca, como no mapa. A ampliação da logo é o
          mesmo GLIFO_MARCA_ESCALA que o canvas aplica ao raio, aqui como um
          `scale` no grupo. */}
      <g transform={glifo?.marca === true ? `scale(${GLIFO_MARCA_ESCALA})` : undefined}>
      {glifo?.partes.map((parte, i) =>
        parte.forma === 'poligono' ? (
          <polygon key={i} points={pontosSvg(parte.pontos)} fill={parte.cor ?? '#ffffff'} />
        ) : parte.fechado ? (
          <polygon
            key={i}
            points={pontosSvg(parte.pontos)}
            fill="none"
            stroke={parte.cor ?? '#ffffff'}
            strokeWidth={glifo.traco}
            strokeLinejoin="round"
          />
        ) : (
          <polyline
            key={i}
            points={pontosSvg(parte.pontos)}
            fill="none"
            stroke={parte.cor ?? '#ffffff'}
            strokeWidth={glifo.traco}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ),
      )}
      </g>
    </svg>
  )
}

/** Anel grosso de débito sobre miolo neutro: a amostra do nó COM LOGO, com a
 *  mesma espessura relativa que o canvas usa (DEBITO_BORDA do raio, traçada
 *  sobre a silhueta, logo metade dela para dentro). */
function AmostraBorda({ cor }: { cor: string }) {
  return (
    <svg
      className="legend__amostra"
      viewBox={`${-VIEW} ${-VIEW} ${2 * VIEW} ${2 * VIEW}`}
      aria-hidden="true"
    >
      <circle cx="0" cy="0" r="1" fill={FUNDO_MARCA} stroke={cor} strokeWidth={DEBITO_BORDA} />
    </svg>
  )
}

/** Tom do nó nas amostras de ícone de CATEGORIA: escuro o bastante para o glifo
 *  branco ter o mesmo contraste que tem sobre as cores de débito. O nó de marca
 *  usa o próprio neutro do mapa. */
const TOM_ICONE = '#6e6e6e'

/** Complemento do rótulo do tipo. Sem glifo, o nó liso é a informação — a
 *  legenda diz isso em vez de deixar a linha parecendo um desenho que faltou. */
function notaDoTipo(def: GlifoDef | null): string {
  if (def === null) return 'sem ícone'
  return def.nota ?? ''
}

/** Uma linha da seção de ícones: a amostra desenhada com a MESMA geometria do
 *  mapa, o nome do tipo e a nota do traço. O nó de marca aparece com o miolo
 *  neutro que ele tem no mapa; o de categoria, com o cinza das outras amostras. */
function LinhaDeTipo({ tipo }: { tipo: TipoComponente }) {
  const def = GLIFO_DE[tipo]
  const nota = notaDoTipo(def)
  return (
    <li>
      <Amostra glifo={def} tom={def?.marca === true ? FUNDO_MARCA : TOM_ICONE} />{' '}
      <span className="legend__tipo">{tipo}</span>
      {nota !== '' && <em className="legend__nota"> · {nota}</em>}
    </li>
  )
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
        {/* A COR é sempre o débito — o que muda é ONDE ela fica. No nó comum é
            o preenchimento; no nó que carrega uma logo o miolo pertence à marca
            e a mesma cor vira o anel. As duas amostras de "débito técnico"
            trazem o MESMO rótulo de propósito: é a mesma leitura em dois
            desenhos, não duas coisas diferentes, e repetir a palavra diz isso
            melhor do que uma frase explicando. */}
        <li className="legend__title">Cor</li>
        <li>
          <Dot color={COLOR_DEBITO} /> débito técnico
        </li>
        <li>
          <AmostraBorda cor={COLOR_DEBITO} /> débito técnico
        </li>
        <li>
          <Dot color={COLOR_AVALIAR} /> a avaliar
        </li>
        <li>
          <Dot color={COLOR_CURADO} /> curado / governado
        </li>
        <li>
          <span className="legend__dot legend__dot--incompleto" /> borda tracejada = sem owner ou
          centro de custo
        </li>

        {/* A bandeira de produto de dados tem DOIS canais no mapa — a silhueta e
            o peso do rótulo —, mas a legenda anuncia só a silhueta. O negrito
            continua sendo desenhado (pesoDoRotulo, em shapes.ts, segue valendo
            no canvas): ele é um reforço que funciona sem ser explicado, e a
            linha que o explicava custava mais espaço do que rendia. */}
        <li className="legend__title legend__divider">Forma</li>
        <li>
          <Amostra produto /> losango = produto de dados
        </li>
        <li>
          <Amostra /> círculo = demais componentes
        </li>

        {/* Catorze tipos não cabem numa coluna só sem esticar a legenda por
            cima do mapa — daí os grupos, e as duas colunas dentro de cada um.
            Nenhum é omitido: a lista da legenda é a mesma do select do
            cadastro, na mesma ordem. */}
        <li className="legend__title legend__divider">Ícone</li>
        {TIPOS_COMPONENTE_GRUPOS.map((grupo) => (
          <li key={grupo.titulo} className="legend__grupo">
            <span className="legend__grupo-titulo">{grupo.titulo}</span>
            <ul className="legend__tipos">
              {grupo.tipos.map((tipo) => (
                <LinhaDeTipo key={tipo} tipo={tipo} />
              ))}
            </ul>
          </li>
        ))}
        <li className="legend__nota legend__nota--linha">
          no nó com logo, o débito vai para o anel
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
