// Geometria do nó: a SILHUETA (produto de dados ou não), o PESO do rótulo, os
// ÍCONES por tipo de componente e a medida do halo. Canvas (Graph.tsx) e legenda
// (Legend.tsx) desenham a partir DAQUI, dos mesmos números, para que as duas
// nunca divirjam — o canvas com este módulo, a legenda com a mesma geometria em
// SVG.
//
// Três canais, e DOIS deles carregam a mesma informação de propósito:
//
//   FORMA  = PRODUTO DE DADOS   losango quando é, círculo quando não é.
//   RÓTULO = PRODUTO DE DADOS   nome em negrito quando é (ver pesoDoRotulo).
//   ÍCONE  = TIPO DE COMPONENTE um glifo pequeno DENTRO do nó, um por tipo.
//
// Por que a forma ficou com a bandeira de produto, e não com o tipo: produto de
// dados é a leitura de reunião ("o que, disto tudo, é produto?"), e a silhueta é
// o canal que se enxerga de longe, no mapa inteiro, sem ler nada. O tipo de
// componente é detalhe de quem já parou num nó — cabe num ícone que só aparece
// quando o nó está grande o bastante na tela. A tentativa anterior (um anel
// externo para a bandeira, forma para o tipo) invertia essa prioridade: o anel
// era a marca mais fraca do nó e carregava a informação mais importante.
//
// Por que a bandeira ganhou um SEGUNDO canal: a silhueta tem um piso de zoom.
// Afastado o bastante para caber o mapa inteiro, todo nó vira um ponto de poucos
// pixels e nenhuma forma sobrevive — o que ainda se lê ali é o texto do rótulo,
// que o canvas desenha em tamanho de tela. O negrito é a marca que atravessa
// esse piso.
//
// Todas as coordenadas deste arquivo são FRAÇÕES DO RAIO do nó, centradas em
// (0, 0). Quem desenha multiplica pelo raio que estiver usando — o canvas pelo
// raio do nó no grafo, a legenda pelo raio da amostra.
import type { TipoComponente } from './graph-types'
import { TIPOS_COMPONENTE } from './graph-types'

export type Ponto = readonly [number, number]

export type Forma = 'circulo' | 'losango'

/** A forma diz UMA coisa só: se o componente é produto de dados. */
export function formaDe(produtoDeDados: boolean): Forma {
  return produtoDeDados ? 'losango' : 'circulo'
}

// ---------------------------------------------------------------------------
// LOSANGO = PRODUTO DE DADOS
//
// O losango é a terceira tentativa de marcar a bandeira, e as duas primeiras
// ensinaram o critério:
//
//   1. ANEL EXTERNO — discreto demais: a marca mais fraca do nó carregando a
//      informação mais importante.
//   2. OCTÓGONO — oito lados leem como círculo no zoom de trabalho, e a borda
//      branca TRACEJADA de "incompleto", que contorna a silhueta, quebrava
//      justamente os cantos que deveriam denunciar a forma. Só funcionava
//      inflado a 1.5 do raio, ou seja, quem destacava era o TAMANHO — e tamanho
//      deixou de ser sinal confiável desde que o usuário redimensiona nós à mão.
//
// O losango não é uma variação do círculo: é a silhueta girada 45°, com PONTAS
// em cima, embaixo e nos dois lados e nenhuma aresta paralela a nada do resto do
// mapa. Sobrevive ao nó pequeno (a ponta ainda é uma ponta com poucos pixels) e
// sobrevive à borda tracejada por cima (o tracejado pode comer um pedaço de uma
// aresta, mas as quatro pontas continuam apontando).
// ---------------------------------------------------------------------------

