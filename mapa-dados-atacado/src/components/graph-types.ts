// Tipos do domínio (schema do graph.json) e wrapper tipado da lib
// react-force-graph-2d. Todo acesso à lib passa por estes aliases para manter o
// resto do app 100% tipado (zero `any` fora daqui).
//
// MODELO ÚNICO: todo nó é um COMPONENTE que pertence a um NÍVEL. Não existe
// categoria especial de nó — raiz, domínio, fonte e origem são níveis como
// qualquer outro, e o que separa um componente de outro é o `nivel` (coluna na
// vista em níveis) e o `tipoComponente` (forma no mapa).
import type {
  ForceGraphMethods,
  LinkObject,
  NodeObject,
} from 'react-force-graph-2d'

export type Debito = 'sim' | 'nao' | 'avaliar'

/** O que o componente É fisicamente. Define a FORMA do nó no mapa (a cor fica
 *  com a semântica de débito) e é independente do nível: uma Tabela Delta pode
 *  estar em qualquer camada. */
export type TipoComponente = 'Tabela SQL' | 'Tabela Delta' | 'Excel' | 'Default'

export const TIPOS_COMPONENTE: readonly TipoComponente[] = [
  'Tabela SQL',
  'Tabela Delta',
  'Excel',
  'Default',
]

/** Valor assumido quando a linha não declara nada. */
export const TIPO_COMPONENTE_PADRAO: TipoComponente = 'Default'

const TIPOS_VALIDOS = new Set<string>(TIPOS_COMPONENTE)

/** Ponto único de leitura do tipo: valor ausente ou fora do vocabulário cai no
 *  padrão, então forma e select nunca ficam indefinidos. */
export function tipoComponenteDe(node: Pick<GraphNodeData, 'tipoComponente'>): TipoComponente {
  const t = node.tipoComponente
  return t !== undefined && TIPOS_VALIDOS.has(t) ? t : TIPO_COMPONENTE_PADRAO
}

/** Definição de um nível (bloco `niveis` do graph.json). A ordem numérica
 *  posiciona a coluna na vista em níveis (asc = esquerda → direita) e define
 *  qual é o nível de ENTRADA do mapa (o de menor ordem). `builtin` diz apenas
 *  que o nível veio com o modelo — não muda o comportamento de nada. */
export interface NivelDef {
  slug: string
  titulo: string
  ordem: number
  builtin: boolean
  /** Cor "#rrggbb" da faixa do nível na vista em níveis; ausente = padrão.
   *  Escolha livre de quem cadastrou o nível — o código não deriva cor de nome
   *  nenhum. Quem desenha aplica alpha (ver band-colors.ts). */
  corFundo?: string
  /** Cor "#rrggbb" da borda da faixa, que o título também herda. */
  corBorda?: string
}

/** Nó como emitido pelo build (scripts/build-graph.ts). Campos além de
 *  id/nome são opcionais para tolerar variações do JSON gerado. */
export interface GraphNodeData {
  id: string
  nome: string
  /** Slug do nível a que o componente pertence (coluna na vista em níveis). */
  nivel?: string
  tipoComponente?: TipoComponente
  dominio?: string
  debito?: Debito
  status?: string
  owner?: string | null
  centroDeCusto?: string | null
  descricao?: string
  /** Corpo markdown das observações. */
  corpo?: string
  /** Sem owner ou sem centro de custo: borda tracejada no mapa. */
  incompleto?: boolean
  /** Nó fantasma: citado em "consome"/"vem de" sem linha no catálogo. */
  fantasma?: boolean
}

/** Slug do nível do nó ('' quando a linha ainda não declara nenhum). */
export function nivelDe(node: Pick<GraphNodeData, 'nivel'>): string {
  return node.nivel ?? ''
}

/** Débito do nó para cor, chip e filtro: o build emite "" na linha que ainda
 *  não declarou nada, e isso vale "a avaliar" — a mesma leitura em toda a UI.
 *  Quem precisa distinguir "não declarado" de "avaliar" (a tabela, que mostra
 *  "⚠ a definir") lê `node.debito` direto. */
