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
//   ÍCONE  = TIPO DE COMPONENTE um glifo DENTRO do nó, um por tipo.
//
// Por que a forma ficou com a bandeira de produto, e não com o tipo: produto de
// dados é a leitura de reunião ("o que, disto tudo, é produto?"), e a silhueta é
// o canal que se enxerga de longe, no mapa inteiro, sem ler nada. O tipo de
// componente é a leitura de quem está inventariando ("de que sistema isto vem?")
// — cabe num ícone dentro do nó, sem mexer no tamanho dele.
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
// O vocabulário tem DOIS grupos, e eles não recebem o mesmo tratamento porque
// não respondem à mesma pergunta:
//
//   CATEGORIA — o que a coisa É, sem dono: tabela, planilha, engrenagem de
//     processo, rack de arquivos, porta de API. Não há marca a reconhecer,
//     então o desenho é abstrato e MONOCROMÁTICO CLARO por cima do nó pintado
//     na cor do débito. Estes nós continuam exatamente como sempre foram:
//     mesmo tamanho, mesma cor cheia, um glifo branco em cima.
//
//   MARCA — o produto de um FORNECEDOR: Salesforce, MongoDB, SQL Server. Aqui a
//     pergunta é "que sistema é este?", e a resposta que o olho dá em um quarto
//     de segundo é a COR da marca, não a silhueta: uma nuvem branca é uma nuvem
//     qualquer; uma nuvem ciano é a Salesforce. Então a logo é desenhada NAS
//     CORES dela, e três coisas mudam para caber:
//
//       1. o miolo do nó vira NEUTRO (palette.FUNDO_MARCA) — duas cores fortes
//          no mesmo espaço se anulam, e quem precisa da cor é a logo;
//       2. o DÉBITO vai para a BORDA, grossa, na paleta de sempre (ver
//          DEBITO_BORDA) — o eixo não some, muda de canal;
//       3. a logo é desenhada MAIOR dentro do nó (GLIFO_MARCA_ESCALA), já que
//          não divide o miolo com cor nenhuma.
//
// O que NÃO muda é o tamanho do nó: com marca ou sem, todo componente nasce do
// mesmo raio. Houve um degrau de 1.5 para a marca e ele saiu no uso — quem
// precisa de uma logo maior estica aquele nó pela borda.
//
// Nada aqui é imagem: cada glifo é uma lista de PONTOS, desenhada em canvas puro
// e em SVG na legenda a partir DAS MESMAS coordenadas. O pacote standalone
// continua sendo um HTML sozinho, sem asset nenhum, e o desenho escala com o nó
// em vez de borrar.
//
// As logos são RECRIADAS em vetor, simplificadas para o tamanho do nó — a marca
// aqui identifica de qual sistema o dado vem no inventário interno, que é para
// o que uma logo serve num mapa de arquitetura. Onde a marca real é um
// LOGOTIPO ESCRITO (Pega, ServiceNow), a palavra não sobrevive a ~11 px: nesses
// dois o desenho é a cor da marca num ladrilho com o símbolo dela, que é como os
// próprios produtos aparecem como ícone de aplicativo.
//
// O critério de traço é LEGIBILIDADE NO TAMANHO DO NÓ, não fidelidade: nenhuma
// separação do desenho desce abaixo de GLIFO_DETALHE_MIN (ver o teste), e é isso
// que decide quantos dentes tem a engrenagem e quantas faixas tem o cilindro.
//
// Default fica SEM glifo de propósito: é o valor assumido por quem não declarou
// nada — marcá-lo encheria o mapa de ícones justamente onde não há informação.
// Nó liso = tipo não declarado.
// ---------------------------------------------------------------------------

/** Um traço do glifo: polígono preenchido ou linha traçada (fechada ou não).
 *
 *  Duas formas só, e as duas são listas de PONTOS: é o que permite ao canvas e
 *  ao SVG da legenda desenharem o mesmo ícone sem nenhuma conversão, e ao teste
 *  rasterizar o glifo para conferir que dois tipos não viram a mesma mancha. Não
 *  há curva de Bézier no vocabulário — as curvas (nuvem, cilindro, folha) já vêm
 *  amostradas em pontos pelos geradores abaixo.
 *
 *  `cor` é o que separa os dois grupos na hora de desenhar: ausente = o branco
 *  do glifo de categoria; presente = a cor daquela peça da logo. */
export type GlifoParte = { readonly cor?: string } & (
  | { readonly forma: 'poligono'; readonly pontos: readonly Ponto[] }
  | { readonly forma: 'contorno'; readonly pontos: readonly Ponto[]; readonly fechado: boolean }
)

