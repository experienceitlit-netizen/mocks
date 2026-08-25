import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import graphJson from './data/graph.json'
import Graph from './components/Graph'
import type { GraphHandle } from './components/Graph'
import DetailPanel from './components/DetailPanel'
import type { Connection } from './components/DetailPanel'
import SearchBox from './components/SearchBox'
import Filters from './components/Filters'
import FocusBar from './components/FocusBar'
import type { Vista } from './components/FocusBar'
import Legend from './components/Legend'
import type { Counts } from './components/Filters'
import type { Debito, GraphJson, GraphNodeData, SimLink, SimNode } from './components/graph-types'
import { isDerivado, linkEndId } from './components/graph-types'
import { buildLineage, buildLineageTree } from './components/lineage'
import './App.css'

/** Busca insensível a caixa e acentos. */
function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function readUrlSelection(): string | null {
  return new URLSearchParams(window.location.search).get('no')
}

function readUrlFocus(): string | null {
  return new URLSearchParams(window.location.search).get('foco')
}

function readUrlDepth(): number {
  const raw = Number(new URLSearchParams(window.location.search).get('prof'))
  return Number.isInteger(raw) && raw >= 1 && raw <= 3 ? raw : 1
}

/** ?vista=niveis|forca; ausente (links antigos com ?foco=) = níveis. */
function readUrlVista(): Vista {
  return new URLSearchParams(window.location.search).get('vista') === 'forca' ? 'forca' : 'niveis'
}

function toggled<T>(set: ReadonlySet<T>, value: T): Set<T> {
  const next = new Set(set)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
}

/** Janela entre dois cliques no mesmo nó para contar como duplo clique. */
const DBLCLICK_MS = 350