/** Raio do losango (distância do centro à PONTA), em frações do raio do nó.
 *
 *  Este número resolve uma tensão. O invariante que a marca precisa é "a
 *  silhueta não pode ser MENOR que o círculo em direção nenhuma", senão o
 *  produto de dados lê como um nó comum encolhido; num losango, a direção mais
 *  apertada é o meio da aresta, a 45°, onde a distância é só S/√2 do raio. Para
 *  o apótema passar de 1, S precisa passar de √2 ≈ 1.414 — não há losango
 *  "modesto" em 1.1, como havia octógono (lá o apótema é 0.924·S).
 *
 *  1.45 é o menor valor redondo que cumpre o invariante com folga (apótema
 *  1.025, 2,5% fora do círculo — margem que o antialiasing não come, como comeria
 *  uma tangência exata em √2).
 *
 *  E o degrau de TAMANHO, que é o que a decisão queria mesmo enxugar, caiu para
 *  um terço: o que pesa na tela é a área, e a área do losango (2·S² = 4.20) é
 *  1.34× a do círculo (π), contra 2.02× do octógono a 1.5. A ponta chega mais
 *  longe, a mancha de tinta é bem menor. O tamanho do nó volta a dizer só o que
 *  sempre disse — grau de conexões e o ajuste manual da sessão. */
export const LOSANGO_S = 1.45

/** Vértices do losango, no sentido horário a partir da direita (canvas: y cresce
 *  para BAIXO, então [0, S] é a ponta de baixo).
 *
 *  Escritos à mão, e não gerados por cos/sin de k·90°, para os zeros serem zeros
 *  exatos: eles viram string em `points` de SVG e em coordenadas de canvas, e um
 *  8.9e-17 no lugar do 0 sujaria os dois. */
export const LOSANGO_PONTOS: readonly Ponto[] = [
  [LOSANGO_S, 0],
  [0, LOSANGO_S],
  [-LOSANGO_S, 0],
  [0, -LOSANGO_S],
]

/** Extensão da silhueta além do centro: o que a área de clique, o halo, o
 *  rótulo e a âncora do balão respeitam. No losango é a ponta — o pior caso,
 *  para nada encostar nela. */
export function extentOf(produtoDeDados: boolean, r: number): number {
  return produtoDeDados ? r * LOSANGO_S : r
}

/** Distância do centro até a SILHUETA na direção `theta` (radianos, medidos
 *  como no canvas: 0 = leste, y cresce para BAIXO).
 *
 *  Diferente de {@link extentOf}, que devolve o pior caso em qualquer direção:
 *  aqui é o contorno de verdade. Quem redimensiona o nó pela borda precisa
 *  disso — no losango a distância até o meio da aresta é 29% menor que até a
 *  ponta, e uma faixa de borda medida pela ponta ficaria bem FORA do desenho nas
 *  quatro diagonais.
 *
 *  No círculo é o próprio raio; no losango é a fronteira |x| + |y| = S·r, que em
 *  polar dá S·r / (|cos θ| + |sin θ|) — a ponta (S·r) nos eixos, o apótema
 *  (S·r/√2) nas diagonais. */
export function raioNaDirecao(produtoDeDados: boolean, r: number, theta: number): number {
  if (!produtoDeDados) return r
  return (r * LOSANGO_S) / (Math.abs(Math.cos(theta)) + Math.abs(Math.sin(theta)))
}

// ---------------------------------------------------------------------------
// NEGRITO = PRODUTO DE DADOS (o segundo canal da bandeira)
// ---------------------------------------------------------------------------

