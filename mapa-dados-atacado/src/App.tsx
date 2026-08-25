import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import graphJson from './data/graph.json'
import Graph from './components/Graph'
import type { GraphHandle } from './components/Graph'
import DetailPanel from './components/DetailPanel'
import type { Connection } from './components/DetailPanel'
import SearchBox from './components/SearchBox'
import Filters from './components/Filters'
import Legend from './components/Legend'
import type { Counts } from './components/Filters'
import type { Debito, GraphJson, GraphNodeData, SimLink, SimNode } from './components/graph-types'
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

function toggled<T>(set: ReadonlySet<T>, value: T): Set<T> {
  const next = new Set(set)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
}

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
    const map = new Map<string, number>()
    for (const n of nodes) map.set(n.id, 0)
    for (const l of links) {
      map.set(l.source, (map.get(l.source) ?? 0) + 1)
      map.set(l.target, (map.get(l.target) ?? 0) + 1)
    }
    return map
  }, [nodes, links])

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

  const counts = useMemo<Counts>(() => {
    const reais = nodes.filter((n) => !n.fantasma)
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

  const graphRef = useRef<GraphHandle>(null)
  // Seleção que veio da URL na carga: centralizada quando a física estabiliza.
  const [initialFocusId] = useState(readUrlSelection)

  const normQuery = norm(query)

  const searchMatches = useMemo(() => {
    if (!normQuery) return []
    const starts: GraphNodeData[] = []
    const contains: GraphNodeData[] = []
    const inDesc: GraphNodeData[] = []
    for (const n of nodes) {
      const nome = norm(n.nome)
      if (nome.startsWith(normQuery)) starts.push(n)
      else if (nome.includes(normQuery)) contains.push(n)
      else if (norm(n.descricao ?? '').includes(normQuery)) inDesc.push(n)
    }
    return [...starts, ...contains, ...inDesc]
  }, [nodes, normQuery])

  const hasActiveFilter =
    selDominios.size > 0 || selDebitos.size > 0 || somenteSemOwner || normQuery.length > 0

  const dimmedIds = useMemo(() => {
    // Hover tem prioridade: acende o nó + vizinhos, esmaece todo o resto.
    if (hoverId) {
      const lit = new Set([hoverId, ...(neighborsById.get(hoverId) ?? [])])
      return new Set(nodes.filter((n) => !lit.has(n.id)).map((n) => n.id))
    }
    if (!hasActiveFilter) return new Set<string>()
    const matchIds = new Set(searchMatches.map((n) => n.id))
    return new Set(
      nodes
        .filter((n) => {
          if (normQuery && !matchIds.has(n.id)) return true
          if (selDominios.size > 0 && !selDominios.has(n.dominio ?? '')) return true
          if (selDebitos.size > 0 && !selDebitos.has(n.debito ?? 'avaliar')) return true
          if (somenteSemOwner && (n.fantasma || Boolean(n.owner))) return true
          return false
        })
        .map((n) => n.id),
    )
  }, [
    nodes,
    hoverId,
    neighborsById,
    hasActiveFilter,
    normQuery,
    searchMatches,
    selDominios,
    selDebitos,
    somenteSemOwner,
  ])

  const select = useCallback(
    (id: string | null, focus = false) => {
      setSelectedId(id)
      if (id && focus) graphRef.current?.focusNode(id)
    },
    [],
  )

  // URL reflete a seleção (?no=rar-12m) sem poluir o histórico.
  useEffect(() => {
    const url = new URL(window.location.href)
    if (selectedId) url.searchParams.set('no', selectedId)
    else url.searchParams.delete('no')
    window.history.replaceState(null, '', url)
  }, [selectedId])

  useEffect(() => {
    const onPopState = () => {
      const id = readUrlSelection()
      setSelectedId(id)
      if (id) graphRef.current?.focusNode(id)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedId(null)
    }
    window.addEventListener('popstate', onPopState)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('popstate', onPopState)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  const selectedNode = selectedId ? (nodesById.get(selectedId) ?? null) : null

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

  const resolveWikiLink = useCallback(
    (target: string) => idByName.get(norm(target)) ?? null,
    [idByName],
  )

  return (
    <div className="app">
      <Graph
        ref={graphRef}
        data={simData}
        degreeById={degreeById}
        dimmedIds={dimmedIds}
        hoverId={hoverId}
        selectedId={selectedId}
        initialFocusId={initialFocusId}
        onNodeClick={(id) => select(id)}
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

      <Filters
        dominios={dominios}
        selectedDominios={selDominios}
        selectedDebitos={selDebitos}
        somenteSemOwner={somenteSemOwner}
        counts={counts}
        hasActiveFilter={hasActiveFilter}
        onToggleDominio={(d) => setSelDominios((prev) => toggled(prev, d))}
        onToggleDebito={(d) => setSelDebitos((prev) => toggled(prev, d))}
        onToggleSemOwner={() => setSomenteSemOwner((v) => !v)}
        onClear={() => {
          setQuery('')
          setSelDominios(new Set())
          setSelDebitos(new Set())
          setSomenteSemOwner(false)
        }}
      />

      <Legend />

      {selectedNode && (
        <DetailPanel
          node={selectedNode}
          outgoing={outgoing}
          incoming={incoming}
          resolveWikiLink={resolveWikiLink}
          onNavigate={(id) => select(id, true)}
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
