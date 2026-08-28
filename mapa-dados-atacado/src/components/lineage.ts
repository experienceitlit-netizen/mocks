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
import { extentDoDado, grausPorId, ROTULO_E_FOLGA } from './node-size'

/** Distância entre colunas (x). */
export const NIVEIS_COL_X = 193

/** Passo vertical MÍNIMO entre dois nós de uma coluna.
 *
 *  Era o passo único e virou o piso: um passo constante que serve ao nó comum
 *  deixa o rótulo de um nó GRANDE encostado no vizinho de baixo, e nó grande
 *  existe — um hub de grau alto chega perto do dobro do raio comum. 70 continua
 *  sendo o que se vê na maior parte do mapa (é mais folgado que a soma das duas
 *  extensões e do rótulo no caso comum) e só perde a vez quando dois vizinhos
 *  são de fato grandes (ver {@link passoEntre}). */
export const NIVEIS_ROW_Y = 70

/** Passo entre dois nós VIZINHOS de uma coluna: o que a geometria exige, nunca
 *  menos que o passo padrão.
 *
 *  A conta é "a metade de baixo do primeiro + o rótulo dele + o respiro + a
 *  metade de cima do segundo": é exatamente o que o canvas desenha (o rótulo sai
 *  em `y + extent + 3`), então o espaçamento não é uma estimativa — é a mesma
 *  medida do desenho. */
function passoEntre(
  a: SimNode,
  b: SimNode,
  graus: ReadonlyMap<string, number>,
): number {
  return Math.max(
    NIVEIS_ROW_Y,
    extentDoDado(a, graus) + extentDoDado(b, graus) + ROTULO_E_FOLGA,
  )
}

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
  /** Extensão (centro → silhueta) do PRIMEIRO e do ÚLTIMO nó da coluna. É o que
   *  falta para a faixa desenhada saber onde começa e onde termina de verdade:
   *  yMin/yMax são CENTROS, e um nó com ícone chega bem mais longe do centro que
   *  o padding padrão previa. Ausente = coluna montada por quem não mede nós
   *  (fixtures de teste), e aí valem os paddings de sempre. */
  extentTopo?: number
  extentBase?: number
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
  // não vira coluna); coluna centrada em y=0, com o passo entre cada par de
  // vizinhos medido pelos DOIS nós (ver passoEntre) — no caso comum todos os
  // passos dão o mesmo NIVEIS_ROW_Y de sempre.
  //
  // Os graus saem das MESMAS arestas que o App conta para o Graph, então o raio
  // com que a coluna se espaça é o raio com que o canvas desenha.
  const graus = grausPorId(nodes, links)
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
    const passos = coluna.slice(1).map((n, i) => passoEntre(coluna[i], n, graus))
    const altura = passos.reduce((soma, p) => soma + p, 0)
    let y = -altura / 2
    coluna.forEach((n, i) => {
      if (i > 0) y += passos[i - 1]
      n.x = x
      n.y = y
      n.fx = x
      n.fy = y
    })
    const nivel = niveis.find((nv) => nv.slug === slug)
    columns.push({
      slug,
      label: tituloDoNivel(niveis, slug),
      x,
      yMin: -altura / 2,
      yMax: altura / 2,
      corFundo: nivel?.corFundo,
      corBorda: nivel?.corBorda,
      extentTopo: coluna.length === 0 ? 0 : extentDoDado(coluna[0], graus),
      extentBase: coluna.length === 0 ? 0 : extentDoDado(coluna[coluna.length - 1], graus),
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
