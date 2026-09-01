// Vista em níveis: a partir de um componente focado, resolve o entorno dele
// seguindo o SENTIDO de cada verbo e distribui os nós alcançados em colunas —
// uma por nível, na ordem do bloco `niveis` do graph.json.
//
// Quanto de entorno entra é escolha do usuário, não constante do código: ver
// {@link Alcance}, a régua de três posições que a barra de foco expõe.
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
  VerboDef,
} from './graph-types'
import {
  isReal,
  linkLabel,
  nivelDe,
  ordemDoNivel,
  sentidoDoVerbo,
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
  /** Verbo declarado na aresta — o `label` do grafo, SEMPRE o do sentido em
   *  que a linha foi escrita. Não muda quando a travessia anda ao contrário:
   *  é `invertida` que diz isso, e quem exibe decide como marcar. */
  label: string
  /** A travessia andou da PONTA para a ORIGEM da aresta (verbo `jusante`, ou
   *  o lado de volta de um `ambos`). Quem envia aparece como montante de quem
   *  recebe, e o balão prefixa o papel com "↩". */
  invertida: boolean
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
  /** Cadeia completa do nó (montante + jusante) sobre as arestas da vista.
   *
   *  FORA DE USO na tela desde que o destaque passou a ir só até o primeiro
   *  nível (vizinhanca-destacada.ts): o hover deixou de acender a cadeia
   *  inteira, e o que percorre a cadeia hoje é o RASTRO — o usuário fixa um nó
   *  por vez e monta o caminho que quer, em vez de o mapa acender todo o fecho
   *  de uma vez. Continua aqui, e testada, porque responde a uma pergunta que
   *  o mapa ainda não tem como responder de outro jeito ("até onde este
   *  componente chega", ver Pendências no CONTINUAR.md). */
  chainOf(id: string): Set<string>
}

/** Um passo da travessia: de quem sai, para quem vai, com que verbo e se a
 *  aresta foi percorrida ao contrário do que ela declara. */
interface PassoDaTravessia {
  para: string
  label: string
  invertida: boolean
}

/**
 * Até onde o foco ALCANÇA a partir do componente — quem entra na vista.
 *
 * O foco sempre foi a cadeia montante e nada mais, e isso escondia metade do
 * que um componente declara: um Job que `envia` para uma tabela é a ORIGEM
 * daquela aresta, e a travessia montante (que para um verbo `jusante` sobe da
 * ponta para a origem) nunca chega ao alvo. Focar no Job mostrava só o que ele
 * consome. O alcance é a resposta: em vez de uma constante, um controle.
 *
 *   `montante`  a cadeia de que o componente depende, recursiva — o
 *               comportamento de sempre, sem uma vírgula de diferença;
 *   `vizinhos`  o montante inteiro MAIS todo vizinho de primeiro nível do
 *               focado, em qualquer sentido (inclusive o do verbo `nenhum`,
 *               que não conduz dado mas é uma ligação declarada — e o pedido é
 *               ver TODAS as ligações do componente);
 *   `ambos`     montante e jusante, os dois recursivos.
 *
 * As três posições são uma ESCADA: cada uma contém a anterior. É por isso que
 * `ambos` também traz os vizinhos diretos — sem isso, andar do meio para a
 * direita esconderia justamente o vizinho ligado por um verbo sem sentido, e um
 * controle de "alcance" que tira coisa ao ser aumentado não se explica.
 */
export type Alcance = 'montante' | 'vizinhos' | 'ambos'

/** As três posições, na ordem do controle (menor → maior alcance). */
export const ALCANCES: readonly Alcance[] = ['montante', 'vizinhos', 'ambos']

/** Alcance com que a TELA abre o foco.
 *
 *  Não é o default de {@link buildLineage}, e a diferença é de propósito: a
 *  função assume `montante` para que nenhuma chamada antiga mude de resultado
 *  ao ganhar o parâmetro, e a tela assume `vizinhos` porque é ele que responde
 *  à queixa ("só aparecem as de consumo") sem estourar o mapa. */
export const ALCANCE_INICIAL: Alcance = 'vizinhos'

/** Slug conhecido? Usado por quem lê o alcance de fora (URL). */
export function ehAlcance(valor: string | null): valor is Alcance {
  return valor !== null && (ALCANCES as readonly string[]).includes(valor)
}

/**
 * Índice dos passos MONTANTE por componente: de cada um, para onde a linhagem
 * sobe, com o verbo e se a aresta foi lida ao contrário do que declara.
 *
 * É a ÚNICA leitura do `sentido` no módulo — a árvore (buildLineageTree) e o
 * alcance do mapa (buildLineage) saem daqui, e assim não existem duas respostas
 * para "por onde a linhagem anda".
 */