/** Peso do rótulo do nó, por bandeira. Vale para o canvas e para a amostra da
 *  legenda, das mesmas duas constantes.
 *
 *  700 e não 600: `system-ui` resolve para famílias diferentes em cada máquina, e
 *  nem todas trazem o corte semibold — onde falta, o navegador arredonda para o
 *  regular e o sinal SOME. 700 existe em qualquer fonte de sistema, e ainda é o
 *  peso que mais se separa do 400 no tamanho pequeno em que o rótulo vive.
 *
 *  Por que o negrito, e não um marcador (◆, ●) antes do nome, que foi a outra
 *  opção considerada: o marcador falha exatamente onde o segundo canal precisa
 *  funcionar. No zoom afastado ele vira mais um ponto grudado na primeira letra,
 *  atrapalhando a leitura do nome em vez de reforçá-la; ele desloca o nome do
 *  eixo do nó (o rótulo é centralizado); e um glifo fora do ASCII é uma aposta
 *  num pacote standalone que roda em máquina que ninguém escolheu — se a fonte
 *  não tiver o caractere, o mapa ganha um tofu. O negrito engrossa TODO traço da
 *  palavra e não depende de caractere nenhum. */
export const ROTULO_PESO_PRODUTO = 700
export const ROTULO_PESO_COMUM = 400

/** Peso CSS/canvas do rótulo de um nó. */
export function pesoDoRotulo(produtoDeDados: boolean): number {
  return produtoDeDados ? ROTULO_PESO_PRODUTO : ROTULO_PESO_COMUM
}

/** Folga (px de tela) entre o que o nó ocupa e o halo branco de seleção/hover.
 *  Em px de TELA porque o halo é uma marca de interação, não do dado: ele tem a
 *  mesma espessura aparente em qualquer zoom, e a folga acompanha. */
export const HALO_GAP = 2.5

/** Raio do halo branco de seleção/hover: sempre FORA da silhueta, em qualquer
 *  forma e qualquer zoom — inclusive fora da borda tracejada de "incompleto",
 *  que é traçada em cima da própria silhueta. */
export function raioHalo(extentDaSilhueta: number, scale: number): number {
  return extentDaSilhueta + HALO_GAP / scale
}

/** Silhueta do componente no path atual. Deixa o path fechado e pronto para
 *  fill/stroke — quem chama decide cor e traço. */
export function traceShape(
  ctx: CanvasRenderingContext2D,
  produtoDeDados: boolean,
  x: number,
  y: number,
  r: number,
): void {
  ctx.beginPath()
  if (!produtoDeDados) {
    ctx.arc(x, y, r, 0, 2 * Math.PI)
    return
  }
  LOSANGO_PONTOS.forEach(([px, py], i) => {
    const vx = x + px * r
    const vy = y + py * r
    if (i === 0) ctx.moveTo(vx, vy)
    else ctx.lineTo(vx, vy)
  })
  ctx.closePath()
}

// ---------------------------------------------------------------------------
// ÍCONE INTERNO = TIPO DE COMPONENTE
//
// Vocabulário: onde a tecnologia TEM marca, o glifo é a marca (tijolos =
// Databricks, "X" = Excel); onde não tem, o glifo é o objeto (grade = tabela).
// Assim o reconhecimento não depende de decorar uma legenda.
//
// As três famílias de traço são deliberadamente diferentes umas das outras,
// porque é isso que sobrevive ao tamanho pequeno — no raio mínimo em que o
// glifo aparece (GLIFO_MIN_PX) o olho não lê desenho, lê "blocos ortogonais"
// (grade), "barras inclinadas" (tijolos) ou "duas diagonais cruzadas" (X).
//
// Por isso a Tabela SQL NÃO é o desenho mais óbvio de tabela (três linhas
// horizontais): três barras horizontais e três tijolos inclinados são a mesma
// família e virariam a mesma mancha nos ~8 px em que o glifo ainda vive, logo
// na distinção que mais importa (as duas "tabelas"). A grade 2×2 resolve isso
// com o vão VERTICAL, que os tijolos não têm em lugar nenhum.
//
// Default fica SEM glifo de propósito: é o valor assumido por quem não declarou
// nada e é o tipo mais comum do catálogo — marcá-lo encheria o mapa de ícones
// justamente onde não há informação. Nó liso = tipo não declarado.
// ---------------------------------------------------------------------------