export interface GlifoDef {
  readonly partes: readonly GlifoParte[]
  /** Espessura das partes 'contorno', em frações do raio. */
  readonly traco: number
  /** Logo de FORNECEDOR: desenha nas cores da marca, ampliada, e o nó troca a
   *  cor cheia por fundo neutro + borda de débito. Não muda o tamanho do nó. */
  readonly marca: boolean
  /** Complemento do rótulo na legenda. */
  readonly nota?: string
}

// --- geradores de contorno -------------------------------------------------
//
// Tudo o que não é reto nasce aqui, amostrado em pontos. O número de amostras é
// escolhido pelo tamanho em que o glifo vive: num raio de ~12 px de tela um arco
// de meia-volta tem uns 12 px de comprimento, então 12 segmentos já passam de um
// por pixel e mais que isso só engorda o path à toa.

function retangulo(x0: number, y0: number, x1: number, y1: number, cor?: string): GlifoParte {
  return {
    forma: 'poligono',
    cor,
    pontos: [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ],
  }
}

/** Retângulo de cantos arredondados — o "ladrilho" de ícone de aplicativo, que é
 *  a forma em que Pega e ServiceNow são reconhecidos. */
function ladrilho(meia: number, raio: number, cor: string): GlifoParte {
  const cantos: Array<[number, number, number]> = [
    [meia - raio, meia - raio, 0],
    [-meia + raio, meia - raio, Math.PI / 2],
    [-meia + raio, -meia + raio, Math.PI],
    [meia - raio, -meia + raio, (3 * Math.PI) / 2],
  ]
  return {
    forma: 'poligono',
    cor,
    pontos: cantos.flatMap(([cx, cy, base]) => arco(cx, cy, raio, raio, base, base + Math.PI / 2, 4)),
  }
}

/** Pontos de um arco de elipse, de `de` a `a` (radianos, canvas: 0 = leste, y
 *  cresce para BAIXO). Inclui as duas pontas. */
function arco(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  de: number,
  a: number,
  n = 12,
): Ponto[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = de + ((a - de) * i) / n
    return [cx + rx * Math.cos(t), cy + ry * Math.sin(t)] as Ponto
  })
}

/** Elipse fechada (o último ponto NÃO repete o primeiro — quem desenha fecha). */
function elipse(cx: number, cy: number, rx: number, ry: number, n = 20): Ponto[] {
  return Array.from({ length: n }, (_, i) => {
    const t = (2 * Math.PI * i) / n
    return [cx + rx * Math.cos(t), cy + ry * Math.sin(t)] as Ponto
  })
}

/** Disco preenchido — um círculo é só uma elipse de raios iguais. */
function disco(cx: number, cy: number, r: number, n = 20, cor?: string): GlifoParte {
  return { forma: 'poligono', cor, pontos: elipse(cx, cy, r, r, n) }
}

/** Curva quadrática amostrada: o jeito de descrever um contorno orgânico (a
 *  folha do Mongo) sem meter Bézier no vocabulário de partes. */
function curva(p0: Ponto, c: Ponto, p1: Ponto, n = 10): Ponto[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n
    const u = 1 - t
    return [
      u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0],
      u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1],
    ] as Ponto
  })
}

/** Meia-extensão dos glifos: todo ícone ocupa a mesma caixa, para nenhum tipo
 *  parecer mais importante que outro (o teste trava isso).
 *
 *  0.42 é medido contra o CÍRCULO, a silhueta mais apertada das duas: o glifo
 *  cabe num quadrado de meia-diagonal 0.42·√2 ≈ 0.59 do raio e sobra ~0.4 de
 *  folga até a borda — o que mantém o desenho longe da borda tracejada de
 *  "incompleto". No losango a folga é maior em TODA direção (mesmo no ponto mais
 *  apertado dele, o apótema 1.025, a silhueta já passa do raio do círculo), então
 *  um único número serve às duas formas. */
const GLIFO_MEIA = 0.42

/** Vão entre partes vizinhas da grade e dos tijolos — o MESMO nos dois, para os
 *  dois terem o mesmo ritmo. */
const GLIFO_VAO = 0.14

/** Meio-vão: as células da grade são medidas a partir do centro. */
const GRADE_VAO = GLIFO_VAO / 2

/** Espessura padrão do contorno dos ícones de sistema. Acima de
 *  GLIFO_DETALHE_MIN com folga: é a linha que precisa sobreviver a tudo. */
