import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import graphJson from './data/graph.json'
import Graph from './components/Graph'
import type { GraphHandle } from './components/Graph'
import NodeBalloon from './components/NodeBalloon'
import type { BalloonAnchor, Connection } from './components/NodeBalloon'
import SearchBox from './components/SearchBox'
import Filters from './components/Filters'
import type { NivelFiltro } from './components/Filters'
import FocusBar from './components/FocusBar'
import type { Vista } from './components/FocusBar'
import Legend from './components/Legend'
import TableView from './components/TableView'
import type { Counts } from './components/Filters'
import type { Debito, GraphJson, GraphNodeData, SimLink, SimNode } from './components/graph-types'
import { isDerivado, isDominio, isRaiz, linkEndId, nodeKind } from './components/graph-types'
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

/** Nó-raiz do domínio ("Atacado — Dados"), se o build já o emite. É a entrada
 *  padrão do app: sem parâmetros na URL, a navegação começa focada nele. */
const RAIZ_ID = (graphJson as GraphJson).nodes.find((n) => isRaiz(n))?.id ?? null

function readUrlSelection(): string | null {
  return new URLSearchParams(window.location.search).get('no')
}

function readUrlFocus(): string | null {
  return new URLSearchParams(window.location.search).get('foco')
}

/** Caminho de foco na carga: ?foco= explícito manda; sem ?foco= e sem ?no=,
 *  o padrão é abrir focado na raiz (vista Níveis, painel fechado). URL sem
 *  parâmetros SEMPRE significa essa entrada padrão — o estado "mapa global"
 *  não é codificado na URL (ver efeito de sincronização abaixo). */
function readInitialFocusPath(): string[] {
  const foco = readUrlFocus()
  if (foco) return [foco]
  if (RAIZ_ID !== null && readUrlSelection() === null) return [RAIZ_ID]
  return []
}

function readUrlDepth(): number {
  const raw = Number(new URLSearchParams(window.location.search).get('prof'))
  return Number.isInteger(raw) && raw >= 1 && raw <= 3 ? raw : 1
}

/** ?vista=niveis|forca; ausente (links antigos com ?foco=) = níveis. */
function readUrlVista(): Vista {
  return new URLSearchParams(window.location.search).get('vista') === 'forca' ? 'forca' : 'niveis'
}

type Aba = 'mapa' | 'tabela'