/** Um traço do glifo: polígono preenchido ou segmento de reta. */
export type GlifoParte =
  | { readonly forma: 'poligono'; readonly pontos: readonly Ponto[] }
  | { readonly forma: 'traco'; readonly de: Ponto; readonly a: Ponto }

export interface GlifoDef {
  readonly partes: readonly GlifoParte[]
  /** Espessura das partes 'traco', em frações do raio. */
  readonly traco: number
  /** Complemento do rótulo na legenda. */
  readonly nota?: string
}

function retangulo(x0: number, y0: number, x1: number, y1: number): GlifoParte {
  return {
    forma: 'poligono',
    pontos: [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ],
  }
}

/** Meia-extensão dos glifos. Vale para os três: o mesmo peso visual, para o
 *  ícone não sugerir importância diferente por tipo.
 *
 *  0.42 é medido contra o CÍRCULO, a silhueta mais apertada das duas: o glifo
 *  cabe num quadrado de meia-diagonal 0.42·√2 ≈ 0.59 do raio e sobra ~0.4 de
 *  folga até a borda — o que mantém o desenho longe da borda tracejada de
 *  "incompleto". No losango a folga é maior em TODA direção (mesmo no ponto mais
 *  apertado dele, o apótema 1.025, a silhueta já passa do raio do círculo), então
 *  um único número serve às duas formas. */
const GLIFO_MEIA = 0.42

/** Vão entre partes vizinhas do glifo — o MESMO na grade e nos tijolos, para os
 *  dois terem o mesmo ritmo e o mesmo piso de legibilidade.
 *
 *  0.14 do raio não some na tela: o glifo só é desenhado a partir de
 *  GLIFO_MIN_PX (8 px de raio), onde 0.14·8 ≈ 1.1 px — mais de um pixel, que é
 *  o mínimo para um vão ainda separar alguma coisa. */
const GLIFO_VAO = 0.14

/** Meio-vão: as células da grade são medidas a partir do centro. */
const GRADE_VAO = GLIFO_VAO / 2

/** Tijolos do Databricks: distância entre os centros das barras, meia-altura de
 *  cada uma (o que sobra do vão) e o deslocamento do topo para a direita, que dá
 *  a inclinação. */
const TIJOLO_YS = [-0.34, 0, 0.34]
const TIJOLO_H = (0.34 - GLIFO_VAO) / 2
const TIJOLO_SKEW = 0.2

/** Um tijolo: paralelogramo de largura cheia com o topo deslocado à direita. */
function tijolo(cy: number): GlifoParte {
  return {
    forma: 'poligono',
    pontos: [
      [-GLIFO_MEIA + TIJOLO_SKEW, cy - TIJOLO_H],
      [GLIFO_MEIA, cy - TIJOLO_H],
      [GLIFO_MEIA - TIJOLO_SKEW, cy + TIJOLO_H],
      [-GLIFO_MEIA, cy + TIJOLO_H],
    ],
  }
}

/** Meia-diagonal do "X": menor que GLIFO_MEIA porque a diagonal já estica o
 *  traço (0.34·√2 ≈ 0.48 do raio até a ponta). */
const XIS_MEIA = 0.34