const TRACO_SISTEMA = 0.1

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

/** Colchetes angulares "< >" da API REST, em frações do raio: a PONTA externa
 *  (o vértice, o que mais avança), o canto interno (onde os dois traços do mesmo
 *  colchete começam) e a meia-altura.
 *
 *  A distância entre os dois cantos internos (2 × 0.16, menos a espessura do
 *  traço, dá 0.18 livres) é a medida que faz o glifo funcionar: é o VÃO no meio,
 *  e é ele que se enxerga primeiro quando o nó é pequeno. Encostar os colchetes
 *  um no outro fecharia o vão e o par viraria um losango vazado — que é a
 *  silhueta da bandeira de produto de dados, justamente o que este desenho não
 *  pode evocar.
 *
 *  A ponta para em 0.38, e não em 0.42 como a meia-caixa dos outros glifos,
 *  porque aqui a caixa é a ponta MAIS meio traço (o desenho é só contorno): com
 *  0.42 o par ficaria visivelmente maior que o resto do vocabulário, e o teste
 *  que iguala as caixas pega isso. */
const API_PONTA = 0.38
const API_CANTO = 0.16
const API_MEIA_ALTURA = 0.29

/** Espessura dos colchetes. Mais grossa que TRACO_SISTEMA porque aqui o traço é
 *  o glifo INTEIRO: não há nenhuma área preenchida para segurar a leitura
 *  quando o nó encolhe, como há no rack (que tem as baias) ou no balde. Na lupa
 *  de pixel, a 0.13 o traço já sai acinzentado no nó de 9 px de raio — um risco
 *  de pouco mais de um pixel, que o antialiasing dilui; a 0.14 ele continua
 *  branco. */
const TRACO_API = 0.14

/** Um colchete angular. `sinal` −1 desenha o "<" da esquerda e +1 o ">" da
 *  direita: os dois apontam para FORA, cada um afastando a ponta do centro. */
function colchete(sinal: number): GlifoParte {
  return {
    forma: 'contorno',
    fechado: false,
    pontos: [
      [sinal * API_CANTO, -API_MEIA_ALTURA],
      [sinal * API_PONTA, 0],
      [sinal * API_CANTO, API_MEIA_ALTURA],
    ],
  }
}

/** Meia-diagonal do "X" do Excel. Bem menor que a meia-caixa do ladrilho (0.42)
 *  porque ele mora DENTRO dele: 0.24 mais meio traço chega a 0.31, o que deixa
 *  uma faixa de verde em volta — e é a faixa de verde que faz a marca. */
const XIS_MEIA = 0.24

// --- cores das marcas ------------------------------------------------------
//
// As cores das marcas, ajustadas para o fundo em que vivem. A referência é a
// cor oficial de cada uma; onde ela ficaria escura demais sobre o neutro do nó
// (FUNDO_MARCA, #26292E) o tom foi clareado até passar de 3:1 de contraste, que
// é o piso para elemento gráfico. O vermelho do SQL Server (#CC2927) e o roxo
// da família Einstein/Data Cloud (#9050E9) são os dois que precisaram disso —
// nos dois a MATIZ, que é o que identifica a marca, não mudou.
const COR_SALESFORCE = '#00A1E0'
const COR_DATA_CLOUD = '#A672F5'
const COR_MONGODB = '#00ED64'
const COR_MONGODB_ESCURO = '#00A94F'
const COR_S3 = '#7BB93F'
const COR_S3_ESCURO = '#4B7F22'
const COR_AZURE = '#3FA9F5'
const COR_AZURE_CLARO = '#7FD3FF'
const COR_SQLSERVER = '#E8443F'
const COR_SQLSERVER_ESCURO = '#B02F2C'
const COR_SERVICENOW = '#62D84E'
const COR_PEGA = '#3D8BFF'
/** O verde de acento do Excel. É o tom claro do ícone atual, e não o verde
 *  escuro do institucional (#217346): sobre o neutro do nó aquele fica em 2:1,
 *  abaixo do piso, e o ladrilho perderia a cor que o identifica. */
const COR_EXCEL = '#21A366'
/** O branco que vai POR CIMA de um ladrilho de marca (o "P" do Pega, o arco do
 *  ServiceNow). Pleno, e não o branco a 90% do glifo de categoria: aqui ele está
 *  sobre uma cor saturada e clara, e precisa de toda a separação que tiver. */
const COR_MARCA_VAZADO = '#FFFFFF'