/** ?aba=tabela; ausente ou qualquer outro valor = mapa. */
function readUrlAba(): Aba {
  return new URLSearchParams(window.location.search).get('aba') === 'tabela' ? 'tabela' : 'mapa'
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
      // "agrega" (raiz→produto) não infla raio: a raiz tem raio fixo e os
      // produtos mantêm o tamanho que tinham no mapa sem a raiz.
      if (l.label === 'agrega') continue
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

  // Contadores e filtros atuam só sobre nós de dados (derivados e a raiz
  // nunca entram — a raiz não é um produto de dado).
  const counts = useMemo<Counts>(() => {
    const reais = nodes.filter((n) => !n.fantasma && !isDerivado(n) && !isRaiz(n))
    return {
      total: reais.length,
      comDebito: reais.filter((n) => n.debito === 'sim').length,
      semOwner: reais.filter((n) => !n.owner).length,
    }
  }, [nodes])

  // Grafo já migrado para o modelo de níveis? Antes disso o filtro de nível
  // e a entrada da legenda ficam ocultos (não haveria o que casar).
  const hasNiveis = useMemo(
    () => nodes.some((n) => !isDerivado(n) && !isRaiz(n) && n.nivel !== undefined),
    [nodes],
  )

  // Há nós de domínio derivados (nível raiz → domínio → produtos)?
  const hasDominios = useMemo(() => nodes.some((n) => isDominio(n)), [nodes])

  // Há fontes secundárias (tabelas UCS) derivadas? Legenda condicional.
  const hasFsec = useMemo(
    () => nodes.some((n) => nodeKind(n) === 'fonte-secundaria'),
    [nodes],
  )

  const dominios = useMemo(
    () =>
      [
        ...new Set(
          nodes.filter((n) => !n.fantasma && !isRaiz(n) && n.dominio).map((n) => n.dominio ?? ''),
        ),
      ].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [nodes],
  )

  // --- estado de UI ---
  // Aba ativa: o mapa (grafo) continua montado sob a tabela, preservando
  // pan/zoom, foco e filtros ao alternar.
  const [aba, setAba] = useState<Aba>(readUrlAba)
  const [selectedId, setSelectedId] = useState<string | null>(readUrlSelection)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [selDominios, setSelDominios] = useState<ReadonlySet<string>>(new Set())
  const [selDebitos, setSelDebitos] = useState<ReadonlySet<Debito>>(new Set())
  const [selNiveis, setSelNiveis] = useState<ReadonlySet<NivelFiltro>>(new Set())
  const [somenteSemOwner, setSomenteSemOwner] = useState(false)

  // Camada de linhagem (sistemas/origens): desligada por padrão no mapa global,
  // ligada automaticamente ao entrar em foco. ?foco= na URL já entra em foco.
  const [focusPath, setFocusPath] = useState<string[]>(readInitialFocusPath)
  const [depth, setDepth] = useState<number>(readUrlDepth)
  const [vista, setVista] = useState<Vista>(readUrlVista)
  // Faixas de nível (retângulos + títulos + chevrons) da vista Níveis.
  const [bandsOn, setBandsOn] = useState(true)
  const [layersOn, setLayersOn] = useState<boolean>(() => readInitialFocusPath().length > 0)
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
    // está desligada. Domínios são sempre visíveis (são o caminho da raiz aos
    // produtos finais) e o nó em foco também, mesmo derivado.
    const allowed = new Set(
      nodes
        .filter((n) => layersOn || !isDerivado(n) || isDominio(n) || n.id === focusId)
        .map((n) => n.id),
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
    // Fecho de linhagem: cada nó visível arrasta sua cadeia derivada sem
    // consumir profundidade (dado→fsec→sys→org na cadeia mais longa —
    // três saltos, três passadas).
    if (layersOn) {
      for (let pass = 0; pass < 3; pass++) {
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
      // Dados e domínios sempre; sistemas/origens só com a camada visível.
      if (isDerivado(n) && !isDominio(n) && !layersOn) continue
      const nome = norm(n.nome)
      if (nome.startsWith(normQuery)) starts.push(n)
      else if (nome.includes(normQuery)) contains.push(n)
      else if (norm(n.descricao ?? '').includes(normQuery)) inDesc.push(n)
    }
    return [...starts, ...contains, ...inDesc]
  }, [nodes, normQuery, layersOn])

  const hasActiveFilter =
    selDominios.size > 0 ||
    selDebitos.size > 0 ||
    selNiveis.size > 0 ||
    somenteSemOwner ||
    normQuery.length > 0

  const dimmedIds = useMemo(() => {
    // Hover tem prioridade: acende o nó + vizinhos (na vista em níveis, a
    // cadeia inteira de ancestrais/descendentes) e esmaece todo o resto.
    // Com o balão aberto (seleção), o mesmo destaque persiste no selecionado;
    // um hover momentâneo em outro nó sobrepõe e, ao sair, a seleção volta.
    const highlightId = hoverId ?? (selectedId && shownIds.has(selectedId) ? selectedId : null)
    if (highlightId) {
      const lit = lineage
        ? lineage.chainOf(highlightId)
        : new Set([highlightId, ...(neighborsById.get(highlightId) ?? [])])
      return new Set([...shownIds].filter((id) => !lit.has(id)))
    }
    if (!hasActiveFilter) return new Set<string>()
    const matchIds = new Set(searchMatches.map((n) => n.id))
    return new Set(
      [...shownIds].filter((id) => {
        const n = nodesById.get(id)
        // Placeholder da linhagem: só reage à busca (nunca casa com ela).
        if (!n) return normQuery.length > 0
        if (isDerivado(n) || isRaiz(n)) {
          // Derivados e a raiz só reagem à busca; os demais filtros são de
          // governança e valem apenas para produtos de dados.
          return normQuery.length > 0 && !matchIds.has(n.id)
        }
        if (normQuery && !matchIds.has(n.id)) return true
        if (selDominios.size > 0 && !selDominios.has(n.dominio ?? '')) return true
        if (selDebitos.size > 0 && !selDebitos.has(n.debito ?? 'avaliar')) return true
        // "ambos" casa com qualquer lado do filtro de nível.
        if (
          selNiveis.size > 0 &&
          ![...selNiveis].some((v) => n.nivel === v || n.nivel === 'ambos')
        ) {
          return true
        }
        if (somenteSemOwner && (n.fantasma || Boolean(n.owner))) return true
        return false
      }),
    )
  }, [
    shownIds,
    nodesById,
    hoverId,
    selectedId,
    neighborsById,
    lineage,
    hasActiveFilter,
    normQuery,
    searchMatches,
    selDominios,
    selDebitos,
    selNiveis,
    somenteSemOwner,
  ])

  const select = useCallback((id: string | null, focus = false) => {
    setSelectedId(id)
    if (id && focus) graphRef.current?.focusNode(id)
  }, [])

  /** Clique no nome de um dado na tabela: volta ao mapa já com o nó
   *  selecionado e centralizado (mesmo caminho do ?no=). */
  const openFromTable = useCallback(
    (id: string) => {
      setAba('mapa')
      select(id, true)
    },
    [select],
  )

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
      // Clique simples só abre o balão de detalhe (nunca foca/re-foca);
      // duplo clique entra em foco (ou re-foca, empilhando no breadcrumb).
      select(id)
      if (isDouble) focusOn(id)
    },
    [select, focusOn, lineage],
  )

  // URL reflete aba (?aba=tabela), seleção (?no=) e foco (?foco=&vista=, com
  // &prof= só na vista de força) sem poluir o histórico. O estado padrão de
  // entrada (foco na raiz, vista Níveis, nada selecionado) fica com a URL
  // limpa — o inverso de readInitialFocusPath. Consequência documentada: o
  // mapa global também tem URL limpa, então recarregar a página a partir dele
  // volta à entrada padrão (foco na raiz).
  useEffect(() => {
    const url = new URL(window.location.href)
    if (aba === 'tabela') url.searchParams.set('aba', 'tabela')
    else url.searchParams.delete('aba')
    if (selectedId) url.searchParams.set('no', selectedId)
    else url.searchParams.delete('no')
    const focoDefault = focusId === RAIZ_ID && vista === 'niveis' && !selectedId
    if (focusId && !focoDefault) {
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
  }, [aba, selectedId, focusId, depth, vista])

  // Esc em dois estágios: fecha o painel primeiro, depois sai do foco. Na aba
  // Tabela, volta ao mapa (o estado do mapa é invisível ali — não mexe nele).
  // Handlers globais leem o estado corrente via ref para registrar uma só vez.
  const escRef = useRef(() => {})
  escRef.current = () => {
    if (aba === 'tabela') setAba('mapa')
    else if (selectedId) setSelectedId(null)
    else if (focusId) exitFocus()
  }

  useEffect(() => {
    const onPopState = () => {
      const id = readUrlSelection()
      const path = readInitialFocusPath()
      setAba(readUrlAba())
      setSelectedId(id)
      setFocusPath(path)
      setDepth(readUrlDepth())
      setVista(readUrlVista())
      if (path.length > 0) setLayersOn(true)
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

  // Árvore de linhagem do painel (só dados reais têm rota própria; a raiz
  // teria a árvore inteira — o painel dela lista só o que agrega).
  const selectedLineage = useMemo(
    () =>
      selectedNode && !isDerivado(selectedNode) && !selectedNode.fantasma && !isRaiz(selectedNode)
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

  // Painel simplificado de sistema/origem: dados ligados direto e os que
  // chegam através de outros derivados (fsec → sistema → origem), subindo
  // recursivamente as arestas de entrada.
  const derivadoDados = useMemo<GraphNodeData[]>(() => {
    if (!selectedNode || !isDerivado(selectedNode)) return []
    const ids = new Set<string>()
    const fila = [selectedNode.id]
    const visitados = new Set(fila)
    while (fila.length > 0) {
      const atual = fila.pop()
      for (const l of links) {
        if (l.target !== atual) continue
        const n = nodesById.get(l.source)
        if (!n) continue
        if (!isDerivado(n)) {
          ids.add(n.id)
        } else if (!visitados.has(n.id)) {
          visitados.add(n.id)
          fila.push(n.id)
        }
      }
    }
    return [...ids]
      .map((id) => nodesById.get(id))
      .filter((n): n is GraphNodeData => n !== undefined)
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }, [selectedNode, links, nodesById])

  // Âncora do balão: posição do nó selecionado em coordenadas de tela, lida
  // a cada frame pelo próprio balão (segue pan/zoom/física sem re-render).
  const getBalloonAnchor = useCallback(
    (): BalloonAnchor | null =>
      selectedId ? (graphRef.current?.nodeScreenPosition(selectedId) ?? null) : null,
    [selectedId],
  )

  const resolveWikiLink = useCallback(
    (target: string) => idByName.get(norm(target)) ?? null,
    [idByName],
  )

  const breadcrumb = useMemo(
    () => focusPath.map((id) => ({ id, nome: nodesById.get(id)?.nome ?? id })),
    [focusPath, nodesById],
  )

  // Foco num sistema/origem não tem linhagem própria: sem switch, sempre na
  // vista de força. Domínios têm (raiz → domínio → produtos → cadeias).
  const focusedNode = focusId ? (nodesById.get(focusId) ?? null) : null
  const canNiveis = focusedNode !== null && (!isDerivado(focusedNode) || isDominio(focusedNode))

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
        levelColumns={lineage && bandsOn ? lineage.columns : null}
        onNodeClick={handleNodeClick}
        onNodeHover={setHoverId}
        onBackgroundClick={() => setSelectedId(null)}
      />

      {aba === 'tabela' && (
        <div className="table-layer">
          <TableView nodes={nodes} links={links} onSelectNode={openFromTable} />
        </div>
      )}

      <header className="topbar">
        <div className="topbar__title">
          <h1>Mapa de Dados do Atacado</h1>
          <span>quem produz e quem consome cada dado</span>
        </div>
        <nav className="topbar__tabs" aria-label="Visão">
          <button
            type="button"
            className={aba === 'mapa' ? 'topbar__tab topbar__tab--active' : 'topbar__tab'}
            onClick={() => setAba('mapa')}
          >
            Mapa
          </button>
          <button
            type="button"
            className={aba === 'tabela' ? 'topbar__tab topbar__tab--active' : 'topbar__tab'}
            onClick={() => setAba('tabela')}
          >
            Tabela
          </button>
        </nav>
        {aba === 'mapa' && (
          <SearchBox
            query={query}
            matchCount={searchMatches.length}
            onQueryChange={setQuery}
            onSubmit={() => {
              const first = searchMatches[0]
              if (first) select(first.id, true)
            }}
          />
        )}
      </header>

      {aba === 'mapa' && focusId && (
        <FocusBar
          path={breadcrumb}
          depth={depth}
          vista={lineage ? 'niveis' : 'forca'}
          canNiveis={canNiveis}
          bandsOn={bandsOn}
          onCrumbClick={(i) => setFocusPath((path) => path.slice(0, i + 1))}
          onDepthChange={setDepth}
          onVistaChange={setVista}
          onToggleBands={() => setBandsOn((v) => !v)}
          onExit={exitFocus}
        />
      )}

      {aba === 'mapa' && (
        <Filters
          dominios={dominios}
          selectedDominios={selDominios}
          selectedDebitos={selDebitos}
          hasNiveis={hasNiveis}
          selectedNiveis={selNiveis}
          somenteSemOwner={somenteSemOwner}
          layersOn={layersOn}
          counts={counts}
          hasActiveFilter={hasActiveFilter}
          onToggleDominio={(d) => setSelDominios((prev) => toggled(prev, d))}
          onToggleDebito={(d) => setSelDebitos((prev) => toggled(prev, d))}
          onToggleNivel={(n) => setSelNiveis((prev) => toggled(prev, n))}
          onToggleSemOwner={() => setSomenteSemOwner((v) => !v)}
          onToggleLayers={() => setLayersOn((v) => !v)}
          onClear={() => {
            setQuery('')
            setSelDominios(new Set())
            setSelDebitos(new Set())
            setSelNiveis(new Set())
            setSomenteSemOwner(false)
          }}
        />
      )}

      {aba === 'mapa' && (
        <Legend
          layersVisible={layersOn}
          hasNiveis={hasNiveis}
          hasRaiz={RAIZ_ID !== null}
          hasDominios={hasDominios}
          hasFsec={hasFsec}
        />
      )}

      {aba === 'mapa' && selectedNode && (
        <NodeBalloon
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
          getAnchor={getBalloonAnchor}
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
