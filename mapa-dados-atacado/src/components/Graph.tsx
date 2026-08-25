import { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import type { Ref } from 'react'
import type { GraphLinkData, GraphMethods, GraphNodeData, SimLink, SimNode } from './graph-types'
import { isRaiz, linkEndId, nodeKind } from './graph-types'
import { BACKGROUND, PLACEHOLDER_FILL, PLACEHOLDER_STROKE, nodeColor } from './palette'

export interface GraphHandle {
  /** Centraliza e dá zoom no nó (usado por painel, busca e ?no= da URL). */
  focusNode(id: string): void
}

interface GraphProps {
  data: { nodes: SimNode[]; links: SimLink[] }
  degreeById: ReadonlyMap<string, number>
  /** Conjunto final de nós esmaecidos (hover + filtros, calculado no App). */
  dimmedIds: ReadonlySet<string>
  hoverId: string | null
  selectedId: string | null
  /** Nó a centralizar quando a física estabilizar (seleção vinda da URL). */
  initialFocusId: string | null
  /** Vista em níveis: todos os nós vêm com fx/fy — física desligada,
   *  arestas levemente curvas e enquadramento a cada troca de dados. */
  fixedLayout: boolean
  onNodeClick(id: string): void
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

/** Nó-raiz: raio fixo de protagonista, independente do grau. */
const RAIZ_RADIUS = 14
/** Circunraio do hexágono da raiz com área ~equivalente ao círculo. */
const HEX_SCALE = 1.1

export default function Graph({
  data,
  degreeById,
  dimmedIds,
  hoverId,
  selectedId,
  initialFocusId,
  fixedLayout,
  onNodeClick,
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

  // Mudou o conjunto visível (camadas/foco): re-simulação curta + zoomToFit.
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

  useImperativeHandle(ref, () => ({ focusNode }), [focusNode])

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

  const drawNode = useCallback(
    (node: SimNode, ctx: CanvasRenderingContext2D, scale: number) => {
      const x = node.x ?? 0
      const y = node.y ?? 0
      const raiz = isRaiz(node)
      // Placeholders não existem no grafo global (sem grau): raio mínimo legível.
      const r = raiz ? RAIZ_RADIUS : radiusOf(degreeById.get(node.id) ?? (node.placeholder ? 2 : 0))
      // Extensão visual além do centro: vértice do hexágono da raiz ou o raio.
      const extent = raiz ? r * HEX_SCALE : r
      const dimmed = dimmedIds.has(node.id)
      const kind = nodeKind(node)
      ctx.globalAlpha = dimmed ? DIM_ALPHA : 1

      ctx.beginPath()
      if (raiz) {
        // Hexágono de topo pontudo: forma exclusiva do nó-raiz.
        for (let i = 0; i < 6; i++) {
          const a = -Math.PI / 2 + (i * Math.PI) / 3
          const px = x + extent * Math.cos(a)
          const py = y + extent * Math.sin(a)
          if (i === 0) ctx.moveTo(px, py)
          else ctx.lineTo(px, py)
        }
        ctx.closePath()
      } else if (kind === 'sistema') {
        // Quadrado com área ~equivalente ao círculo de raio r.
        const s = r * 0.9
        ctx.rect(x - s, y - s, 2 * s, 2 * s)
      } else if (kind === 'origem') {
        // Losango (quadrado rotacionado 45°).
        const s = r * 1.15
        ctx.moveTo(x, y - s)
        ctx.lineTo(x + s, y)
        ctx.lineTo(x, y + s)
        ctx.lineTo(x - s, y)
        ctx.closePath()
      } else {
        ctx.arc(x, y, r, 0, 2 * Math.PI)
      }
      if (kind !== 'dado') {
        if (node.placeholder) {
          // Fonte/origem desconhecida (vista de linhagem): cinza tracejado.
          ctx.fillStyle = PLACEHOLDER_FILL
          ctx.fill()
          ctx.setLineDash([3 / scale, 2 / scale])
          ctx.strokeStyle = PLACEHOLDER_STROKE
          ctx.lineWidth = 1.4 / scale
          ctx.stroke()
          ctx.setLineDash([])
        } else {
          // Derivados: preenchimento sólido, nunca borda de incompletude.
          ctx.fillStyle = nodeColor(node)
          ctx.fill()
        }
      } else if (node.fantasma) {
        // Fantasma: sem preenchimento sólido, contorno cinza tracejado.
        ctx.fillStyle = 'rgba(90, 90, 90, 0.25)'
        ctx.fill()
        ctx.setLineDash([3 / scale, 2 / scale])
        ctx.strokeStyle = '#8A8A8A'
        ctx.lineWidth = 1.4 / scale
        ctx.stroke()
        ctx.setLineDash([])
      } else {
        const cor = nodeColor(node)
        ctx.fillStyle = cor
        ctx.fill()
        if (node.incompleto) {
          // Gap de governança: borda branca tracejada.
          ctx.setLineDash([3 / scale, 2.2 / scale])
          ctx.strokeStyle = '#FFFFFF'
          ctx.lineWidth = 1.6 / scale
          ctx.stroke()
          ctx.setLineDash([])
        }
        if (node.nivel === 'secundario' || node.nivel === 'ambos') {
          // Produto final: anel externo fino na cor do nó, por fora da borda
          // tracejada de incompletude (e do halo de seleção/hover).
          ctx.beginPath()
          ctx.arc(x, y, r + 3.6 / scale, 0, 2 * Math.PI)
          ctx.strokeStyle = cor
          ctx.lineWidth = 1.1 / scale
          ctx.stroke()
        }
      }

      if (node.id === selectedId || node.id === hoverId) {
        ctx.beginPath()
        ctx.arc(x, y, extent + 2.5 / scale, 0, 2 * Math.PI)
        ctx.strokeStyle =
          node.id === selectedId ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.5)'
        ctx.lineWidth = (node.id === selectedId ? 1.6 : 1.2) / scale
        ctx.stroke()
      }

      // Raiz: rótulo um pouco maior e em peso semibold (protagonista).
      const fontSize = (raiz ? 12.5 : 10) / scale
      ctx.font = `${raiz ? '600 ' : ''}${fontSize}px system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillStyle = dimmed ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.88)'
      ctx.fillText(node.nome, x, y + extent + 3 / scale)
      ctx.globalAlpha = 1
    },
    [degreeById, dimmedIds, hoverId, selectedId],
  )

  const paintPointerArea = useCallback(
    (node: SimNode, color: string, ctx: CanvasRenderingContext2D) => {
      const r = isRaiz(node) ? RAIZ_RADIUS * HEX_SCALE : radiusOf(degreeById.get(node.id) ?? 0)
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(node.x ?? 0, node.y ?? 0, r + 3, 0, 2 * Math.PI)
      ctx.fill()
    },
    [degreeById],
  )

  const linkTouchesHover = useCallback(
    (link: SimLink) =>
      hoverId !== null &&
      (linkEndId(link.source) === hoverId || linkEndId(link.target) === hoverId),
    [hoverId],
  )

  const linkColor = useCallback(
    (link: SimLink) => {
      if (linkTouchesHover(link)) return 'rgba(255,255,255,0.85)'
      const dim =
        dimmedIds.has(linkEndId(link.source)) || dimmedIds.has(linkEndId(link.target))
      return dim ? 'rgba(150,150,150,0.05)' : 'rgba(150,150,150,0.3)'
    },
    [dimmedIds, linkTouchesHover],
  )

  return (
    <ForceGraph2D<GraphNodeData, GraphLinkData>
      ref={fgRef}
      graphData={data}
      width={size.w}
      height={size.h}
      backgroundColor={BACKGROUND}
      cooldownTicks={fixedLayout ? 0 : 150}
      onEngineStop={handleEngineStop}
      linkCurvature={fixedLayout ? 0.18 : 0}
      autoPauseRedraw={false}
      nodeLabel={() => ''}
      nodeCanvasObject={drawNode}
      nodePointerAreaPaint={paintPointerArea}
      linkColor={linkColor}
      linkWidth={(l) => (linkTouchesHover(l) ? 1.6 : 1)}
      linkDirectionalArrowLength={3.5}
      linkDirectionalArrowRelPos={1}
      linkDirectionalArrowColor={linkColor}
      linkLabel={(l) => l.label ?? 'consome'}
      onNodeClick={(node) => onNodeClick(node.id)}
      onNodeHover={(node) => onNodeHover(node ? node.id : null)}
      onBackgroundClick={onBackgroundClick}
    />
  )
}