/** Nuvem: três lóbulos e uma base reta, todos preenchidos e SOBREPOSTOS — a
 *  união das quatro partes é a silhueta. É a mesma construção do Salesforce e do
 *  Data Cloud; o que separa os dois é a cor e o que vem debaixo dela.
 *
 *  `cy` e `k` sobem e encolhem a nuvem inteira: o Data Cloud precisa dos dois
 *  para abrir espaço para os pontos de dado sem estourar a caixa do glifo. */
function nuvem(cy: number, k: number, cor: string): GlifoParte[] {
  // Os três lóbulos têm alturas BEM diferentes de propósito: com os três na
  // mesma altura a união vira um domo único e a nuvem some. A diferença é o que
  // se lê no tamanho do nó.
  return [
    disco(-0.26 * k, cy + 0.06 * k, 0.16 * k, 20, cor),
    disco(-0.02 * k, cy - 0.13 * k, 0.27 * k, 20, cor),
    disco(0.23 * k, cy + 0.01 * k, 0.19 * k, 20, cor),
    retangulo(-0.42 * k, cy + 0.06 * k, 0.42 * k, cy + 0.22 * k, cor),
  ]
}

/** Perfil de uma engrenagem de `dentes` dentes, em UM polígono fechado.
 *
 *  O contorno é dado em quatro pontos por dente (topo do dente em `rOut`, fundo
 *  do vale em `rIn`), o que deixa os flancos levemente inclinados — é o que faz
 *  a peça ler como engrenagem, e não como estrela, no tamanho pequeno. */
function perfilDeEngrenagem(dentes: number, rOut: number, rIn: number): Ponto[] {
  const passo = (2 * Math.PI) / dentes
  const meioTopo = passo * 0.31
  const meioVale = passo * 0.38
  const pontos: Ponto[] = []
  for (let k = 0; k < dentes; k++) {
    const b = k * passo
    for (const [r, a] of [
      [rOut, b - meioTopo],
      [rOut, b + meioTopo],
      [rIn, b + meioVale],
      [rIn, b + passo - meioVale],
    ] as const) {
      pontos.push([r * Math.cos(a), r * Math.sin(a)])
    }
  }
  return pontos
}

/** Engrenagem com FURO no meio, num polígono só.
 *
 *  O furo é feito com a costura clássica: o contorno externo, uma ida e uma
 *  volta pelo mesmo raio (segmento degenerado, que não pinta nada) e o círculo
 *  interno percorrido ao CONTRÁRIO. Winding oposto = buraco, tanto no `fill()`
 *  do canvas quanto no `<polygon>` do SVG, sem precisar de duas partes nem de
 *  saber a cor do fundo — que é o que uma "parte que apaga" exigiria. */
function engrenagem(dentes: number, rOut: number, rIn: number, rFuro: number): GlifoParte {
  const externo = perfilDeEngrenagem(dentes, rOut, rIn)
  const furo = elipse(0, 0, rFuro, rFuro, 16).slice().reverse()
  return {
    forma: 'poligono',
    pontos: [...externo, externo[0], furo[0], ...furo, furo[0]],
  }
}

