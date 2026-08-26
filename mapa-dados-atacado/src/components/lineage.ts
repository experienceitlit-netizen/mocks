// Vista em níveis: a partir de um componente focado, resolve TUDO de que ele
// depende seguindo as arestas de saída ("consome" e "vem de", montante e
// recursivo) e distribui os nós alcançados em colunas — uma por nível, na
// ordem do bloco `niveis` do graph.json.
//
// Não há camada especial de linhagem nem nó sintetizado: cada componente cai
// na coluna do seu `nivel` e as arestas cruzam colunas livremente (um nível
// pode consumir outro que esteja duas colunas adiante, ou ao lado).
import type {
  GraphLinkData,
  GraphNodeData,
  NivelDef,
  SimLink,
  SimNode,
} from './graph-types'
import {
  isReal,
  linkLabel,
  nivelDe,
  nivelDeEntrada,
  ordemDoNivel,
  tituloDoNivel,
} from './graph-types'

/** Distância entre colunas (x) e entre linhas de uma coluna (y). */
export const NIVEIS_COL_X = 250
export const NIVEIS_ROW_Y = 70

/** Faixa vertical de uma coluna (coordenadas de grafo; yMin/yMax são centros
 *  do primeiro e do último nó — o padding visual fica com quem desenha). */
export interface LineageColumn {
  /** Slug do nível da coluna. */
  slug: string
  label: string
  x: number
  yMin: number
  yMax: number
  /** Cores do nível, repassadas cruas do bloco `niveis`; ausentes = faixa
   *  neutra. Quem desenha decide como aplicá-las (ver band-colors.ts). */
  corFundo?: string
  corBorda?: string
}

/** Aresta de saída de um componente, já resolvida no nó de destino. */
export interface LineageEdge {
  label: string
  entry: LineageEntry
}

/** Árvore montante de um componente (nós compartilhados reusam a entrada). */
export interface LineageEntry {
  data: GraphNodeData
  upstream: LineageEdge[]
}

export interface Lineage {
  /** null na vista sem foco (inventário): não há componente de partida. */
  root: LineageEntry | null
  /** Nós (com fx/fy fixos em colunas) e arestas da vista. */
  graph: { nodes: SimNode[]; links: SimLink[] }
  /** Colunas presentes, esquerda → direita. */
  columns: LineageColumn[]
  /** Ids de tudo que a vista exibe (para esmaecimento por filtro/hover). */
  ids: ReadonlySet<string>
  /** Cadeia completa do nó (montante + jusante), para destacar no hover. */
  chainOf(id: string): Set<string>
}

/**
 * Árvore montante de um componente: ele, tudo que consome e tudo a que se
 * associa, recursivamente. null quando o id não existe no grafo.
 */
export function buildLineageTree(
  rootId: string,
  nodes: readonly GraphNodeData[],
  links: readonly GraphLinkData[],
): LineageEntry | null {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  if (!byId.has(rootId)) return null

  const saidas = new Map<string, GraphLinkData[]>()
  for (const l of links) {
    if (!byId.has(l.source) || !byId.has(l.target)) continue
    const lista = saidas.get(l.source)
    if (lista) lista.push(l)
    else saidas.set(l.source, [l])
  }

  // Entradas memoizadas: alvo compartilhado vira o mesmo objeto em cada ramo.
  const entries = new Map<string, LineageEntry>()
  const build = (id: string, trilha: ReadonlySet<string>): LineageEntry | null => {
    const cached = entries.get(id)
    if (cached) return cached
    const data = byId.get(id)
    if (!data) return null
    const entry: LineageEntry = { data, upstream: [] }
    entries.set(id, entry)
    for (const l of saidas.get(id) ?? []) {
      if (trilha.has(l.target)) continue // guarda contra ciclo
      const filho = build(l.target, new Set([...trilha, l.target]))
      if (filho) entry.upstream.push({ label: linkLabel(l), entry: filho })
    }
    return entry
  }
  return build(rootId, new Set([rootId]))
}

/**
 * Linhagem com layout em colunas: nó focado à esquerda e uma coluna por nível
 * presente, na ordem do bloco `niveis`.
 *
 * `rootId` null (ou o foco num componente do NÍVEL DE ENTRADA, o de menor
 * ordem) abre o inventário completo: todo componente do catálogo entra na
 * coluna do seu nível, mesmo sem nenhuma aresta. É o que mantém o mapa legível
 * enquanto as ligações estão sendo construídas — e o que faz a vista em níveis
 * sobreviver ao nível de entrada ficar vazio. Focar em qualquer outro
 * componente mostra só a sub-árvore dele.
 */
