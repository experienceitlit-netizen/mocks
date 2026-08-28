import { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import type { Ref } from 'react'
import type { GraphLinkData, GraphMethods, GraphNodeData, SimLink, SimNode } from './graph-types'
import { ehProdutoDeDados, linkEndId, tipoComponenteDe } from './graph-types'
import {
  drawGlifo,
  extentOf,
  glifoVisivel,
  pesoDoRotulo,
  raioHalo,
  raioNaDirecao,
  traceShape,
} from './shapes'
import {
  BORDA_TOL_PX,
  cursorDaBorda,
  FATOR_PADRAO,
  fatorArrastando,
  fatorDe,
  naBorda,
  noLimite,
} from './node-resize'
import type { FaixaAjustada } from './band-resize'
import {
  baseDaFaixa,
  bordaDireita,
  bordaDireitaSob,
  bordaEsquerda,
  FAIXA_PADRAO,
  fatorArrastandoFaixa,
  fatorDaFaixa,
  noLimiteDaFaixa,
  topoDaFaixa,
} from './band-resize'
import { coresDaFaixa } from './band-colors'
import { BACKGROUND, nodeColor } from './palette'

export interface GraphHandle {
  /** Centraliza e dá zoom no nó (usado por balão, busca e ?no= da URL). */
  focusNode(id: string): void
  /** Posição do nó em coordenadas de tela + raio visual em px (âncora do
   *  balão de detalhe); null se o nó não está no grafo atual. */
  nodeScreenPosition(id: string): { x: number; y: number; r: number } | null
}

interface GraphProps {
  data: { nodes: SimNode[]; links: SimLink[] }
  degreeById: ReadonlyMap<string, number>
  /** Conjunto final de nós esmaecidos (hover + filtros, calculado no App). */
  dimmedIds: ReadonlySet<string>
  /** false esconde todas as arestas, menos as do nó em destaque (hover, clique
   *  fixado ou balão aberto) — visão limpa sem perder a relação sob análise. */
  assocOn: boolean
  hoverId: string | null
  /** "Hover fixado" pelo clique esquerdo: mesmo visual do hover, persistente. */
  pinnedId: string | null
  selectedId: string | null
  /** Nó a centralizar quando a física estabilizar (seleção vinda da URL). */
  initialFocusId: string | null
  /** Vista em níveis: todos os nós vêm com fx/fy — física desligada,
   *  arestas levemente curvas e enquadramento a cada troca de dados. */
  fixedLayout: boolean
  /** Faixas das colunas da vista em níveis: um retângulo com cabeçalho por
   *  nível, desenhado sob nós e arestas; null fora da vista em níveis (e com o
   *  toggle "Mostrar níveis" desligado). Já vêm com a largura resolvida pelo
   *  ajuste de sessão — ver band-resize.ts. */
  levelColumns: FaixaAjustada[] | null
  /** Ajuste de tamanho por nó, feito à mão no arraste da borda e válido só
   *  nesta sessão (ver node-resize.ts). Id ausente = fator 1. */
  escalas: ReadonlyMap<string, number>
  /** Fator novo de um nó (já vem no intervalo permitido). */
  onEscalaChange(id: string, fator: number): void
  /** Ajuste de largura por nível, também só da sessão. Slug ausente = 1. */
  larguras: ReadonlyMap<string, number>
  /** Largura nova de uma faixa (já vem no intervalo permitido). */
  onLarguraChange(slug: string, fator: number): void
  onNodeClick(id: string): void
  /** Clique direito: abre o balão de detalhe (a antiga ação do esquerdo). */
  onNodeRightClick(id: string): void
  onNodeHover(id: string | null): void
  onBackgroundClick(): void
  ref?: Ref<GraphHandle>
}

const DIM_ALPHA = 0.15
const FOCUS_ZOOM = 2.5
/** Teto de zoom após zoomToFit: subgrafos pequenos não viram close extremo. */
const MAX_FIT_ZOOM = 4

/** Ajuste fino do tamanho dos nós, aplicado ao raio inteiro (a área de clique
 *  e as faixas acompanham, porque derivam do mesmo raio). */
const ESCALA_NO = 1.25

function radiusOf(degree: number): number {
  return (4 + Math.sqrt(degree) * 2.2) * ESCALA_NO
}

/** Grau de cortesia de nós sem aresta: um componente recém-cadastrado nasce do
 *  tamanho dos pares em vez de encolhido no raio mínimo. Ao ganhar arestas, o
 *  grau real volta a mandar. */
const SEM_ARESTA_DEGREE = 2

function visualDegree(node: SimNode, degreeById: ReadonlyMap<string, number>): number {
  const degree = degreeById.get(node.id) ?? 0
  if (degree > 0) return degree
  return node.fantasma === true ? 0 : SEM_ARESTA_DEGREE
}

/** Extensão da silhueta do nó além do centro: área de clique, halo, rótulo e
 *  âncora do balão. O losango do produto de dados chega mais longe que o círculo
 *  (a ponta, a 1.45 do raio), e tudo isso acompanha. */
function extentDoNo(node: SimNode, r: number): number {
  return extentOf(ehProdutoDeDados(node), r)
}

/** Janela entre dois presses na BORDA do mesmo alvo para valer como duplo
 *  clique (restaurar o tamanho). O mesmo número do duplo clique do miolo, no
 *  App. */
const DBLCLICK_BORDA_MS = 350

/** O que está sob o cursor: a borda de um NÓ (que cresce em torno do próprio
 *  centro) ou a borda direita de uma FAIXA de nível (que cresce para a direita,
 *  empurrando as colunas seguintes). Os dois gestos são o mesmo para a mão e
 *  para o olho — mudam só a conta e o eixo. */
type AlvoBorda =
  | { tipo: 'no'; id: string; dist: number; theta: number }
  | { tipo: 'faixa'; slug: string; esquerda: number }

type Gesto =
  | { tipo: 'no'; id: string; fatorInicial: number; distInicial: number; angulo: number; fator: number }
  | { tipo: 'faixa'; slug: string; esquerda: number; fator: number }

/** Chave de identidade do alvo, para o duplo clique saber que o segundo press
 *  caiu na MESMA borda que o primeiro. */
function chaveDoAlvo(alvo: AlvoBorda): string {
  return alvo.tipo === 'no' ? `no:${alvo.id}` : `faixa:${alvo.slug}`
}

// A geometria das faixas (largura padrão, corredor e folgas) mora em
// band-resize.ts: quem DESENHA e quem faz a conta do arraste leem os mesmos
// números, como o canvas e a legenda já fazem com shapes.ts.
const BAND_RADIUS = 12

export default function Graph({
  data,
  degreeById,
  dimmedIds,
  assocOn,
  hoverId,
  pinnedId,
  selectedId,
  initialFocusId,
  fixedLayout,
  levelColumns,
  escalas,
  onEscalaChange,
  larguras,
  onLarguraChange,
  onNodeClick,
  onNodeRightClick,
  onNodeHover,
  onBackgroundClick,
  ref,
}: GraphProps) {
  const fgRef = useRef<GraphMethods | undefined>(undefined)
  const settledRef = useRef(false)
  const pendingFitRef = useRef(false)
  const dataRef = useRef(data)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight })

  /** Raio do nó em unidades de grafo: o que o GRAU calcula, vezes o ajuste de
   *  sessão da borda. Ponto ÚNICO de leitura — desenho, área de clique, halo,
   *  rótulo, âncora do balão e a própria faixa de borda saem todos daqui, então
   *  o fator não tem como valer para uns e não para outros. */
  const raioDe = useCallback(
    (node: SimNode) => radiusOf(visualDegree(node, degreeById)) * fatorDe(escalas, node.id),
    [degreeById, escalas],
  )

  const fitView = useCallback((ms: number) => {
    const fg = fgRef.current
    if (!fg) return
    fg.zoomToFit(ms, 80)
    window.setTimeout(() => {
      if (fg.zoom() > MAX_FIT_ZOOM) fg.zoom(MAX_FIT_ZOOM, 200)
    }, ms + 50)
  }, [])

  // Mudou o conjunto visível (foco): re-simulação curta + zoomToFit.
  useEffect(() => {
    if (dataRef.current === data) return
    dataRef.current = data
    if (fixedLayout || !settledRef.current) return
    pendingFitRef.current = true
    const t = window.setTimeout(() => fitView(500), 350)
    return () => window.clearTimeout(t)
  }, [data, fixedLayout, fitView])

  // Layout fixo: não há física para estabilizar — enquadra logo após render.
  useEffect(() => {
    if (!fixedLayout) return
    const t = window.setTimeout(() => fitView(400), 150)
    return () => window.clearTimeout(t)
  }, [fixedLayout, data, fitView])

  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const focusNode = useCallback(
    (id: string) => {
      const fg = fgRef.current
      const node = data.nodes.find((n) => n.id === id)
      if (!fg || !node || node.x === undefined || node.y === undefined) return
      fg.centerAt(node.x, node.y, 600)
      if (fg.zoom() < FOCUS_ZOOM) fg.zoom(FOCUS_ZOOM, 600)
    },
    [data],
  )

  const nodeScreenPosition = useCallback(
    (id: string) => {
      const fg = fgRef.current
      const node = data.nodes.find((n) => n.id === id)
      if (!fg || !node || node.x === undefined || node.y === undefined) return null
      const { x, y } = fg.graph2ScreenCoords(node.x, node.y)
      const zoom = fg.zoom()
      const extent = extentDoNo(node, raioDe(node))
      return { x, y, r: extent * zoom }
    },
    [data, raioDe],
  )

  useImperativeHandle(ref, () => ({ focusNode, nodeScreenPosition }), [
    focusNode,
    nodeScreenPosition,
  ])

  // -------------------------------------------------------------------------
  // REDIMENSIONAR PELA BORDA
  //
  // Um press na faixa de borda de um nó é NOSSO e de mais ninguém: os handlers
  // abaixo são registrados na FASE DE CAPTURA do div que embrulha o grafo, que
  // é ancestral tanto do container do force-graph quanto do canvas. Parando a
  // propagação ali, o evento não chega:
  //
  //   • ao canvas, onde moram o d3-drag (arrastaria o nó, no modo Força) e o
  //     d3-zoom (arrastaria a TELA) — é assim que o conflito com o arraste se
  //     resolve, sem tocar na lib nem desligar enableNodeDrag;
  //   • ao container, cujo `pointerdown` é o que arma o clique — sem ele o
  //     `pointerup` sai pela porta dos fundos e nenhum onNodeClick dispara, ou
  //     seja, terminar um resize não fixa nem desfixa o destaque do nó.
  //
  // O botão direito passa reto (só tratamos button 0), então o balão continua
  // abrindo com o clique direito em qualquer ponto do nó, borda inclusive.
  // -------------------------------------------------------------------------

  /** Quem pode ser redimensionado agora.
   *
   *  Na vista em níveis, qualquer nó: ali os nós têm fx/fy e o arraste não os
   *  move, então o gesto está livre. No modo Força, só o nó EM EVIDÊNCIA
   *  (balão aberto ou destaque fixado no clique) — no resto do mapa o arraste
   *  continua sendo o de reposicionar, e não faria sentido roubar a borda de
   *  todo nó do grafo para um gesto que interessa a um de cada vez. */
  const podeRedimensionar = useCallback(
    (node: SimNode) => fixedLayout || node.id === selectedId || node.id === pinnedId,
    [fixedLayout, selectedId, pinnedId],
  )

  /** Ponto do cursor na origem do canvas (a mesma de graph2ScreenCoords). */
  const pontoNoCanvas = useCallback((clientX: number, clientY: number) => {
    const canvas = wrapRef.current?.querySelector('canvas')
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    return { x: clientX - rect.left, y: clientY - rect.top }
  }, [])

  /** Nó cuja borda está sob o ponto (coordenadas de cliente), com a distância
   *  do cursor ao centro e o ângulo em que ele está — null fora de qualquer
   *  borda. Em empate (nós encavalados) ganha a borda mais próxima. */
  const alvoDoNo = useCallback(
    (clientX: number, clientY: number): AlvoBorda | null => {
      const fg = fgRef.current
      const p = pontoNoCanvas(clientX, clientY)
      if (!fg || p === null) return null
      const zoom = fg.zoom()
      let melhor: { alvo: AlvoBorda; erro: number } | null = null
      for (const node of data.nodes) {
        if (node.x === undefined || node.y === undefined) continue
        if (!podeRedimensionar(node)) continue
        const centro = fg.graph2ScreenCoords(node.x, node.y)
        const dx = p.x - centro.x
        const dy = p.y - centro.y
        const dist = Math.hypot(dx, dy)
        const theta = Math.atan2(dy, dx)
        // A faixa segue a SILHUETA, não um círculo em volta dela: no losango do
        // produto de dados o meio da aresta fica 29% dentro da ponta, e uma
        // faixa medida pela ponta ficaria bem fora do desenho nas diagonais.
        const raioBorda = raioNaDirecao(ehProdutoDeDados(node), raioDe(node), theta) * zoom
        if (!naBorda(dist, raioBorda)) continue
        const erro = Math.abs(dist - raioBorda)
        if (melhor === null || erro < melhor.erro) {
          melhor = { alvo: { tipo: 'no', id: node.id, dist, theta }, erro }
        }
      }
      return melhor?.alvo ?? null
    },
    [data, podeRedimensionar, raioDe, pontoNoCanvas],
  )

  /** Faixa cuja BORDA DIREITA está sob o ponto — null fora de qualquer borda.
   *
   *  O gesto exige o cursor DENTRO da altura da faixa: a borda é uma linha, não
   *  uma coluna infinita, e sem isso um press no vazio do topo da tela viraria
   *  um redimensionamento. Some junto com as faixas quando "Mostrar níveis"
   *  está desligado — não há borda a pegar no que não está desenhado. */
  const alvoDaFaixa = useCallback(
    (clientX: number, clientY: number): AlvoBorda | null => {
      const fg = fgRef.current
      const p = pontoNoCanvas(clientX, clientY)
      if (!fg || p === null || !fixedLayout || levelColumns === null) return null
      const bordas = levelColumns.map((col) => fg.graph2ScreenCoords(bordaDireita(col), 0).x)
      const i = bordaDireitaSob(bordas, p.x, BORDA_TOL_PX)
      if (i < 0) return null
      const col = levelColumns[i]
      const topo = fg.graph2ScreenCoords(bordas[i], topoDaFaixa(col)).y
      const base = fg.graph2ScreenCoords(bordas[i], baseDaFaixa(col)).y
      if (p.y < topo || p.y > base) return null
      return { tipo: 'faixa', slug: col.slug, esquerda: bordaEsquerda(col) }
    },
    [fixedLayout, levelColumns, pontoNoCanvas],
  )

  /** A borda sob o cursor, seja de nó ou de faixa. O NÓ tem prioridade: ele é o
   *  alvo menor e está desenhado por cima; a borda da faixa passa longe de
   *  qualquer nó (95 unidades do centro da coluna), então na prática os dois
   *  nunca disputam o mesmo pixel. */
  const alvoDaBorda = useCallback(
    (clientX: number, clientY: number): AlvoBorda | null =>
      alvoDoNo(clientX, clientY) ?? alvoDaFaixa(clientX, clientY),
    [alvoDoNo, alvoDaFaixa],
  )

  /** Centro do nó em px de tela (mesma origem de alvoDaBorda) — relido a cada
   *  passo do arraste porque no modo Força a física pode continuar mexendo o
   *  nó enquanto a mão está no gesto. */
  const centroNaTela = useCallback(
    (id: string) => {
      const fg = fgRef.current
      const node = data.nodes.find((n) => n.id === id)
      if (!fg || !node || node.x === undefined || node.y === undefined) return null
      return fg.graph2ScreenCoords(node.x, node.y)
    },
    [data],
  )

  /** Gesto em curso. No nó, `angulo` acompanha o cursor para a marca e o cursor
   *  do mouse girarem junto com a mão; na faixa, `esquerda` é a borda presa
   *  contra a qual a largura é medida. */
  const gestoRef = useRef<Gesto | null>(null)
  /** Borda sob o cursor fora do gesto (affordance). */
  const bordaRef = useRef<AlvoBorda | null>(null)
  /** Último press na borda, para o duplo clique que restaura o tamanho. */
  const ultimoPressRef = useRef({ chave: '', t: 0 })
  /** O press atual é nosso: vale para o par pointerdown/mousedown (a ordem
   *  entre eles não é nossa) e sobrevive até o botão subir, para o `click`
   *  também morrer no caminho. */
  const pressNossoRef = useRef(false)
  /** O `click` que ainda vai sair do press que acabou de subir é nosso. */
  const clickNossoRef = useRef(false)

  // Os listeners nativos são registrados UMA vez (o gesto não pode perder o
  // mousemove porque uma prop mudou no meio dele) e leem o estado desta render
  // por aqui — o mesmo padrão dos atalhos de teclado do App.
  const vivoRef = useRef({
    alvoDaBorda,
    centroNaTela,
    pontoNoCanvas,
    escalas,
    onEscalaChange,
    larguras,
    onLarguraChange,
  })
  vivoRef.current = {
    alvoDaBorda,
    centroNaTela,
    pontoNoCanvas,
    escalas,
    onEscalaChange,
    larguras,
    onLarguraChange,
  }

  useEffect(() => {
    const wrap = wrapRef.current
    if (wrap === null) return
    const canvas = wrap.querySelector('canvas')

    /** Cursor do canvas: inline vence as classes `clickable`/`grabbable` que o
     *  force-graph liga e desliga; string vazia devolve o controle a ele. */
    const cursor = (valor: string) => {
      if (canvas instanceof HTMLCanvasElement) canvas.style.cursor = valor
    }

    /** Distância e ângulo do cursor até o centro do nó, na mesma origem em que
     *  alvoDaBorda mede (o canto do canvas). O centro é relido a cada passo:
     *  no modo Força a física pode continuar mexendo o nó durante o gesto. */
    const medirDoCentro = (id: string, e: MouseEvent) => {
      const centro = vivoRef.current.centroNaTela(id)
      const rect = canvas?.getBoundingClientRect()
      if (centro === null || rect === undefined) return null
      const dx = e.clientX - rect.left - centro.x
      const dy = e.clientY - rect.top - centro.y
      return { dist: Math.hypot(dx, dy), angulo: Math.atan2(dy, dx) }
    }

    // O press na borda é interceptado tanto no `pointerdown` (que arma o clique
    // do force-graph, no container) quanto no `mousedown` (que arma o d3-drag e
    // o d3-zoom, no canvas). Qual dos dois chega primeiro não é problema nosso:
    // o primeiro decide, a bandeira segura a decisão e o segundo só obedece.
    const aoPressionar = (e: MouseEvent) => {
      if (pressNossoRef.current) {
        e.stopPropagation()
        if (e.type === 'mousedown') e.preventDefault()
        return
      }
      if (e.button !== 0 || gestoRef.current !== null) return
      const alvo = vivoRef.current.alvoDaBorda(e.clientX, e.clientY)
      if (alvo === null) return
      pressNossoRef.current = true
      e.stopPropagation()
      // Sem o preventDefault o navegador começa uma seleção de texto arrastada
      // pela tela — o gesto todo ficaria com o mapa "pintado" de azul.
      if (e.type === 'mousedown') e.preventDefault()

      // DUPLO CLIQUE NA BORDA = restaura o tamanho daquele alvo (o nó ou a
      // coluna). Fica aqui, e não no onNodeClick do App, porque o press na
      // borda nunca chega à lib: o duplo clique no MIOLO de um nó continua
      // sendo "entrar em foco", como sempre foi.
      const agora = performance.now()
      const chave = chaveDoAlvo(alvo)
      const ultimo = ultimoPressRef.current
      ultimoPressRef.current = { chave, t: agora }
      if (ultimo.chave === chave && agora - ultimo.t < DBLCLICK_BORDA_MS) {
        ultimoPressRef.current = { chave: '', t: 0 }
        bordaRef.current = alvo
        if (alvo.tipo === 'no') vivoRef.current.onEscalaChange(alvo.id, FATOR_PADRAO)
        else vivoRef.current.onLarguraChange(alvo.slug, FAIXA_PADRAO)
        return
      }

      if (alvo.tipo === 'no') {
        const fatorInicial = fatorDe(vivoRef.current.escalas, alvo.id)
        gestoRef.current = {
          tipo: 'no',
          id: alvo.id,
          fatorInicial,
          distInicial: alvo.dist,
          angulo: alvo.theta,
          fator: fatorInicial,
        }
        cursor(cursorDaBorda(alvo.theta))
      } else {
        gestoRef.current = {
          tipo: 'faixa',
          slug: alvo.slug,
          esquerda: alvo.esquerda,
          fator: fatorDaFaixa(vivoRef.current.larguras, alvo.slug),
        }
        // A faixa só se estica na horizontal: um cursor de alça na direção
        // leste-oeste, o mesmo que cursorDaBorda dá para a borda leste de um nó.
        cursor(cursorDaBorda(0))
      }
    }

    /** Enquanto o gesto corre, nada de movimento chega ao force-graph: a
     *  posição de ponteiro dele congela e o nó sob a mão continua em hover, em
     *  vez de apagar quando o cursor sai de cima dele para esticar a borda. */
    const aoMover = (e: MouseEvent) => {
      const gesto = gestoRef.current
      if (gesto === null) return
      e.stopPropagation()
      if (e.type !== 'mousemove') return
      if (gesto.tipo === 'faixa') {
        const fg = fgRef.current
        const p = vivoRef.current.pontoNoCanvas(e.clientX, e.clientY)
        if (!fg || p === null) return
        // A conta é feita em unidades de GRAFO: a borda para exatamente onde a
        // mão parou, em qualquer zoom.
        gesto.fator = fatorArrastandoFaixa(gesto.esquerda, fg.screen2GraphCoords(p.x, p.y).x)
        cursor(cursorDaBorda(0))
        vivoRef.current.onLarguraChange(gesto.slug, gesto.fator)
        return
      }
      const medida = medirDoCentro(gesto.id, e)
      if (medida === null) return
      gesto.angulo = medida.angulo
      gesto.fator = fatorArrastando(gesto.fatorInicial, gesto.distInicial, medida.dist)
      cursor(cursorDaBorda(gesto.angulo))
      vivoRef.current.onEscalaChange(gesto.id, gesto.fator)
    }

    const aoSoltar = (e: MouseEvent) => {
      if (!pressNossoRef.current && gestoRef.current === null) return
      e.stopPropagation()
      if (e.type !== 'mouseup') return
      clickNossoRef.current = pressNossoRef.current
      pressNossoRef.current = false
      if (gestoRef.current === null) return
      gestoRef.current = null
      cursor('')
    }

    /** O `click` sintético do navegador sai mesmo com o mousedown barrado — e
     *  ele vem DEPOIS do mouseup, quando pressNosso já baixou. Barrado aqui
     *  também, o press na borda não vira clique de coisa nenhuma. */
    const aoClicar = (e: MouseEvent) => {
      if (!clickNossoRef.current) return
      clickNossoRef.current = false
      e.stopPropagation()
      e.preventDefault()
    }

    /** Fora do gesto: descobre a borda sob o cursor, troca o cursor do mouse e
     *  acende a marca (a leitura acontece no drawNode, por ref, sem re-render —
     *  o canvas já redesenha todo frame). */
    const aoPassar = (e: MouseEvent) => {
      if (gestoRef.current !== null) return
      const alvo = vivoRef.current.alvoDaBorda(e.clientX, e.clientY)
      if (alvo === null) {
        if (bordaRef.current !== null) {
          bordaRef.current = null
          cursor('')
        }
        return
      }
      bordaRef.current = alvo
      cursor(cursorDaBorda(alvo.tipo === 'no' ? alvo.theta : 0))
    }

    const aoSair = () => {
      if (gestoRef.current !== null) return
      bordaRef.current = null
      cursor('')
    }

    // O press é interceptado no div que embrulha o grafo (ancestral do
    // container e do canvas); o resto do gesto corre na janela, porque a mão sai
    // do nó — e às vezes do próprio mapa — enquanto estica a borda.
    wrap.addEventListener('pointerdown', aoPressionar, true)
    wrap.addEventListener('mousedown', aoPressionar, true)
    wrap.addEventListener('mousemove', aoPassar)
    wrap.addEventListener('mouseleave', aoSair)
    window.addEventListener('pointermove', aoMover, true)
    window.addEventListener('mousemove', aoMover, true)
    window.addEventListener('pointerup', aoSoltar, true)
    window.addEventListener('mouseup', aoSoltar, true)
    window.addEventListener('click', aoClicar, true)
    return () => {
      wrap.removeEventListener('pointerdown', aoPressionar, true)
      wrap.removeEventListener('mousedown', aoPressionar, true)
      wrap.removeEventListener('mousemove', aoPassar)
      wrap.removeEventListener('mouseleave', aoSair)
      window.removeEventListener('pointermove', aoMover, true)
      window.removeEventListener('mousemove', aoMover, true)
      window.removeEventListener('pointerup', aoSoltar, true)
      window.removeEventListener('mouseup', aoSoltar, true)
      window.removeEventListener('click', aoClicar, true)
      gestoRef.current = null
      bordaRef.current = null
      pressNossoRef.current = false
    }
  }, [])

  // Nó que perdeu o direito ao gesto no meio do caminho (o destaque saiu dele,
  // a vista mudou, ele sumiu do grafo): a marca de borda não pode ficar acesa
  // apontando um gesto que não existe mais.
  useEffect(() => {
    const borda = bordaRef.current
    if (borda === null) return
    if (borda.tipo === 'faixa') {
      // "Mostrar níveis" desligado, ou a coluna sumiu: não há borda a oferecer.
      if (levelColumns === null || !levelColumns.some((c) => c.slug === borda.slug)) {
        bordaRef.current = null
      }
      return
    }
    const node = data.nodes.find((n) => n.id === borda.id)
    if (!node || !podeRedimensionar(node)) bordaRef.current = null
  }, [data, podeRedimensionar, levelColumns])

  const handleEngineStop = useCallback(() => {
    if (!settledRef.current) {
      settledRef.current = true
      if (initialFocusId) focusNode(initialFocusId)
      else fitView(500)
      return
    }
    if (pendingFitRef.current) {
      pendingFitRef.current = false
      fitView(400)
    }
  }, [initialFocusId, focusNode, fitView])

  // Faixas dos níveis, desenhadas sob arestas e nós (onRenderFramePre roda
  // antes do grafo, já no espaço de coordenadas do grafo): um retângulo com
  // cabeçalho por coluna e, entre faixas vizinhas, um chevron "‹" apontando o
  // sentido do fluxo do dado (da última coluna, à direita, para a primeira, à
  // esquerda) — discreto de propósito: as arestas já têm setas, o chevron só
  // reforça a leitura do conjunto.
  const drawLevelBands = useCallback(
    (ctx: CanvasRenderingContext2D, scale: number) => {
      if (!levelColumns || levelColumns.length === 0) return
      const tops = levelColumns.map(topoDaFaixa)
      const gesto = gestoRef.current
      const borda = bordaRef.current
      ctx.save()
      levelColumns.forEach((col, i) => {
        const top = tops[i]
        const height = baseDaFaixa(col) - top
        // Cores do próprio nível quando ele as declara, já com o alpha que as
        // deixa conviver com o tema escuro; sem cor, o neutro de sempre.
        const cores = coresDaFaixa(col)
        ctx.beginPath()
        ctx.roundRect(bordaEsquerda(col), top, col.largura, height, BAND_RADIUS)
        ctx.fillStyle = cores.fill
        ctx.fill()
        ctx.strokeStyle = cores.stroke
        ctx.lineWidth = 1 / scale
        ctx.stroke()

        // AFFORDANCE da borda da faixa, pela mesma lógica da borda do nó: o
        // cursor de alça já diz que ali se redimensiona, e a marca diz ONDE.
        // Aqui ela é uma barra vertical sobre a divisa, com dois riscos no meio
        // — o desenho universal de divisor arrastável de coluna.
        const ativa =
          gesto !== null && gesto.tipo === 'faixa' && gesto.slug === col.slug
            ? gesto.fator
            : gesto === null && borda !== null && borda.tipo === 'faixa' && borda.slug === col.slug
              ? null
              : undefined
        if (ativa !== undefined) {
          const x = bordaDireita(col)
          ctx.save()
          ctx.beginPath()
          ctx.moveTo(x, top + BAND_RADIUS)
          ctx.lineTo(x, top + height - BAND_RADIUS)
          ctx.strokeStyle = 'rgba(255,255,255,0.6)'
          ctx.lineWidth = 2 / scale
          ctx.lineCap = 'round'
          ctx.stroke()
          const meio = top + height / 2
          for (const dy of [-4 / scale, 0, 4 / scale]) {
            ctx.beginPath()
            ctx.moveTo(x - 3 / scale, meio + dy)
            ctx.lineTo(x + 3 / scale, meio + dy)
            ctx.lineWidth = 1.2 / scale
            ctx.stroke()
          }
          if (ativa !== null) {
            ctx.font = `${9 / scale}px system-ui, sans-serif`
            ctx.textAlign = 'left'
            ctx.textBaseline = 'middle'
            ctx.fillStyle = noLimiteDaFaixa(ativa)
              ? 'rgba(255,196,90,0.95)'
              : 'rgba(255,255,255,0.85)'
            // O mesmo indicador do gesto do nó: quanto a coluna está em relação
            // ao tamanho padrão, não a medida bruta — é o número que diz de
            // quanto ainda dá para puxar.
            ctx.fillText(`${ativa.toFixed(2)}×`, x + 6 / scale, top + 12 / scale)
          }
          ctx.restore()
        }

        // Cabeçalho em caps espaçadas, tamanho fixo em unidades de grafo
        // (acompanha o zoom junto com o resto da cena).
        ctx.font = '600 11px system-ui, sans-serif'
        ctx.letterSpacing = '1.5px'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillStyle = cores.titulo
        ctx.fillText(col.label.toUpperCase(), col.x, top + 10)
        ctx.letterSpacing = '0px'

        // Chevron no corredor entre esta faixa e a anterior, no centro
        // vertical comum (as colunas são centradas em y=0).
        if (i === 0) return
        // O chevron mora no MEIO DO CORREDOR — entre onde a faixa anterior
        // termina e onde esta começa —, não no meio dos centros: com larguras
        // diferentes as duas contas divergem, e é o corredor que ele marca.
        const cx = (bordaDireita(levelColumns[i - 1]) + bordaEsquerda(col)) / 2
        ctx.beginPath()
        ctx.moveTo(cx + 4, -6)
        ctx.lineTo(cx - 4, 0)
        ctx.lineTo(cx + 4, 6)
        ctx.strokeStyle = 'rgba(255,255,255,0.22)'
        ctx.lineWidth = 1.6
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.stroke()
      })
      ctx.restore()
    },
    [levelColumns],
  )

  // AFFORDANCE do gesto de borda. O usuário precisa DESCOBRIR que a borda pega
  // sem ler manual, e são duas marcas somadas, cada uma resolvendo uma metade:
  //
  //   • o CURSOR do sistema (ns/ew/nesw/nwse-resize, escolhido pela direção —
  //     ver cursorDaBorda) é o que diz "aqui se redimensiona": é o mesmo cursor
  //     da alça de qualquer janela, e ninguém precisa aprender nada;
  //   • o CONTORNO tracejado + o PUNHO na direção do cursor dizem ONDE pega e
  //     em que direção puxar — o punho anda pela silhueta acompanhando a mão,
  //     que é o que denuncia que o alvo é a borda inteira, não um canto.
  //
  // Durante o arraste entra o fator em texto, que âmbar avisa quando bateu no
  // limite (o nó parou de crescer porque acabou, não porque travou).
  const drawBordaAtiva = useCallback(
    (
      node: SimNode,
      ctx: CanvasRenderingContext2D,
      scale: number,
      r: number,
      angulo: number,
      fator: number | null,
    ) => {
      const x = node.x ?? 0
      const y = node.y ?? 0
      const produto = ehProdutoDeDados(node)
      ctx.save()
      ctx.globalAlpha = 1
      traceShape(ctx, produto, x, y, r)
      ctx.setLineDash([4 / scale, 3 / scale])
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'
      ctx.lineWidth = 1.5 / scale
      ctx.stroke()
      ctx.setLineDash([])

      const raioBorda = raioNaDirecao(produto, r, angulo)
      const hx = x + Math.cos(angulo) * raioBorda
      const hy = y + Math.sin(angulo) * raioBorda
      ctx.beginPath()
      ctx.arc(hx, hy, 3 / scale, 0, 2 * Math.PI)
      ctx.fillStyle = 'rgba(255,255,255,0.95)'
      ctx.fill()

      if (fator !== null) {
        ctx.font = `${9 / scale}px system-ui, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillStyle = noLimite(fator) ? 'rgba(255,196,90,0.95)' : 'rgba(255,255,255,0.85)'
        const fora = raioBorda + 14 / scale
        ctx.fillText(`${fator.toFixed(2)}×`, x + Math.cos(angulo) * fora, y + Math.sin(angulo) * fora)
      }
      ctx.restore()
    },
    [],
  )

  const drawNode = useCallback(
    (node: SimNode, ctx: CanvasRenderingContext2D, scale: number) => {
      const x = node.x ?? 0
      const y = node.y ?? 0
      const r = raioDe(node)
      const extent = extentDoNo(node, r)
      const dimmed = dimmedIds.has(node.id)
      const produto = ehProdutoDeDados(node)
      ctx.globalAlpha = dimmed ? DIM_ALPHA : 1

      // FORMA = produto de dados: losango quando é, círculo quando não é (ver
      // shapes.ts). Nó fantasma nunca é produto — ele não tem linha no catálogo
      // onde declarar a bandeira —, então cai sempre no círculo.
      traceShape(ctx, produto, x, y, r)
      if (node.fantasma === true) {
        // Citado sem linha no catálogo: sem preenchimento sólido, contorno
        // cinza tracejado.
        ctx.fillStyle = 'rgba(90, 90, 90, 0.25)'
        ctx.fill()
        ctx.setLineDash([3 / scale, 2 / scale])
        ctx.strokeStyle = '#8A8A8A'
        ctx.lineWidth = 1.4 / scale
        ctx.stroke()
        ctx.setLineDash([])
      } else {
        ctx.fillStyle = nodeColor(node)
        ctx.fill()
        if (node.incompleto === true) {
          // Gap de governança (sem owner ou sem centro de custo): borda branca
          // tracejada sobre a própria silhueta — acompanha a forma, então o
          // losango do produto de dados a recebe nas suas quatro arestas e as
          // duas leituras convivem no mesmo nó. Foi o que derrubou o octógono:
          // lá o tracejado apagava os cantos, que eram a marca inteira. Aqui
          // ele pode comer um pedaço de aresta que as quatro pontas continuam
          // apontando — e o negrito do rótulo não depende da borda nenhuma.
          ctx.setLineDash([3 / scale, 2.2 / scale])
          ctx.strokeStyle = '#FFFFFF'
          ctx.lineWidth = 1.6 / scale
          ctx.stroke()
          ctx.setLineDash([])
        }
        // ÍCONE = tipo de componente, dentro do nó e só quando ele está grande
        // o bastante na tela para o glifo informar em vez de sujar.
        if (glifoVisivel(r, scale)) drawGlifo(ctx, tipoComponenteDe(node), x, y, r)
      }

      // Halo: seleção (balão) forte; hover e "hover fixado" com o mesmo traço.
      if (node.id === selectedId || node.id === hoverId || node.id === pinnedId) {
        ctx.beginPath()
        ctx.arc(x, y, raioHalo(extent, scale), 0, 2 * Math.PI)
        ctx.strokeStyle =
          node.id === selectedId ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.5)'
        ctx.lineWidth = (node.id === selectedId ? 1.6 : 1.2) / scale
        ctx.stroke()
      }

      // RÓTULO = o segundo canal da bandeira de produto de dados (ver
      // shapes.ts). O nome é desenhado em tamanho de TELA (10/scale em
      // coordenadas de grafo), então ele é a única marca do nó que não encolhe
      // com o zoom: quando o mapa inteiro cabe na janela e os nós viram pontos
      // de poucos pixels, o texto continua legível e o negrito continua
      // distinguindo. É a metade da leitura que a forma não alcança.
      //
      // O esmaecimento de foco é ORTOGONAL a isso: um produto de dados fora do
      // destaque atual esmaece como qualquer outro nó, mas esmaece em negrito.
      // O rótulo acompanha o zoom entre um piso e um teto, medidos em px de
      // TELA. Fixo em 10px ele "encolhia" ao ampliar — o nó crescia e o texto
      // não —, e num zoom muito afastado viraria um borrão maior que o próprio
      // nó. O piso mantém a legibilidade; o teto evita o rótulo virar cartaz.
      const fonteTela = Math.min(26, Math.max(10, 10 * scale))
      const fontSize = fonteTela / scale
      ctx.font = `${pesoDoRotulo(produto)} ${fontSize}px system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillStyle = dimmed
        ? 'rgba(255,255,255,0.6)'
        : // Produto de dados no branco pleno; os demais um passo abaixo. O
          // negrito é o sinal, e este é o reforço que vem de graça — mesma
          // tinta, sem nenhum traço novo no mapa.
          produto
          ? 'rgba(255,255,255,1)'
          : 'rgba(255,255,255,0.88)'
      ctx.fillText(node.nome, x, y + extent + 3 / scale)
      ctx.globalAlpha = 1

      // O gesto em curso manda na marca; sem gesto, a borda sob o cursor. Lido
      // por ref de propósito: são dezenas de eventos de mouse por segundo, e o
      // canvas já redesenha todo frame (autoPauseRedraw={false}) — nada disso
      // precisa passar por re-render do React.
      const gesto = gestoRef.current
      if (gesto !== null && gesto.tipo === 'no' && gesto.id === node.id) {
        drawBordaAtiva(node, ctx, scale, r, gesto.angulo, gesto.fator)
        return
      }
      const borda = bordaRef.current
      if (gesto === null && borda !== null && borda.tipo === 'no' && borda.id === node.id) {
        drawBordaAtiva(node, ctx, scale, r, borda.theta, null)
      }
    },
    [raioDe, dimmedIds, hoverId, pinnedId, selectedId, drawBordaAtiva],
  )

  const paintPointerArea = useCallback(
    (node: SimNode, color: string, ctx: CanvasRenderingContext2D) => {
      const r = extentDoNo(node, raioDe(node))
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(node.x ?? 0, node.y ?? 0, r + 3, 0, 2 * Math.PI)
      ctx.fill()
    },
    [raioDe],
  )

  // Arestas acesas do nó "ativo": hover momentâneo sobrepõe o fixado, que por
  // sua vez sobrepõe o nó do balão.
  const activeId = hoverId ?? pinnedId ?? selectedId
  const linkTouchesActive = useCallback(
    (link: SimLink) =>
      activeId !== null &&
      (linkEndId(link.source) === activeId || linkEndId(link.target) === activeId),
    [activeId],
  )

  // Com "Mostrar associações" desligado o grafo fica só com os nós; as arestas
  // do destaque atual continuam visíveis (mesma regra do esmaecimento: o que
  // não está em dimmedIds é o que está em foco).
  const linkVisible = useCallback(
    (link: SimLink) => {
      if (assocOn) return true
      if (activeId === null) return false
      return !dimmedIds.has(linkEndId(link.source)) && !dimmedIds.has(linkEndId(link.target))
    },
    [assocOn, activeId, dimmedIds],
  )

  const linkColor = useCallback(
    (link: SimLink) => {
      if (linkTouchesActive(link)) return 'rgba(255,255,255,0.85)'
      const dim =
        dimmedIds.has(linkEndId(link.source)) || dimmedIds.has(linkEndId(link.target))
      return dim ? 'rgba(150,150,150,0.05)' : 'rgba(150,150,150,0.3)'
    },
    [dimmedIds, linkTouchesActive],
  )

  return (
    // O menu de contexto do navegador é suprimido sobre o canvas: o botão
    // direito é a ação de "abrir detalhes" do mapa. Este div também é onde o
    // gesto de redimensionar pela borda intercepta o ponteiro na captura, antes
    // do force-graph (ver o efeito acima).
    <div ref={wrapRef} onContextMenu={(e) => e.preventDefault()}>
      <ForceGraph2D<GraphNodeData, GraphLinkData>
        ref={fgRef}
        graphData={data}
        width={size.w}
        height={size.h}
        backgroundColor={BACKGROUND}
        cooldownTicks={fixedLayout ? 0 : 150}
        onEngineStop={handleEngineStop}
        onRenderFramePre={fixedLayout ? drawLevelBands : undefined}
        linkCurvature={fixedLayout ? 0.18 : 0}
        autoPauseRedraw={false}
        nodeLabel={() => ''}
        nodeCanvasObject={drawNode}
        nodePointerAreaPaint={paintPointerArea}
        linkVisibility={linkVisible}
        linkColor={linkColor}
        linkWidth={(l) => (linkTouchesActive(l) ? 1.6 : 1)}
        linkDirectionalArrowLength={3.5}
        linkDirectionalArrowRelPos={1}
        linkDirectionalArrowColor={linkColor}
        linkLabel={(l) => l.label ?? 'consome'}
        onNodeClick={(node) => onNodeClick(node.id)}
        onNodeRightClick={(node) => onNodeRightClick(node.id)}
        onNodeHover={(node) => onNodeHover(node ? node.id : null)}
        onBackgroundClick={onBackgroundClick}
      />
    </div>
  )
}