export const GLIFO_DE: Record<TipoComponente, GlifoDef | null> = {
  // =========================================================================
  // CATEGORIA — sem marca. Traço claro por cima do nó pintado na cor do débito,
  // exatamente como sempre foi. Nada aqui mudou de tamanho nem de cor.
  // =========================================================================

  // Grade 2×2 = tabela (linhas E colunas). NÃO é o desenho mais óbvio de tabela
  // (três linhas horizontais): três barras horizontais e três tijolos
  // inclinados virariam a mesma mancha no tamanho pequeno, logo na distinção que
  // mais importa (as duas "tabelas"). A grade resolve com o vão VERTICAL, que os
  // tijolos não têm em lugar nenhum.
  'Tabela SQL': {
    partes: [
      retangulo(-GLIFO_MEIA, -GLIFO_MEIA, -GRADE_VAO, -GRADE_VAO),
      retangulo(GRADE_VAO, -GLIFO_MEIA, GLIFO_MEIA, -GRADE_VAO),
      retangulo(-GLIFO_MEIA, GRADE_VAO, -GRADE_VAO, GLIFO_MEIA),
      retangulo(GRADE_VAO, GRADE_VAO, GLIFO_MEIA, GLIFO_MEIA),
    ],
    traco: 0,
    marca: false,
    nota: 'grade',
  },
  // Três "tijolos" (paralelogramos) empilhados, alusão ao lakehouse onde as
  // Tabelas Delta vivem. Fica em CATEGORIA, e não em marca: o que se cadastra
  // aqui é "uma tabela em formato Delta", que é um formato aberto — a plataforma
  // que a serve é outra pergunta.
  'Tabela Delta': {
    partes: TIJOLO_YS.map(tijolo),
    traco: 0,
    marca: false,
    nota: 'tijolos',
  },
  Default: null,
  // Torre/rack: caixa alta em pé com três baias. A proporção VERTICAL é o que o
  // separa de tudo mais no vocabulário — nenhum outro ícone é mais alto que
  // largo. Sem marca: "um servidor de arquivos" não é produto de fornecedor
  // nenhum.
  'Servidor de arquivos': {
    partes: [
      {
        forma: 'contorno',
        fechado: true,
        pontos: [
          [-0.26, -0.39],
          [0.26, -0.39],
          [0.26, 0.39],
          [-0.26, 0.39],
        ],
      },
      retangulo(-0.13, -0.25, 0.13, -0.15),
      retangulo(-0.13, -0.05, 0.13, 0.05),
      retangulo(-0.13, 0.15, 0.13, 0.25),
    ],
    traco: TRACO_SISTEMA,
    marca: false,
    nota: 'rack com baias',
  },
  // Engrenagem — pedido explícito. Oito dentes: com menos a peça lê como
  // estrela, com mais os vales somem no tamanho do nó.
  Processos: {
    partes: [engrenagem(8, 0.42, 0.28, 0.155)],
    traco: 0,
    marca: false,
    nota: 'engrenagem',
  },
  // Colchetes angulares "< >" — a marca de interface/código, que é o que uma API
  // é neste mapa: um componente que SERVE o dado por uma porta, sem dizer onde
  // ele mora. Fica em CATEGORIA porque "API REST" é um estilo de interface, não
  // o produto de fornecedor nenhum: glifo branco por cima da cor do débito, como
  // todo o resto deste grupo.
  //
  // Três desenhos mais óbvios foram desenhados e olhados NO TAMANHO REAL do nó
  // (~9 a 14 px de raio) antes deste, e os três caíram lá:
  //
  //   1. SETAS OPOSTAS (⇄), o símbolo mais direto de troca: no tamanho do nó as
  //      cabeças somem e sobram DUAS BARRAS HORIZONTAIS — que é o que os tijolos
  //      da Tabela Delta já são, na distinção que mais custaria errar;
  //   2. CHAVES com um ponto no meio ({ • }), o símbolo do payload JSON: a curva
  //      da chave é detalhe, some antes de tudo, e o que fica é um ponto cercado
  //      de borrão;
  //   3. "</>", com a barra inclinada entre os colchetes: a barra fecha o vão do
  //      meio e o glifo vira uma mancha só.
  //
  // O par de colchetes sobrevive porque é grosseiro por construção — dois traços
  // angulares e um vão, e o vão é a primeira coisa que se lê. Ele aponta para os
  // DOIS lados de propósito: um chevron sozinho já quer dizer "sentido do fluxo"
  // no mapa (o "‹" fraco que corre no corredor entre duas faixas), e um par
  // simétrico não tem direção nenhuma para se confundir com aquilo.
  'API REST': {
    partes: [colchete(-1), colchete(1)],
    traco: TRACO_API,
    marca: false,
    nota: 'colchetes angulares',
  },

  // =========================================================================
  // MARCA — logo do fornecedor, nas cores dele, ampliada dentro do nó. O nó
  // ganha fundo neutro e o débito vai para a borda; o tamanho não muda.
  // =========================================================================

  // A nuvem da Salesforce, no ciano dela: é a logo inteira, e é o caso em que a
  // COR faz todo o reconhecimento — a mesma nuvem em branco seria "uma nuvem".
  Salesforce: {
    partes: nuvem(0, 1, COR_SALESFORCE),
    traco: 0,
    marca: true,
    nota: 'nuvem Salesforce',
  },
  // A MESMA nuvem, no roxo da família Data Cloud/Einstein, subida e um pouco
  // menor para caber os três pontos de dado embaixo. Mesma família, produto
  // diferente — que é exatamente a relação entre os dois no mundo real.
  'Data Cloud': {
    partes: [
      ...nuvem(-0.08, 0.8, COR_DATA_CLOUD),
      disco(-0.25, 0.31, 0.075, 12, COR_DATA_CLOUD),
      disco(0, 0.31, 0.075, 12, COR_DATA_CLOUD),
      disco(0.25, 0.31, 0.075, 12, COR_DATA_CLOUD),
    ],
    traco: 0,
    marca: true,
    nota: 'nuvem com dados',
  },
  // A folha do MongoDB, no verde dele. É a logo: assimétrica, terminando em
  // bico, com um nervo mais escuro que dá o volume da marca.
  MongoDB: {
    partes: [
      {
        forma: 'poligono',
        cor: COR_MONGODB,
        pontos: [
          ...curva([0.06, -0.42], [0.52, -0.06], [-0.06, 0.4]),
          ...curva([-0.06, 0.4], [-0.34, -0.02], [0.06, -0.42]).slice(1, -1),
        ],
      },
      {
        forma: 'poligono',
        cor: COR_MONGODB_ESCURO,
        pontos: [
          ...curva([0.06, -0.42], [-0.02, -0.05], [-0.06, 0.4]),
          ...curva([-0.06, 0.4], [-0.34, -0.02], [0.06, -0.42]).slice(1, -1),
        ],
      },
    ],
    traco: 0,
    marca: true,
    nota: 'folha MongoDB',
  },
  // O balde do S3, no verde de armazenamento da AWS: o ícone da AWS para o S3 é
  // literalmente um balde, então a silhueta e a marca são a mesma coisa. O corpo
  // mais escuro e a boca mais clara dão a profundidade do ícone oficial.
  'S3 Bucket': {
    partes: [
      {
        forma: 'poligono',
        cor: COR_S3,
        pontos: [
          [-0.35, -0.12],
          [0.35, -0.12],
          [0.21, 0.38],
          [-0.21, 0.38],
        ],
      },
      {
        forma: 'poligono',
        cor: COR_S3_ESCURO,
        pontos: [
          [-0.35, -0.12],
          [0.35, -0.12],
          [0.3, 0.06],
          [-0.3, 0.06],
        ],
      },
      {
        forma: 'contorno',
        cor: COR_S3,
        fechado: false,
        pontos: arco(0, -0.1, 0.28, 0.26, Math.PI, 2 * Math.PI),
      },
    ],
    traco: TRACO_SISTEMA,
    marca: true,
    nota: 'balde S3 (AWS)',
  },
  // Contêiner no azul do Azure, com a tampa mais clara. CAIXA e não cilindro de
  // propósito: o SQL Server já é o cilindro do conjunto, e dois volumes iguais
  // separados só pela cor seriam a mesma peça no zoom afastado.
  'Blob Storage': {
    partes: [
      retangulo(-0.4, -0.1, 0.4, 0.34, COR_AZURE),
      retangulo(-0.42, -0.3, 0.42, -0.1, COR_AZURE_CLARO),
      // O trinco no meio da face: o que faz a peça ler como "algo que se abre",
      // e não como duas barras empilhadas. Começa em 0.00 e não em -0.02 para o
      // vão até a tampa ficar acima de GLIFO_DETALHE_MIN.
      retangulo(-0.09, 0.0, 0.09, 0.22, COR_AZURE_CLARO),
    ],
    traco: 0,
    marca: true,
    nota: 'contêiner Azure',
  },
  // O cilindro de banco no vermelho do SQL Server — a marca é o par
  // "tambor + vermelho", e é isso que o distingue de qualquer outra base do
  // mapa. Preenchido, e não contornado: no tamanho do nó a silhueta cheia lê, o
  // contorno some.
  'SQL Server': {
    partes: [
      {
        forma: 'poligono',
        cor: COR_SQLSERVER_ESCURO,
        pontos: [
          ...arco(0, -0.28, 0.35, 0.13, Math.PI, 2 * Math.PI),
          ...arco(0, 0.28, 0.35, 0.13, 0, Math.PI),
        ],
      },
      { forma: 'poligono', cor: COR_SQLSERVER, pontos: elipse(0, -0.28, 0.35, 0.13) },
      {
        forma: 'contorno',
        cor: COR_SQLSERVER,
        fechado: false,
        pontos: arco(0, 0.02, 0.35, 0.13, 0, Math.PI),
      },
    ],
    traco: TRACO_SISTEMA,
    marca: true,
    nota: 'base SQL Server',
  },
  // ServiceNow e Pega são LOGOTIPOS ESCRITOS: a marca real é a palavra, e a
  // palavra não sobrevive a ~11 px. Os dois viram o que já são como ícone de
  // aplicativo — o ladrilho na cor da marca com o símbolo vazado em branco. O
  // verde do ServiceNow é a coisa mais reconhecível dele.
  ServiceNow: {
    partes: [
      ladrilho(0.42, 0.13, COR_SERVICENOW),
      {
        forma: 'contorno',
        cor: COR_MARCA_VAZADO,
        fechado: false,
        pontos: arco(0, 0.1, 0.2, 0.22, Math.PI, 2 * Math.PI, 10),
      },
      retangulo(-0.22, 0.06, -0.1, 0.24, COR_MARCA_VAZADO),
      retangulo(0.1, 0.06, 0.22, 0.24, COR_MARCA_VAZADO),
    ],
    traco: 0.12,
    marca: true,
    nota: 'ladrilho ServiceNow',
  },
  // O ladrilho verde do Excel com o "X" branco. O X sozinho — que é como este
  // tipo era desenhado — não dizia "Excel", dizia "duas diagonais": o que
  // identifica o produto é o X DENTRO do verde, que é como o ícone dele aparece
  // na barra de tarefas. O X é menor que o do glifo antigo justamente para
  // sobrar ladrilho em volta; sem a moldura verde não há marca.
  Excel: {
    partes: [
      ladrilho(0.42, 0.13, COR_EXCEL),
      {
        forma: 'contorno',
        cor: COR_MARCA_VAZADO,
        fechado: false,
        pontos: [
          [-XIS_MEIA, -XIS_MEIA],
          [XIS_MEIA, XIS_MEIA],
        ],
      },
      {
        forma: 'contorno',
        cor: COR_MARCA_VAZADO,
        fechado: false,
        pontos: [
          [-XIS_MEIA, XIS_MEIA],
          [XIS_MEIA, -XIS_MEIA],
        ],
      },
    ],
    traco: 0.14,
    marca: true,
    nota: 'ladrilho Excel',
  },
  // O "P" do Pega no azul dele. A haste e a barriga são um traço só, contínuo:
  // uma letra montada de partes soltas desmancha antes de qualquer outra coisa
  // quando o nó encolhe.
  Pega: {
    partes: [
      ladrilho(0.42, 0.13, COR_PEGA),
      {
        forma: 'contorno',
        cor: COR_MARCA_VAZADO,
        fechado: false,
        pontos: [
          [-0.13, 0.26],
          [-0.13, -0.24],
          [0.02, -0.24],
          ...arco(0.02, -0.11, 0.13, 0.13, -Math.PI / 2, Math.PI / 2, 8),
          [-0.13, 0.02],
        ],
      },
    ],
    traco: 0.11,
    marca: true,
    nota: 'ladrilho Pega',
  },
}