export const GLIFO_DE: Record<TipoComponente, GlifoDef | null> = {
  // Grade 2×2 = tabela (linhas E colunas).
  'Tabela SQL': {
    partes: [
      retangulo(-GLIFO_MEIA, -GLIFO_MEIA, -GRADE_VAO, -GRADE_VAO),
      retangulo(GRADE_VAO, -GLIFO_MEIA, GLIFO_MEIA, -GRADE_VAO),
      retangulo(-GLIFO_MEIA, GRADE_VAO, -GRADE_VAO, GLIFO_MEIA),
      retangulo(GRADE_VAO, GRADE_VAO, GLIFO_MEIA, GLIFO_MEIA),
    ],
    traco: 0,
    nota: 'grade',
  },
  // Três "tijolos" (paralelogramos) empilhados, alusão ao logo do Databricks —
  // o lakehouse onde as Tabelas Delta vivem.
  'Tabela Delta': {
    partes: TIJOLO_YS.map(tijolo),
    traco: 0,
    nota: 'tijolos (Databricks)',
  },
  // O "X" da própria planilha: duas diagonais, a única família de traço que não
  // tem nenhuma aresta paralela aos eixos — não se confunde com as outras duas
  // nem no menor tamanho.
  Excel: {
    partes: [
      { forma: 'traco', de: [-XIS_MEIA, -XIS_MEIA], a: [XIS_MEIA, XIS_MEIA] },
      { forma: 'traco', de: [-XIS_MEIA, XIS_MEIA], a: [XIS_MEIA, -XIS_MEIA] },
    ],
    traco: 0.17,
    nota: '"X"',
  },
  Default: null,
}

/** Ordem de exibição da legenda (a mesma do select do formulário). */
export const GLIFOS_LEGENDA: ReadonlyArray<{ tipo: TipoComponente; def: GlifoDef | null }> =
  TIPOS_COMPONENTE.map((tipo) => ({ tipo, def: GLIFO_DE[tipo] }))

/** Cor do glifo, a mesma sobre qualquer cor de débito.
 *
 *  Branco quase pleno é o único tom que aguenta as quatro: sobre o vermelho
 *  (#CC092F) e o verde (#3A7D44) sobra contraste de sobra (~5:1), e sobre os
 *  dois claros — o cinza de "a avaliar" (#8A8A8A) e o âmbar de legado
 *  (#B8860B), que são o pior caso — fica em ~3:1, o piso do que se exige de
 *  elemento gráfico não textual. Qualquer opacidade menor derrubaria esses dois
 *  abaixo do piso; por isso o glifo não escurece com o esmaecimento do nó — quem
 *  esmaece é o globalAlpha do canvas, que age no nó inteiro de uma vez. */
export const GLIFO_COR = 'rgba(255, 255, 255, 0.9)'

/** Raio MÍNIMO na tela (px) para o glifo aparecer. Abaixo disso o vão entre as
 *  células da grade e a espessura do "X" caem para menos de um pixel: o glifo
 *  vira uma mancha clara no meio do nó, que atrapalha a leitura da cor sem
 *  informar o tipo. Some, então — o tipo continua no balão e na tabela. */
export const GLIFO_MIN_PX = 8

/** O nó está grande o bastante na tela para valer o glifo? */
export function glifoVisivel(r: number, scale: number): boolean {
  return r * scale >= GLIFO_MIN_PX
}

/** Glifo do tipo, desenhado DENTRO do nó (canvas puro: o pacote standalone
 *  continua autocontido, sem nenhum asset externo). Tipo sem glifo não desenha
 *  nada. */
export function drawGlifo(
  ctx: CanvasRenderingContext2D,
  tipo: TipoComponente,
  x: number,
  y: number,
  r: number,
): void {
  const def = GLIFO_DE[tipo]
  if (def === null) return
  ctx.save()
  ctx.fillStyle = GLIFO_COR
  ctx.strokeStyle = GLIFO_COR
  ctx.lineWidth = def.traco * r
  ctx.lineCap = 'round'
  for (const parte of def.partes) {
    ctx.beginPath()
    if (parte.forma === 'poligono') {
      parte.pontos.forEach(([px, py], i) => {
        const vx = x + px * r
        const vy = y + py * r
        if (i === 0) ctx.moveTo(vx, vy)
        else ctx.lineTo(vx, vy)
      })
      ctx.closePath()
      ctx.fill()
    } else {
      ctx.moveTo(x + parte.de[0] * r, y + parte.de[1] * r)
      ctx.lineTo(x + parte.a[0] * r, y + parte.a[1] * r)
      ctx.stroke()
    }
  }
  ctx.restore()
}