function App() {
  // O JSON gerado tipa `debito` como string larga; o schema real é GraphJson.
  const { nodes, links } = graphJson as GraphJson

  // A lib de força muta os objetos (injeta x/y) — clona uma única vez.
  const simData = useMemo<{ nodes: SimNode[]; links: SimLink[] }>(
    () => ({
      nodes: nodes.map((n) => ({ ...n })),
      links: links.map((l) => ({ ...l })),
    }),
    [nodes, links],
  )

  const nodesById = useMemo(() => {
    const map = new Map<string, GraphNodeData>()
    for (const n of nodes) map.set(n.id, n)
    return map
  }, [nodes])

  const idByName = useMemo(() => {
    const map = new Map<string, string>()
    for (const n of nodes) {
      map.set(norm(n.id), n.id)
      map.set(norm(n.nome), n.id)
    }
    return map
  }, [nodes])

  const degreeById = useMemo(() => {
    // Dados: grau só entre dados (raio idêntico ao mapa sem linhagem).
    // Derivados: grau conta tudo (sistemas com muitos dados ficam maiores).
    const map = new Map<string, number>()
    for (const n of nodes) map.set(n.id, 0)
    const derivado = (id: string) => {
      const n = nodesById.get(id)
      return n ? isDerivado(n) : false
    }
    for (const l of links) {
      const sDeriv = derivado(l.source)
      const tDeriv = derivado(l.target)
      if (!sDeriv && !tDeriv) {
        map.set(l.source, (map.get(l.source) ?? 0) + 1)
        map.set(l.target, (map.get(l.target) ?? 0) + 1)
      } else {
        if (sDeriv) map.set(l.source, (map.get(l.source) ?? 0) + 1)
        if (tDeriv) map.set(l.target, (map.get(l.target) ?? 0) + 1)
      }
    }
    return map
  }, [nodes, links, nodesById])

  const neighborsById = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const l of links) {
      if (!map.has(l.source)) map.set(l.source, new Set())
      if (!map.has(l.target)) map.set(l.target, new Set())
      map.get(l.source)?.add(l.target)
      map.get(l.target)?.add(l.source)
    }
    return map
  }, [links])

  // Contadores e filtros atuam só sobre nós de dados (derivados nunca entram).
  const counts = useMemo<Counts>(() => {
    const reais = nodes.filter((n) => !n.fantasma && !isDerivado(n))
    return {
      total: reais.length,
      comDebito: reais.filter((n) => n.debito === 'sim').length,
      semOwner: reais.filter((n) => !n.owner).length,
    }
  }, [nodes])

  const dominios = useMemo(
    () =>
      [...new Set(nodes.filter((n) => !n.fantasma && n.dominio).map((n) => n.dominio ?? ''))].sort(
        (a, b) => a.localeCompare(b, 'pt-BR'),
      ),
    [nodes],
  )

  // --- estado de UI ---
  const [selectedId, setSelectedId] = useState<string | null>(readUrlSelection)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [selDominios, setSelDominios] = useState<ReadonlySet<string>>(new Set())
  const [selDebitos, setSelDebitos] = useState<ReadonlySet<Debito>>(new Set())
  const [somenteSemOwner, setSomenteSemOwner] = useState(false)

  // Camada de linhagem (sistemas/origens): desligada por padrão no mapa global,
  // ligada automaticamente ao entrar em foco. ?foco= na URL já entra em foco.
  const [focusPath, setFocusPath] = useState<string[]>(() => {
    const foco = readUrlFocus()
    return foco ? [foco] : []
  })
  const [depth, setDepth] = useState<number>(readUrlDepth)
  const [vista, setVista] = useState<Vista>(readUrlVista)
  const [layersOn, setLayersOn] = useState<boolean>(() => readUrlFocus() !== null)
  // Estado da camada antes de entrar em foco, restaurado ao sair.
  const layersBeforeFocusRef = useRef(false)

  const focusId = focusPath.length > 0 ? focusPath[focusPath.length - 1] : null

  const graphRef = useRef<GraphHandle>(null)
  // Seleção que veio da URL na carga: centralizada quando a física estabiliza.
  const [initialFocusId] = useState(readUrlSelection)

  const normQuery = norm(query)

  // --- subgrafo visível (camadas + modo foco) ---
  const visibleIds = useMemo(() => {
    // Fora da simulação, não só esmaecidos: derivados saem quando a camada
    // está desligada. O nó em foco fica sempre visível, mesmo derivado.
    const allowed = new Set(
      nodes.filter((n) => layersOn || !isDerivado(n) || n.id === focusId).map((n) => n.id),
    )
    if (!focusId || !allowed.has(focusId)) return allowed

    const adj = new Map<string, string[]>()
    for (const l of links) {
      if (!allowed.has(l.source) || !allowed.has(l.target)) continue
      if (!adj.has(l.source)) adj.set(l.source, [])
      if (!adj.has(l.target)) adj.set(l.target, [])
      adj.get(l.source)?.push(l.target)
      adj.get(l.target)?.push(l.source)
    }
    // BFS até a profundidade escolhida a partir do nó em foco.
    const reached = new Set([focusId])
    let frontier = [focusId]
    for (let d = 0; d < depth && frontier.length > 0; d++) {
      const next: string[] = []
      for (const id of frontier) {
        for (const viz of adj.get(id) ?? []) {
          if (!reached.has(viz)) {
            reached.add(viz)
            next.push(viz)
          }
        }
      }
      frontier = next
    }
    // Fecho de linhagem: cada nó visível arrasta sua cadeia sys→org sem
    // consumir profundidade (dado→sys, sys→org, dado→org).
    if (layersOn) {
      for (let pass = 0; pass < 2; pass++) {
        for (const l of links) {
          if (!reached.has(l.source) || reached.has(l.target)) continue
          const alvo = nodesById.get(l.target)
          if (alvo && isDerivado(alvo)) reached.add(l.target)
        }
      }
    }
    return reached
  }, [nodes, links, nodesById, layersOn, focusId, depth])

  const visibleData = useMemo<{ nodes: SimNode[]; links: SimLink[] }>(
    () => ({
      nodes: simData.nodes.filter((n) => visibleIds.has(n.id)),
      links: simData.links.filter(
        (l) => visibleIds.has(linkEndId(l.source)) && visibleIds.has(linkEndId(l.target)),
      ),
    }),
    [simData, visibleIds],
  )

  // Vista em níveis: linhagem montante completa do nó focado, em colunas.
  // null quando o foco é um derivado (sem linhagem própria) — cai na força.
  const lineage = useMemo(
    () => (focusId && vista === 'niveis' ? buildLineage(focusId, nodes, links) : null),
    [focusId, vista, nodes, links],
  )

  const graphData = lineage ? lineage.graph : visibleData
  const shownIds = lineage ? lineage.ids : visibleIds

  const searchMatches = useMemo(() => {
    if (!normQuery) return []
    const starts: GraphNodeData[] = []
    const contains: GraphNodeData[] = []
    const inDesc: GraphNodeData[] = []
    for (const n of nodes) {
      // Dados sempre; sistemas/origens só quando a camada está visível.
      if (isDerivado(n) && !layersOn) continue
      const nome = norm(n.nome)
      if (nome.startsWith(normQuery)) starts.push(n)
      else if (nome.includes(normQuery)) contains.push(n)
      else if (norm(n.descricao ?? '').includes(normQuery)) inDesc.push(n)
    }
    return [...starts, ...contains, ...inDesc]
  }, [nodes, normQuery, layersOn])

  const hasActiveFilter =
    selDominios.size > 0 || selDebitos.size > 0 || somenteSemOwner || normQuery.length > 0

  const dimmedIds = useMemo(() => {
    // Hover tem prioridade: acende o nó + vizinhos (na vista em níveis, a
    // cadeia inteira de ancestrais/descendentes) e esmaece todo o resto.
    if (hoverId) {
      const lit = lineage
        ? lineage.chainOf(hoverId)
        : new Set([hoverId, ...(neighborsById.get(hoverId) ?? [])])
      return new Set([...shownIds].filter((id) => !lit.has(id)))
    }
    if (!hasActiveFilter) return new Set<string>()
    const matchIds = new Set(searchMatches.map((n) => n.id))
    return new Set(
      [...shownIds].filter((id) => {
        const n = nodesById.get(id)
        // Placeholder da linhagem: só reage à busca (nunca casa com ela).
        if (!n) return normQuery.length > 0
        if (isDerivado(n)) {
          // Derivados só reagem à busca; os demais filtros são de governança
          // e valem apenas para dados.
          return normQuery.length > 0 && !matchIds.has(n.id)
        }
        if (normQuery && !matchIds.has(n.id)) return true
        if (selDominios.size > 0 && !selDominios.has(n.dominio ?? '')) return true
        if (selDebitos.size > 0 && !selDebitos.has(n.debito ?? 'avaliar')) return true
        if (somenteSemOwner && (n.fantasma || Boolean(n.owner))) return true
        return false
      }),
    )
  }, [
    shownIds,
    nodesById,
    hoverId,
    neighborsById,
    lineage,
    hasActiveFilter,
    normQuery,
    searchMatches,
    selDominios,
    selDebitos,
    somenteSemOwner,
  ])

  const select = useCallback((id: string | null, focus = false) => {
    setSelectedId(id)
    if (id && focus) graphRef.current?.focusNode(id)
  }, [])

  // --- modo foco ---
  const enterFocus = useCallback(
    (id: string) => {
      layersBeforeFocusRef.current = layersOn
      setLayersOn(true)
      setVista('niveis') // vista padrão ao entrar em foco
      setFocusPath([id])
    },
    [layersOn],
  )

  const pushFocus = useCallback((id: string) => {
    setFocusPath((path) => (path[path.length - 1] === id ? path : [...path, id]))
  }, [])

  /** Botão "Focar" do painel e duplo clique: entra em foco ou re-foca. */
  const focusOn = useCallback(
    (id: string) => {
      if (focusId) pushFocus(id)
      else enterFocus(id)
    },
    [focusId, pushFocus, enterFocus],
  )

  const exitFocus = useCallback(() => {
    setFocusPath([])
    setLayersOn(layersBeforeFocusRef.current)
  }, [])

  const lastClickRef = useRef({ id: '', t: 0 })
  const handleNodeClick = useCallback(
    (id: string) => {
      // Placeholders da linhagem são só visuais: não selecionam nem focam.
      if (lineage?.placeholderIds.has(id)) return
      const now = performance.now()
      const isDouble = lastClickRef.current.id === id && now - lastClickRef.current.t < DBLCLICK_MS
      lastClickRef.current = { id, t: now }
      select(id)
      // No foco: clicar num vizinho re-foca nele (empilha no breadcrumb).
      // No mapa global: duplo clique entra em foco.
      if (focusId) {
        if (id !== focusId) pushFocus(id)
      } else if (isDouble) {
        enterFocus(id)
      }
    },
    [select, focusId, pushFocus, enterFocus, lineage],
  )

  // URL reflete seleção (?no=) e foco (?foco=&vista=, com &prof= só na vista
  // de força) sem poluir o histórico.
  useEffect(() => {
    const url = new URL(window.location.href)
    if (selectedId) url.searchParams.set('no', selectedId)
    else url.searchParams.delete('no')
    if (focusId) {
      url.searchParams.set('foco', focusId)
      url.searchParams.set('vista', vista)
      if (vista === 'forca') url.searchParams.set('prof', String(depth))
      else url.searchParams.delete('prof')
    } else {
      url.searchParams.delete('foco')
      url.searchParams.delete('prof')
      url.searchParams.delete('vista')
    }
    window.history.replaceState(null, '', url)
  }, [selectedId, focusId, depth, vista])

  // Esc em dois estágios: fecha o painel primeiro, depois sai do foco.
  // Handlers globais leem o estado corrente via ref para registrar uma só vez.
  const escRef = useRef(() => {})
  escRef.current = () => {
    if (selectedId) setSelectedId(null)
    else if (focusId) exitFocus()
  }

  useEffect(() => {
    const onPopState = () => {
      const id = readUrlSelection()
      const foco = readUrlFocus()
      setSelectedId(id)
      setFocusPath(foco ? [foco] : [])
      setDepth(readUrlDepth())
      setVista(readUrlVista())
      if (foco) setLayersOn(true)
      if (id) graphRef.current?.focusNode(id)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') escRef.current()
    }
    window.addEventListener('popstate', onPopState)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('popstate', onPopState)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  const selectedNode = selectedId ? (nodesById.get(selectedId) ?? null) : null

  // Árvore de linhagem do painel (só dados reais têm rota própria).
  const selectedLineage = useMemo(
    () =>
      selectedNode && !isDerivado(selectedNode) && !selectedNode.fantasma
        ? buildLineageTree(selectedNode.id, nodes, links)
        : null,
    [selectedNode, nodes, links],
  )

  const { outgoing, incoming } = useMemo(() => {
    const out: Connection[] = []
    const inc: Connection[] = []
    if (selectedId) {
      for (const l of links) {
        const label = l.label ?? 'consome'
        if (l.source === selectedId) {
          const node = nodesById.get(l.target)
          if (node) out.push({ node, label })
        } else if (l.target === selectedId) {
          const node = nodesById.get(l.source)
          if (node) inc.push({ node, label })
        }
      }
    }
    return { outgoing: out, incoming: inc }
  }, [selectedId, links, nodesById])

  // Painel simplificado de sistema/origem: dados ligados direto e, para uma
  // origem, também os dados dos sistemas que apontam para ela.
  const derivadoDados = useMemo<GraphNodeData[]>(() => {
    if (!selectedNode || !isDerivado(selectedNode)) return []
    const ids = new Set<string>()
    for (const l of links) {
      if (l.target !== selectedNode.id) continue
      const n = nodesById.get(l.source)
      if (!n) continue
      if (!isDerivado(n)) {
        ids.add(n.id)
      } else {
        for (const l2 of links) {
          if (l2.target !== n.id) continue
          const m = nodesById.get(l2.source)
          if (m && !isDerivado(m)) ids.add(m.id)
        }
      }
    }
    return [...ids]
      .map((id) => nodesById.get(id))
      .filter((n): n is GraphNodeData => n !== undefined)
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }, [selectedNode, links, nodesById])

  const resolveWikiLink = useCallback(
    (target: string) => idByName.get(norm(target)) ?? null,
    [idByName],
  )

  const breadcrumb = useMemo(
    () => focusPath.map((id) => ({ id, nome: nodesById.get(id)?.nome ?? id })),
    [focusPath, nodesById],
  )

  // Foco num derivado (sistema/origem) não tem linhagem própria: sem switch,
  // sempre na vista de força.
  const focusedNode = focusId ? (nodesById.get(focusId) ?? null) : null
  const canNiveis = focusedNode !== null && !isDerivado(focusedNode)

  return (
    <div className="app">
      <Graph
        ref={graphRef}
        data={graphData}
        degreeById={degreeById}
        dimmedIds={dimmedIds}
        hoverId={hoverId}
        selectedId={selectedId}
        initialFocusId={initialFocusId}
        fixedLayout={lineage !== null}
        onNodeClick={handleNodeClick}
        onNodeHover={setHoverId}
        onBackgroundClick={() => setSelectedId(null)}
      />

      <header className="topbar">
        <div className="topbar__title">
          <h1>Mapa de Dados do Atacado</h1>
          <span>quem produz e quem consome cada dado</span>
        </div>
        <SearchBox
          query={query}
          matchCount={searchMatches.length}
          onQueryChange={setQuery}
          onSubmit={() => {
            const first = searchMatches[0]
            if (first) select(first.id, true)
          }}
        />
      </header>

      {focusId && (
        <FocusBar
          path={breadcrumb}
          depth={depth}
          vista={lineage ? 'niveis' : 'forca'}
          canNiveis={canNiveis}
          onCrumbClick={(i) => setFocusPath((path) => path.slice(0, i + 1))}
          onDepthChange={setDepth}
          onVistaChange={setVista}
          onExit={exitFocus}
        />
      )}

      <Filters
        dominios={dominios}
        selectedDominios={selDominios}
        selectedDebitos={selDebitos}
        somenteSemOwner={somenteSemOwner}
        layersOn={layersOn}
        counts={counts}
        hasActiveFilter={hasActiveFilter}
        onToggleDominio={(d) => setSelDominios((prev) => toggled(prev, d))}
        onToggleDebito={(d) => setSelDebitos((prev) => toggled(prev, d))}
        onToggleSemOwner={() => setSomenteSemOwner((v) => !v)}
        onToggleLayers={() => setLayersOn((v) => !v)}
        onClear={() => {
          setQuery('')
          setSelDominios(new Set())
          setSelDebitos(new Set())
          setSomenteSemOwner(false)
        }}
      />

      <Legend layersVisible={layersOn} />

      {selectedNode && (
        <DetailPanel
          node={selectedNode}
          outgoing={outgoing}
          incoming={incoming}
          derivadoDados={derivadoDados}
          lineage={selectedLineage}
          isFocused={selectedId === focusId}
          resolveWikiLink={resolveWikiLink}
          onNavigate={(id) => select(id, true)}
          onFocus={focusOn}
          onClose={() => setSelectedId(null)}
        />
      )}

      {nodes.length === 0 && (
        <div className="empty-state">
          <p>
            Nenhum dado no grafo ainda. Rode <code>npm run data</code> para gerar{' '}
            <code>src/data/graph.json</code> a partir do vault.
          </p>
        </div>
      )}
    </div>
  )
}

export default App