/** O tipo tem ícone? (só o Default não tem). */
export function temIcone(tipo: TipoComponente): boolean {
  return GLIFO_DE[tipo] !== null
}

/** O tipo é LOGO DE MARCA? É a pergunta que decide os dois tratamentos
 *  especiais: cores próprias no glifo (ampliado dentro do nó) e fundo neutro com
 *  o débito na borda. Tipo de CATEGORIA responde false e é desenhado como o mapa
 *  sempre desenhou: cor cheia com o glifo branco por cima.
 *
 *  O que ele NÃO decide mais é o TAMANHO do nó. Houve um degrau que aumentava o
 *  raio da marca em 1.5 para a logo caber legível; ele saiu no uso. O tamanho
 *  base voltou a sair só do grau de conexões, igual para todo componente, e quem
 *  precisa de uma logo maior aumenta aquele nó à mão (o arraste de borda, em
 *  node-resize.ts) — o que se mostrou melhor do que o mapa decidir sozinho que
 *  um nó importa mais por ter fornecedor declarado. */
export function ehMarca(tipo: TipoComponente): boolean {
  return GLIFO_DE[tipo]?.marca === true
}

/** Quanto a LOGO é ampliada dentro do nó, além da caixa comum dos glifos.
 *
 *  Um glifo de categoria divide o nó com a cor de débito: ele precisa deixar
 *  campo de cor à mostra, senão o canal mais forte do mapa some. A logo não
 *  divide nada — o miolo é neutro justamente para ser o fundo dela —, então
 *  ocupá-lo é ganho puro de legibilidade. 1.35 leva a caixa de 0.42 para ~0.57
 *  do raio, e o canto do maior desenho (o ladrilho, a 0.54) para 0.73, ainda bem
 *  dentro da beirada interna do anel de débito (1 − DEBITO_BORDA/2 = 0.92). */