export function debitoDe(node: Pick<GraphNodeData, 'debito'>): Debito {
  return node.debito === 'sim' || node.debito === 'nao' ? node.debito : 'avaliar'
}

/** Componente com linha própria no catálogo (o oposto do fantasma). */
export function isReal(node: Pick<GraphNodeData, 'fantasma'>): boolean {
  return node.fantasma !== true
}

/** Rótulo de um nível pelo slug, com o próprio slug como último recurso. */
export function tituloDoNivel(niveis: readonly NivelDef[], slug: string): string {
  return niveis.find((nv) => nv.slug === slug)?.titulo ?? (slug === '' ? 'Sem nível' : slug)
}

/** Ordem numérica de um nível; slug desconhecido vai para o fim da fila. */
export function ordemDoNivel(niveis: readonly NivelDef[], slug: string): number {
  const nv = niveis.find((n) => n.slug === slug)
  if (nv) return nv.ordem
  return Math.max(0, ...niveis.map((n) => n.ordem)) + 1
}

/** Níveis derivados dos próprios nós, para o graph.json que ainda não traz o
 *  bloco `niveis`: um nível por slug presente, em ordem alfabética. */
export function derivarNiveis(nodes: readonly GraphNodeData[]): NivelDef[] {
  const slugs = [...new Set(nodes.map(nivelDe).filter((s) => s !== ''))].sort((a, b) =>
    a.localeCompare(b, 'pt-BR'),
  )
  return slugs.map((slug, i) => ({
    slug,
    titulo: slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, ' '),
    ordem: i * 10,
    builtin: false,
  }))
}

/** Nível de ENTRADA: o de menor `ordem` entre os que têm componente no grafo.
 *  É o topo da cadeia — focar num componente dele abre o inventário completo
 *  (todos os nós, cada um na sua coluna). null = grafo sem nenhum nível. */
export function nivelDeEntrada(
  nodes: readonly GraphNodeData[],
  niveis: readonly NivelDef[],
): string | null {
  const presentes = new Set(nodes.filter(isReal).map(nivelDe).filter((s) => s !== ''))
  let melhor: NivelDef | null = null
  for (const nv of niveis) {
    if (presentes.has(nv.slug) && (melhor === null || nv.ordem < melhor.ordem)) melhor = nv
  }
  return melhor === null ? null : melhor.slug
}

/** Componente de entrada do app (foco padrão sem parâmetros na URL): o único
 *  nó do nível de entrada. Com mais de um componente nesse nível não há
 *  entrada óbvia e o app abre no mapa completo. */
export function noDeEntrada(
  nodes: readonly GraphNodeData[],
  niveis: readonly NivelDef[],
): GraphNodeData | null {
  const slug = nivelDeEntrada(nodes, niveis)
  if (slug === null) return null
  const doNivel = nodes.filter((n) => isReal(n) && nivelDe(n) === slug)
  return doNivel.length === 1 ? doNivel[0] : null
}

/** Relação entre dois componentes: consumo de dado ou associação declarada. */
export type LinkLabel = 'consome' | 'vem de'

export interface GraphLinkData {
  source: string
  target: string
  label?: string
}

/** Aresta sem rótulo é consumo (formato antigo do build). */
export function linkLabel(link: Pick<GraphLinkData, 'label'>): string {
  return link.label ?? 'consome'
}

export interface GraphJson {
  nodes: GraphNodeData[]
  links: GraphLinkData[]
  /** TODOS os níveis, ordenados por `ordem`. Ausente em builds antigos — use
   *  derivarNiveis(nodes). */
  niveis?: NivelDef[]
}

/** Nó/aresta em tempo de simulação (a lib injeta x, y, vx, vy…). */
export type SimNode = NodeObject<GraphNodeData>
export type SimLink = LinkObject<GraphNodeData, GraphLinkData>
export type GraphMethods = ForceGraphMethods<SimNode, SimLink>

/** A simulação troca source/target de string para o objeto do nó. */
export function linkEndId(end: string | number | SimNode | undefined): string {
  if (typeof end === 'object' && end !== null) return String(end.id)
  return String(end)
}
