// TAMANHO DO NÓ em unidades de grafo — a conta que o canvas usa para desenhar e
// que o layout em colunas usa para se espaçar.
//
// Estava dentro do Graph.tsx, e saiu de lá quando o espaçamento vertical da
// vista em níveis passou a depender do tamanho dos nós: os dois precisam do
// MESMO número, senão a coluna se espaça por uma medida e o canvas desenha por
// outra — e o rótulo de um nó encosta no vizinho de baixo.
//
// O raio tem dois fatores, e cada um diz uma coisa diferente:
//
//   GRAU    quantas ligações o componente tem (radiusOf) — o sinal de sempre, e
//           o ÚNICO que vem do dado;
//   SESSÃO  o ajuste manual do arraste de borda (node-resize.ts).
//
// O primeiro mora aqui. O segundo é da sessão e fica com quem desenha: o layout
// das colunas não o acompanha de propósito — refazer a linhagem a cada quadro do
// arraste criaria nós novos e o mapa se re-enquadraria sozinho no meio do gesto.
//
// Houve um terceiro fator: um degrau que aumentava em 1.5 o raio do nó com logo
// de marca, para a logo caber legível. Saiu no uso. Todo componente nasce do
// mesmo tamanho, com marca ou sem, e quem precisa de uma logo maior aumenta
// aquele nó à mão — o que se mostrou melhor do que o mapa decidir sozinho que um
// nó importa mais por ter fornecedor declarado. A logo continua sendo desenhada
// ampliada DENTRO do nó (GLIFO_MARCA_ESCALA, em shapes.ts), que é outra coisa:
// aquilo é fração do raio, não muda o raio.
import type { GraphLinkData, GraphNodeData } from './graph-types'
import { ehProdutoDeDados } from './graph-types'
import { extentOf } from './shapes'

/** Ajuste fino do tamanho dos nós, aplicado ao raio inteiro (a área de clique
 *  e as faixas acompanham, porque derivam do mesmo raio). */
export const ESCALA_NO = 1.25

/** Raio pelo grau de conexões, antes do degrau do ícone. */
export function radiusOf(degree: number): number {
  return (4 + Math.sqrt(degree) * 2.2) * ESCALA_NO
}

/** Grau de cortesia de nós sem aresta: um componente recém-cadastrado nasce do
 *  tamanho dos pares em vez de encolhido no raio mínimo. Ao ganhar arestas, o
 *  grau real volta a mandar. */
export const SEM_ARESTA_DEGREE = 2

export function visualDegree(
  node: Pick<GraphNodeData, 'id' | 'fantasma'>,
  degreeById: ReadonlyMap<string, number>,
): number {
  const degree = degreeById.get(node.id) ?? 0
  if (degree > 0) return degree
  return node.fantasma === true ? 0 : SEM_ARESTA_DEGREE
}

/** Grau de cada nó, contando as duas pontas de cada aresta. Ponto único: o
 *  App passa este mapa ao Graph e a vista em níveis o recalcula das MESMAS
 *  arestas, então os dois chegam ao mesmo raio. */
export function grausPorId(
  nodes: readonly Pick<GraphNodeData, 'id'>[],
  links: readonly GraphLinkData[],
): Map<string, number> {
  const map = new Map<string, number>()
  for (const n of nodes) map.set(n.id, 0)
  for (const l of links) {
    map.set(l.source, (map.get(l.source) ?? 0) + 1)
    map.set(l.target, (map.get(l.target) ?? 0) + 1)
  }
  return map
}

/** O que o DADO diz do raio do nó: só o grau. Falta o fator da sessão, que quem
 *  desenha multiplica por cima.
 *
 *  O TIPO não entra: nenhum tipo de componente cresce o nó — nem os de marca,
 *  que já tiveram um degrau e o perderam. */
export function raioDoDado(
  node: Pick<GraphNodeData, 'id' | 'fantasma'>,
  degreeById: ReadonlyMap<string, number>,
): number {
  return radiusOf(visualDegree(node, degreeById))
}

/** Extensão da silhueta além do centro (a ponta do losango, nos produtos de
 *  dados) pelo que o dado diz. É o que precisa caber entre um nó e o vizinho de
 *  baixo na coluna. */
export function extentDoDado(
  node: Pick<GraphNodeData, 'id' | 'fantasma' | 'produtoDeDados'>,
  degreeById: ReadonlyMap<string, number>,
): number {
  return extentOf(ehProdutoDeDados(node), raioDoDado(node, degreeById))
}

/** Extensão que os paddings padrão da faixa de nível já cobrem — o nó comum.
 *  Acima disto, a faixa cresce (ver topoDaFaixa/baseDaFaixa em band-resize.ts).
 *
 *  Continua valendo mesmo sem o degrau da marca: um hub de grau alto, ou um nó
 *  que o usuário esticou à mão, passa daqui do mesmo jeito. */
export const EXTENT_COBERTO = 16

/** Espaço vertical que o RÓTULO de um nó ocupa abaixo dele, mais o respiro até
 *  o próximo nó.
 *
 *  O rótulo é desenhado em px de TELA (10 px, com piso e teto), então em
 *  unidades de grafo ele mede 10/zoom: encolhe ao aproximar e cresce ao afastar.
 *  13 é a medida dele no zoom em que a vista em níveis vive (1× a 2.6×), com a
 *  descida das letras e a margem de 3 que o canvas põe entre o nó e o texto.
 *
 *  Os outros 13 são o respiro entre o rótulo de um nó e o topo do seguinte —
 *  uma altura de rótulo, que é a medida que o olho usa para dizer se dois itens
 *  são de linhas diferentes. Menos que isso e a coluna lê como um bloco só. */
export const ROTULO_E_FOLGA = 26