export const GLIFO_MARCA_ESCALA = 1.35

/** Fator de desenho do glifo de um tipo, em frações do raio do nó. */
export function escalaDoGlifo(tipo: TipoComponente): number {
  return ehMarca(tipo) ? GLIFO_MARCA_ESCALA : 1
}

/** Espessura da BORDA de débito do nó de marca, em frações do raio.
 *
 *  Nesses nós o miolo é neutro e a borda é quem diz o débito, então ela precisa
 *  ser vista de longe: 0.16 do raio é ~2 px de tela no nó típico e ~4 no zoom de
 *  trabalho — grossa o bastante para a cor se ler como cor, e não como um fio.
 *  Fração do raio, e não px de tela, porque é informação do DADO: tem de crescer
 *  junto com o nó, ao contrário do halo de seleção, que é interação. */
export const DEBITO_BORDA = 0.16

/** Cor do glifo de CATEGORIA, a mesma sobre qualquer cor de débito.
 *
 *  Branco quase pleno é o único tom que aguenta todas: sobre o vermelho
 *  (#CC092F) e o verde (#3A7D44) sobra contraste de sobra (~5:1), e sobre o
 *  cinza de "a avaliar" (#8A8A8A), que é o pior caso, fica em ~3:1 — o piso do
 *  que se exige de elemento gráfico não textual. Qualquer opacidade menor
 *  derrubaria esse abaixo do piso; por isso o glifo não escurece com o
 *  esmaecimento do nó — quem esmaece é o globalAlpha do canvas, que age no nó
 *  inteiro de uma vez.
 *
 *  Vale só para CATEGORIA: as peças de uma logo trazem a própria cor. */