export function buildLineage(
  rootId: string | null,
  nodes: readonly GraphNodeData[],
  links: readonly GraphLinkData[],
  niveis: readonly NivelDef[] = [],
): Lineage | null {
  // Sem foco, a vista é só o inventário: nenhum componente é indispensável,
  // então o mapa em níveis existe mesmo com o nível de entrada vazio.
  const root = rootId === null ? null : buildLineageTree(rootId, nodes, links)
  if (rootId !== null && !root) return null

  // Achata a árvore em nós únicos — a ordem de visita agrupa cada cadeia perto
  // do componente que a puxou.
  const nodeById = new Map<string, SimNode>()
  const addNode = (n: GraphNodeData) => {
    if (!nodeById.has(n.id)) nodeById.set(n.id, { ...n })
  }
  const walk = (entry: LineageEntry, vistos: Set<string>) => {
    if (vistos.has(entry.data.id)) return
    vistos.add(entry.data.id)
    addNode(entry.data)
    for (const { entry: filho } of entry.upstream) walk(filho, vistos)
  }
  if (root) walk(root, new Set())

  const entrada = nivelDeEntrada(nodes, niveis)
  if (root === null || (entrada !== null && nivelDe(root.data) === entrada)) {
    for (const n of nodes) if (isReal(n)) addNode(n)
  }

  // Toda aresta cujas duas pontas estão na vista — inclusive as que ligam nós
  // irmãos, que a árvore montante não percorre.
  const graphLinks: GraphLinkData[] = []
  const linkKeys = new Set<string>()
  for (const l of links) {
    if (!nodeById.has(l.source) || !nodeById.has(l.target)) continue
    const key = `${l.source}→${l.target}`
    if (linkKeys.has(key)) continue
    linkKeys.add(key)
    graphLinks.push({ source: l.source, target: l.target, label: linkLabel(l) })
  }

  // Colunas da esquerda para a direita: só os níveis presentes (nível vazio
  // não vira coluna); espaçamento vertical uniforme por coluna, centrado.
  const porSlug = new Map<string, SimNode[]>()
  for (const n of nodeById.values()) {
    const slug = nivelDe(n)
    const lista = porSlug.get(slug)
    if (lista) lista.push(n)
    else porSlug.set(slug, [n])
  }
  const slugsPresentes = [...porSlug.keys()].sort((a, b) => {
    const delta = ordemDoNivel(niveis, a) - ordemDoNivel(niveis, b)
    return delta !== 0 ? delta : a.localeCompare(b, 'pt-BR')
  })
  const columns: LineageColumn[] = []
  slugsPresentes.forEach((slug, col) => {
    const coluna = porSlug.get(slug) ?? []
    const x = col * NIVEIS_COL_X
    coluna.forEach((n, i) => {
      const y = (i - (coluna.length - 1) / 2) * NIVEIS_ROW_Y
      n.x = x
      n.y = y
      n.fx = x
      n.fy = y
    })
    const meiaAltura = ((coluna.length - 1) / 2) * NIVEIS_ROW_Y
    const nivel = niveis.find((nv) => nv.slug === slug)
    columns.push({
      slug,
      label: tituloDoNivel(niveis, slug),
      x,
      yMin: -meiaAltura,
      yMax: meiaAltura,
      corFundo: nivel?.corFundo,
      corBorda: nivel?.corBorda,
    })
  })

  // Cadeia do hover: fecho nas duas direções sobre as arestas da vista.
  const up = new Map<string, string[]>()
  const down = new Map<string, string[]>()
  for (const l of graphLinks) {
    const saida = up.get(l.source)
    if (saida) saida.push(l.target)
    else up.set(l.source, [l.target])
    const entrada = down.get(l.target)
    if (entrada) entrada.push(l.source)
    else down.set(l.target, [l.source])
  }
  const chainOf = (id: string): Set<string> => {
    const lit = new Set([id])
    for (const adj of [up, down]) {
      const fila = [id]
      while (fila.length > 0) {
        const atual = fila.pop()
        if (atual === undefined) break
        for (const viz of adj.get(atual) ?? []) {
          if (!lit.has(viz)) {
            lit.add(viz)
            fila.push(viz)
          }
        }
      }
    }
    return lit
  }

  return {
    root,
    graph: { nodes: [...nodeById.values()], links: graphLinks as SimLink[] },
    columns,
    ids: new Set(nodeById.keys()),
    chainOf,
  }
}
