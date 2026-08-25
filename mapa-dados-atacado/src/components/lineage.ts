// Vista de linhagem em níveis: a partir de um dado focado, resolve TUDO de
// que ele depende seguindo as arestas "consome" — e "agrega", que o nó-raiz
// usa para apontar os produtos finais — (montante, recursivo) e anexa
// a rota de cada dado alcançado — fonte (campo `sistema`) e origem (campo
// `origem`) — casando os campos de texto com os nós derivados do build.
// Quando o campo não tem nó correspondente (ex.: "a confirmar"), sintetiza um
// placeholder só na UI, um por dado, para a cadeia sempre mostrar o nível
// origem → fonte → produto.
import type { GraphLinkData, GraphNodeData, SimLink, SimNode } from './graph-types'
import { nodeKind } from './graph-types'

/** Sistema/origem não entram na árvore de dados (têm coluna própria no fim);
 *  nós de domínio derivados entram — são um nível entre a raiz e os finais. */
function isSysOrg(node: Pick<GraphNodeData, 'tipo' | 'derivado'>): boolean {
  const kind = nodeKind(node)
  return kind === 'sistema' || kind === 'origem'
}

/** Distância entre colunas (x) e entre linhas de uma coluna (y). */
export const NIVEIS_COL_X = 220
export const NIVEIS_ROW_Y = 70

/** Fonte ou origem de um dado: nó real (sys-/org-) ou placeholder da UI. */
export interface LineageSource {
  node: GraphNodeData
  placeholder: boolean
}

/** Árvore de linhagem de um dado (repete nós compartilhados por ramo). */
export interface LineageEntry {
  data: GraphNodeData
  sistema: LineageSource | null
  origem: LineageSource | null
  insumos: LineageEntry[]
}

export interface Lineage {
  root: LineageEntry
  /** Nós (com fx/fy fixos em colunas) e arestas da vista em níveis. */
  graph: { nodes: SimNode[]; links: SimLink[] }
  /** Ids de tudo que a vista exibe (para esmaecimento por filtro/hover). */
  ids: ReadonlySet<string>
  /** Placeholders não são clicáveis nem focáveis. */
  placeholderIds: ReadonlySet<string>
  /** Cadeia completa do nó (montante + jusante), para destacar no hover. */
  chainOf(id: string): Set<string>
}

function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function titleize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function makeSource(
  data: GraphNodeData,
  field: 'sistema' | 'origem',
  byName: ReadonlyMap<string, GraphNodeData>,
): LineageSource | null {
  // null = "não se aplica" (secundário só tem cadeias de primários): nunca
  // sintetiza placeholder — só strings sem nó correspondente viram um.
  const valor = field === 'sistema' ? data.sistema : data.origem
  if (valor === null || valor === undefined || valor.trim() === '') return null
  const real = byName.get(norm(valor))
  if (real) return { node: real, placeholder: false }
  return {
    node: {
      id: `ph-${field}-${data.id}`,
      nome: titleize(valor),
      tipo: field,
      derivado: true,
      placeholder: true,
    },
    placeholder: true,
  }
}

/** Árvore de linhagem montante de um dado ou domínio; null para
 *  sistema/origem ou nó inexistente. */
export function buildLineageTree(
  rootId: string,
  nodes: readonly GraphNodeData[],
  links: readonly GraphLinkData[],
): LineageEntry | null {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const rootData = byId.get(rootId)
  if (!rootData || isSysOrg(rootData)) return null

  const sysByName = new Map<string, GraphNodeData>()
  const orgByName = new Map<string, GraphNodeData>()
  for (const n of nodes) {
    if (n.tipo === 'sistema') sysByName.set(norm(n.nome), n)
    else if (n.tipo === 'origem') orgByName.set(norm(n.nome), n)
  }

  // Adjacência "consome"/"agrega" só entre dados (consumidor → insumo; a
  // raiz → produto final tem a mesma direção de dependência).
  const consome = new Map<string, string[]>()
  for (const l of links) {
    const label = l.label ?? 'consome'
    if (label !== 'consome' && label !== 'agrega') continue
    const alvo = byId.get(l.target)
    if (!alvo || isSysOrg(alvo)) continue
    if (!consome.has(l.source)) consome.set(l.source, [])
    consome.get(l.source)?.push(l.target)
  }

  // Entradas memoizadas: insumo compartilhado vira o mesmo objeto nos ramos.
  const entries = new Map<string, LineageEntry>()
  const build = (id: string, trilha: ReadonlySet<string>): LineageEntry | null => {
    const cached = entries.get(id)
    if (cached) return cached
    const data = byId.get(id)
    if (!data || isSysOrg(data)) return null
    const entry: LineageEntry = {
      data,
      sistema: makeSource(data, 'sistema', sysByName),
      origem: makeSource(data, 'origem', orgByName),
      insumos: [],
    }
    entries.set(id, entry)
    for (const alvo of consome.get(id) ?? []) {
      if (trilha.has(alvo)) continue // guarda contra ciclo de "consome"
      const filho = build(alvo, new Set([...trilha, alvo]))
      if (filho) entry.insumos.push(filho)
    }
    return entry
  }
  return build(rootId, new Set([rootId]))
}