export const GLIFO_COR = 'rgba(255, 255, 255, 0.9)'

/** A separação MAIS FINA que qualquer glifo usa (fração do raio): o vão entre
 *  dois pontos de dado, a espessura de um contorno, a folga entre duas baias do
 *  rack. É o número que limita o desenho — é ele que decide que a engrenagem tem
 *  oito dentes e o cilindro duas faixas, e não mais. */
export const GLIFO_DETALHE_MIN = 0.09

/** Raio de tela (px) a partir do qual TODO detalhe de TODO ícone vale pelo menos
 *  um pixel: 1 / GLIFO_DETALHE_MIN, arredondado para cima.
 *
 *  Não é um corte, e não é uma promessa: é a MEDIDA de quando o desenho está
 *  inteiro. O nó comum fica abaixo dela no zoom de trabalho, e é de propósito —
 *  a alternativa era o mapa engordar sozinho todo nó com logo, o que se mostrou
 *  pior no uso. Quem precisa do detalhe aumenta aquele nó pela borda. */
export const GLIFO_NITIDO_PX = 12

/** Raio MÍNIMO na tela (px) para o glifo ser desenhado.
 *
 *  Não é mais "o ícone aparece quando você dá zoom": os ícones aparecem SEMPRE.
 *  Isto aqui é só a proteção do zoom muito afastado — o ponto em que o nó tem
 *  meia dúzia de pixels, nenhum desenho sobrevive e uma mancha branca no meio
 *  atrapalharia a leitura da cor sem informar o tipo. O tipo continua no balão e
 *  na tabela. */
export const GLIFO_MIN_PX = 6

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
  raioDoNo: number,
): void {
  const def = GLIFO_DE[tipo]
  if (def === null) return
  // A logo é desenhada maior que o glifo de categoria (ver GLIFO_MARCA_ESCALA):
  // como o raio entra em TODA coordenada e na espessura do traço, ampliar é só
  // multiplicá-lo aqui — a tabela de pontos continua comparável entre os dois
  // grupos, e a legenda aplica o mesmo fator no seu SVG.
  const r = raioDoNo * escalaDoGlifo(tipo)
  ctx.save()
  ctx.lineWidth = def.traco * r
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const parte of def.partes) {
    // Cor da PEÇA: as logos trazem a sua, os glifos de categoria caem no branco.
    // As peças são desenhadas na ordem em que estão declaradas, e é isso que faz
    // o vazado de uma logo (o "P" do Pega, o arco do ServiceNow) cobrir o
    // ladrilho — não há operação de recorte no vocabulário.
    const cor = parte.cor ?? GLIFO_COR
    ctx.fillStyle = cor
    ctx.strokeStyle = cor
    ctx.beginPath()
    parte.pontos.forEach(([px, py], i) => {
      const vx = x + px * r
      const vy = y + py * r
      if (i === 0) ctx.moveTo(vx, vy)
      else ctx.lineTo(vx, vy)
    })
    if (parte.forma === 'poligono') {
      ctx.closePath()
      ctx.fill()
    } else {
      if (parte.fechado) ctx.closePath()
      ctx.stroke()
    }
  }
  ctx.restore()
}