function indiceMontante(
  byId: ReadonlyMap<string, GraphNodeData>,
  links: readonly GraphLinkData[],
  verbos: readonly VerboDef[],
): Map<string, PassoDaTravessia[]> {
  const saidas = new Map<string, PassoDaTravessia[]>()
  const passo = (de: string, p: PassoDaTravessia) => {
    const lista = saidas.get(de)
    if (lista) lista.push(p)
    else saidas.set(de, [p])
  }
  for (const l of links) {
    if (!byId.has(l.source) || !byId.has(l.target)) continue
    const label = linkLabel(l)
    const sentido = sentidoDoVerbo(verbos, label)
    if (sentido === 'nenhum') continue
    if (sentido === 'montante' || sentido === 'ambos') {
      passo(l.source, { para: l.target, label, invertida: false })
    }
    if (sentido === 'jusante' || sentido === 'ambos') {
      passo(l.target, { para: l.source, label, invertida: true })
    }
  }
  return saidas
}

/**
 * O que o alcance ACRESCENTA à cadeia montante do componente focado.
 *
 * Só ids: quem entra na vista entra como qualquer outro nó, na coluna do seu
 * nível, e as arestas vêm de graça — buildLineage já desenha toda aresta cujas
 * duas pontas estão na vista.
 */
function extraDoAlcance(
  rootId: string,
  alcance: Alcance,
  byId: ReadonlyMap<string, GraphNodeData>,
  links: readonly GraphLinkData[],
  verbos: readonly VerboDef[],
): Set<string> {
  const extra = new Set<string>()
  if (alcance === 'montante') return extra

  // Vizinhos de primeiro nível do FOCADO, em qualquer sentido. Aqui a aresta
  // vale pelo que ela é — uma ligação declarada —, e não pelo sentido do verbo:
  // é a posição que existe para mostrar tudo que o componente declara.
  for (const l of links) {
    if (!byId.has(l.source) || !byId.has(l.target)) continue
    if (l.source === rootId) extra.add(l.target)
    else if (l.target === rootId) extra.add(l.source)
  }
  if (alcance === 'vizinhos') {
    extra.delete(rootId)
    return extra
  }

  // `ambos`: mais a cadeia JUSANTE inteira — o inverso exato dos passos que a
  // árvore montante percorre, e por isso lendo o mesmo índice. Não é o fecho
  // não direcionado do grafo: quem consome um IRMÃO do focado não entra, senão
  // qualquer componente de um grafo conexo abriria o mapa inteiro.
  const desce = new Map<string, string[]>()
  for (const [de, passos] of indiceMontante(byId, links, verbos)) {
    for (const { para } of passos) {
      const lista = desce.get(para)
      if (lista) lista.push(de)
      else desce.set(para, [de])
    }
  }
  // `vistos` é separado de `extra` de propósito: um vizinho direto já está em
  // `extra` sem ter sido percorrido, e reusar o conjunto como marca de visita
  // pararia a descida justamente no primeiro passo dela.
  const vistos = new Set<string>([rootId])
  const fila = [rootId]
  while (fila.length > 0) {
    const atual = fila.pop()
    if (atual === undefined) break
    for (const viz of desce.get(atual) ?? []) {
      if (vistos.has(viz)) continue
      vistos.add(viz)
      extra.add(viz)
      fila.push(viz)
    }
  }
  extra.delete(rootId)
  return extra
}

/**
 * Árvore montante de um componente: ele, tudo que consome e tudo a que se
 * associa, recursivamente. null quando o id não existe no grafo.
 *
 * O SENTIDO do verbo é quem decide por onde a travessia anda — não a direção
 * em que a aresta foi declarada. `montante` (o consumo de sempre) sobe para o
 * alvo; `jusante` sobe para a ORIGEM (quem envia é insumo de quem recebe);
 * `ambos` sobe dos dois lados; `nenhum` fica de fora da árvore. `verbos`
 * vazio = tudo montante, que é o comportamento de antes do vocabulário.
 */
export function buildLineageTree(
  rootId: string,
  nodes: readonly GraphNodeData[],
  links: readonly GraphLinkData[],
  verbos: readonly VerboDef[] = [],
): LineageEntry | null {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  if (!byId.has(rootId)) return null

  const saidas = indiceMontante(byId, links, verbos)

  // Entradas memoizadas: alvo compartilhado vira o mesmo objeto em cada ramo.
  const entries = new Map<string, LineageEntry>()
  const build = (id: string, trilha: ReadonlySet<string>): LineageEntry | null => {
    const cached = entries.get(id)
    if (cached) return cached
    const data = byId.get(id)
    if (!data) return null
    const entry: LineageEntry = { data, upstream: [] }
    entries.set(id, entry)
    for (const { para, label, invertida } of saidas.get(id) ?? []) {
      // Guarda contra ciclo — e com `ambos` ela passa a valer sempre: a mesma
      // aresta é um passo de ida e um de volta, e sem a trilha a recursão
      // voltaria para quem acabou de chamá-la.
      if (trilha.has(para)) continue
      const filho = build(para, new Set([...trilha, para]))
      if (filho) entry.upstream.push({ label, invertida, entry: filho })
    }
    return entry
  }
  return build(rootId, new Set([rootId]))
}

