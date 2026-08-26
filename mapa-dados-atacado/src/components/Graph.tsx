import { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import type { Ref } from 'react'
import type { GraphLinkData, GraphMethods, GraphNodeData, SimLink, SimNode } from './graph-types'
import { linkEndId, tipoComponenteDe } from './graph-types'
import type { LineageColumn } from './lineage'
import { extentOf, traceShape } from './shapes'
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
   *  nível, desenhado sob nós e arestas; null fora da vista em níveis. */
  levelColumns: LineageColumn[] | null
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

function radiusOf(degree: number): number {
  return 4 + Math.sqrt(degree) * 2.2
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

/** Extensão visual do nó além do centro (halo, âncora do balão e rótulo). */
function extentDoNo(node: SimNode, r: number): number {
  return extentOf(tipoComponenteDe(node), r)
}

/** Faixas da vista em níveis (coordenadas de grafo — escalam com o zoom).
 *  Largura menor que NIVEIS_COL_X (250) deixa um corredor entre faixas onde
 *  as arestas cruzam e o chevron de fluxo aparece. */
const BAND_W = 190
/** Folga acima do primeiro nó: extensão do nó (~16) + respiro + cabeçalho. */
const BAND_PAD_TOP = 46
/** Folga abaixo do último nó: extensão + rótulo do nó (fonte 10 + margem). */
const BAND_PAD_BOTTOM = 36
const BAND_RADIUS = 12
const BAND_FILL = 'rgba(255,255,255,0.03)'
const BAND_STROKE = 'rgba(255,255,255,0.10)'
const BAND_TITLE_COLOR = '#8A8A8A'

/** Raio mínimo NA TELA (px) para o glifo do Databricks aparecer — abaixo
 *  disso os tijolos viram ruído. */
const GLYPH_MIN_PX = 8

/** Glifo inspirado no logo do Databricks: três "tijolos" (paralelogramos)
 *  empilhados, em branco translúcido sobre a cor do nó. Marca as Tabelas Delta
 *  — o tipo de componente que vive no lakehouse. Canvas puro: o standalone
 *  continua autocontido. */
function drawDatabricksGlyph(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  const w = r * 0.42 // meia-largura de cada tijolo
  const h = r * 0.12 // meia-altura
  const skew = r * 0.2 // inclinação: topo deslocado à direita
  ctx.fillStyle = 'rgba(255,255,255,0.8)'
  for (const k of [-0.34, 0, 0.34]) {
    const cy = y + k * r
    ctx.beginPath()
    ctx.moveTo(x - w + skew, cy - h)
    ctx.lineTo(x + w, cy - h)
    ctx.lineTo(x + w - skew, cy + h)
    ctx.lineTo(x - w, cy + h)
    ctx.closePath()
    ctx.fill()
  }
}

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
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight })

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
      const extent = extentDoNo(node, radiusOf(visualDegree(node, degreeById)))
      return { x, y, r: extent * fg.zoom() }
    },
    [data, degreeById],
  )

  useImperativeHandle(ref, () => ({ focusNode, nodeScreenPosition }), [
    focusNode,
    nodeScreenPosition,
  ])

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
      const tops = levelColumns.map((c) => c.yMin - BAND_PAD_TOP)
      ctx.save()
      levelColumns.forEach((col, i) => {
        const top = tops[i]
        const height = col.yMax + BAND_PAD_BOTTOM - top
        ctx.beginPath()
        ctx.roundRect(col.x - BAND_W / 2, top, BAND_W, height, BAND_RADIUS)
        ctx.fillStyle = BAND_FILL
        ctx.fill()
        ctx.strokeStyle = BAND_STROKE
        ctx.lineWidth = 1 / scale
        ctx.stroke()

        // Cabeçalho em caps espaçadas, tamanho fixo em unidades de grafo
        // (acompanha o zoom junto com o resto da cena).
        ctx.font = '600 11px system-ui, sans-serif'
        ctx.letterSpacing = '1.5px'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillStyle = BAND_TITLE_COLOR
        ctx.fillText(col.label.toUpperCase(), col.x, top + 10)
        ctx.letterSpacing = '0px'

        // Chevron no corredor entre esta faixa e a anterior, no centro
        // vertical comum (as colunas são centradas em y=0).
        if (i === 0) return
        const cx = (levelColumns[i - 1].x + col.x) / 2
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

  const drawNode = useCallback(
    (node: SimNode, ctx: CanvasRenderingContext2D, scale: number) => {
      const x = node.x ?? 0
      const y = node.y ?? 0
      const r = radiusOf(visualDegree(node, degreeById))
      const extent = extentDoNo(node, r)
      const dimmed = dimmedIds.has(node.id)
      ctx.globalAlpha = dimmed ? DIM_ALPHA : 1

      traceShape(ctx, tipoComponenteDe(node), x, y, r)
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
          // tracejada sobre a própria silhueta.
          ctx.setLineDash([3 / scale, 2.2 / scale])
          ctx.strokeStyle = '#FFFFFF'
          ctx.lineWidth = 1.6 / scale
          ctx.stroke()
          ctx.setLineDash([])
        }
        // O losango da Tabela Delta ganha o glifo de tijolos: reforça a leitura
        // da forma girada, que é a mais fácil de confundir no raio mínimo.
        if (tipoComponenteDe(node) === 'Tabela Delta' && r * scale >= GLYPH_MIN_PX) {
          drawDatabricksGlyph(ctx, x, y, r)
        }
      }

      // Halo: seleção (balão) forte; hover e "hover fixado" com o mesmo traço.
      if (node.id === selectedId || node.id === hoverId || node.id === pinnedId) {
        ctx.beginPath()
        ctx.arc(x, y, extent + 2.5 / scale, 0, 2 * Math.PI)
        ctx.strokeStyle =
          node.id === selectedId ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.5)'
        ctx.lineWidth = (node.id === selectedId ? 1.6 : 1.2) / scale
        ctx.stroke()
      }

      const fontSize = 10 / scale
      ctx.font = `${fontSize}px system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillStyle = dimmed ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.88)'
      ctx.fillText(node.nome, x, y + extent + 3 / scale)
      ctx.globalAlpha = 1
    },
    [degreeById, dimmedIds, hoverId, pinnedId, selectedId],
  )

  const paintPointerArea = useCallback(
    (node: SimNode, color: string, ctx: CanvasRenderingContext2D) => {
      const r = extentDoNo(node, radiusOf(visualDegree(node, degreeById)))
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(node.x ?? 0, node.y ?? 0, r + 3, 0, 2 * Math.PI)
      ctx.fill()
    },
    [degreeById],
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
    // direito é a ação de "abrir detalhes" do mapa.
    <div onContextMenu={(e) => e.preventDefault()}>
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