/** Linhagem completa com layout em colunas, lida da esquerda para a direita:
 *  nó focado à esquerda (x=0), cada fonte uma coluna à direita do seu produto
 *  e cada origem uma coluna além. */
export function buildLineage(
  rootId: string,
  nodes: readonly GraphNodeData[],
  links: readonly GraphLinkData[],
): Lineage | null {
  const root = buildLineageTree(rootId, nodes, links)
  if (!root) return null

  // Rótulo original de cada aresta dado→dado ("consome" ou "agrega" da raiz).
  const labelByPair = new Map<string, string>()
  for (const l of links) labelByPair.set(`${l.source}→${l.target}`, l.label ?? 'consome')

  // Achata a árvore em nós únicos (ordem de visita = agrupamento vertical
  // de cada cadeia perto do seu produto) e arestas deduplicadas.
  const nodeById = new Map<string, SimNode>()
  const graphLinks: GraphLinkData[] = []
  const linkKeys = new Set<string>()
  const addNode = (n: GraphNodeData) => {
    if (!nodeById.has(n.id)) nodeById.set(n.id, { ...n })
  }
  const addLink = (source: string, target: string, label: string) => {
    const key = `${source}→${target}`
    if (linkKeys.has(key)) return
    linkKeys.add(key)
    graphLinks.push({ source, target, label })
  }

  const seen = new Set<string>()
  const walk = (entry: LineageEntry) => {
    if (seen.has(entry.data.id)) return
    seen.add(entry.data.id)
    addNode(entry.data)
    if (entry.sistema) {
      addNode(entry.sistema.node)
      addLink(entry.data.id, entry.sistema.node.id, 'vem de')
      if (entry.origem) {
        addNode(entry.origem.node)
        addLink(entry.sistema.node.id, entry.origem.node.id, 'origina de')
      }
    } else if (entry.origem) {
      addNode(entry.origem.node)
      addLink(entry.data.id, entry.origem.node.id, 'origina de')
    }
    for (const filho of entry.insumos) {
      const label = labelByPair.get(`${entry.data.id}→${filho.data.id}`) ?? 'consome'
      addLink(entry.data.id, filho.data.id, label)
      walk(filho)
    }
  }
  walk(root)

  // Nível = distância máxima em saltos a partir do focado (caminho mais longo
  // no DAG focado→montante). Relaxamento simples: ≤ V passadas num grafo acíclico.
  const rank = new Map<string, number>([[root.data.id, 0]])
  for (let pass = 0, mudou = true; mudou && pass <= nodeById.size; pass++) {
    mudou = false
    for (const l of graphLinks) {
      const rs = rank.get(l.source)
      if (rs === undefined) continue
      if (rs + 1 > (rank.get(l.target) ?? -1)) {
        rank.set(l.target, rs + 1)
        mudou = true
      }
    }
  }

  // Colunas da esquerda (focado, x=0) para a direita; espaçamento vertical
  // uniforme por coluna, centrado, na ordem de visita da árvore.
  const porColuna = new Map<number, SimNode[]>()
  for (const [id, n] of nodeById) {
    const r = rank.get(id) ?? 0
    if (!porColuna.has(r)) porColuna.set(r, [])
    porColuna.get(r)?.push(n)
  }
  for (const [r, coluna] of porColuna) {
    coluna.forEach((n, i) => {
      const x = r * NIVEIS_COL_X
      const y = (i - (coluna.length - 1) / 2) * NIVEIS_ROW_Y
      n.x = x
      n.y = y
      n.fx = x
      n.fy = y
    })
  }

  // Cadeia do hover: fecho nas duas direções sobre as arestas da vista.
  const up = new Map<string, string[]>()
  const down = new Map<string, string[]>()
  for (const l of graphLinks) {
    if (!up.has(l.source)) up.set(l.source, [])
    if (!down.has(l.target)) down.set(l.target, [])
    up.get(l.source)?.push(l.target)
    down.get(l.target)?.push(l.source)
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

  const placeholderIds = new Set<string>()
  for (const [id, n] of nodeById) if (n.placeholder) placeholderIds.add(id)

  return {
    root,
    graph: { nodes: [...nodeById.values()], links: graphLinks as SimLink[] },
    ids: new Set(nodeById.keys()),
    placeholderIds,
    chainOf,
  }
}