/**
 * Linhagem com layout em colunas: nó focado à esquerda e uma coluna por nível
 * presente, na ordem do bloco `niveis`.
 *
 * `rootId` null abre o INVENTÁRIO completo: todo componente do catálogo entra
 * na coluna do seu nível, mesmo sem nenhuma aresta. É o que mantém o mapa
 * legível enquanto as ligações estão sendo construídas, e o que faz a vista em
 * níveis existir sem depender de nenhum componente em particular.
 *
 * Focar em QUALQUER componente mostra só a sub-árvore dele — inclusive nos
 * componentes da primeira coluna. Houve uma exceção aqui: o foco num nó do
 * nível de menor ordem também abria o inventário, para o app poder "abrir
 * focado" na entrada e ainda assim mostrar o mapa cheio. O efeito colateral era
 * que focar num componente da primeira coluna não isolava nada, e a barra
 * anunciava um foco que não estava valendo. A entrada do app passou a ser
 * simplesmente "sem foco", que já significa inventário pelo caminho legítimo.
 *
 * O {@link Alcance} diz quanto do entorno entra além da cadeia montante. O
 * default é `montante` — o comportamento de sempre —, e não o padrão da tela:
 * ganhar o parâmetro não pode mudar o resultado de nenhuma chamada que não o
 * passe. Sem foco (`rootId` null) ele não tem o que fazer: o inventário já é
 * todo o catálogo.
 */
export function buildLineage(
  rootId: string | null,
  nodes: readonly GraphNodeData[],
  links: readonly GraphLinkData[],
  niveis: readonly NivelDef[] = [],
  verbos: readonly VerboDef[] = [],
  alcance: Alcance = 'montante',
): Lineage | null {
  // Sem foco, a vista é só o inventário: nenhum componente é indispensável,
  // então o mapa em níveis existe mesmo com a primeira coluna vazia.
  const root = rootId === null ? null : buildLineageTree(rootId, nodes, links, verbos)
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

  // O alcance entra DEPOIS da árvore: ela é a espinha da vista (e a ordem de
  // visita dela é o que agrupa cada cadeia perto de quem a puxou), e o que o
  // alcance faz é pendurar mais componentes ao redor — nunca reordenar o que
  // já estava. `root` continua sendo a árvore MONTANTE pura, e é isso que
  // mantém a linhagem do balão fora desta decisão.
  if (rootId !== null && alcance !== 'montante') {
    const byId = new Map(nodes.map((n) => [n.id, n]))
    for (const id of extraDoAlcance(rootId, alcance, byId, links, verbos)) {
      const n = byId.get(id)
      if (n) addNode(n)
    }
  }

  if (root === null) {
    for (const n of nodes) if (isReal(n)) addNode(n)
  }

  // Toda aresta cujas duas pontas estão na vista — inclusive as que ligam nós
  // irmãos, que a árvore montante não percorre.
  //
  // A chave de dedup é a MESMA do build (source \0 target \0 label): duas
  // linhas do catálogo podem declarar verbos diferentes entre o mesmo par
  // ("envia" e "associado", por exemplo), e são duas arestas. Enquanto a chave
  // ignorava o label, as duas colapsavam numa só e qual sobrevivia era
  // arbitrário — a segunda sumia do mapa sem nenhum aviso.
  const graphLinks: GraphLinkData[] = []
  const linkKeys = new Set<string>()
  for (const l of links) {
    if (!nodeById.has(l.source) || !nodeById.has(l.target)) continue
    const label = linkLabel(l)
    const key = `${l.source}\u0000${l.target}\u0000${label}`
    if (linkKeys.has(key)) continue
    linkKeys.add(key)
    graphLinks.push({ source: l.source, target: l.target, label })
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
  //
  // Aresta de verbo `nenhum` fica de fora — ela é desenhada, mas não conduz
  // dado nenhum. Como o fecho aqui é NÃO direcionado, incluí-la acenderia,
  // pelo lado errado, a cadeia inteira de quem só está "relacionado".
  //
  // O ALCANCE NÃO ENTRA AQUI, e isso é decisão, não esquecimento. São duas
  // perguntas diferentes: o alcance responde "o que ENTRA na vista", o chainOf
  // responde "o que ACENDE dentro dela". Ele já é calculado sobre `graphLinks`,
  // as arestas da vista — então segue o alcance sozinho, sem uma segunda regra:
  // trazer mais componentes traz mais arestas, e a cadeia acesa cresce junto.
  // Filtrá-lo pelo alcance seria pior nas duas pontas: em `montante` o hover
  // deixaria de acender o lado jusante que ele acende hoje (e a posição tem de
  // reproduzir o comportamento atual, à risca), e nas outras duas o usuário
  // teria dois conceitos de "cadeia" para conciliar na mesma tela.
  const up = new Map<string, string[]>()
  const down = new Map<string, string[]>()
  for (const l of graphLinks) {
    if (sentidoDoVerbo(verbos, linkLabel(l)) === 'nenhum') continue
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
