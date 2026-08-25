// Tipos do domínio (schema do graph.json — seção 3 do plano) e wrapper tipado
// da lib react-force-graph-2d. Todo acesso à lib passa por estes aliases para
// manter o resto do app 100% tipado (zero `any` fora daqui).
import type {
  ForceGraphMethods,
  LinkObject,
  NodeObject,
} from 'react-force-graph-2d'

export type Debito = 'sim' | 'nao' | 'avaliar'

/** Nó como emitido pelo build (scripts/build-graph.ts). Campos além de
 *  id/nome são opcionais para tolerar variações do JSON gerado. */
export interface GraphNodeData {
  id: string
  nome: string
  tipo?: string
  dominio?: string
  debito?: Debito
  owner?: string | null
  centroDeCusto?: string | null
  descricao?: string
  sistema?: string
  origem?: string
  status?: string
  incompleto?: boolean
  /** Nó fantasma: alvo de wikilink sem arquivo no vault. */
  fantasma?: boolean
  /** Nó derivado pelo build (camada de linhagem): sistema ou origem. */
  derivado?: boolean
  /** Corpo markdown do .md (pode não existir no JSON gerado). */
  corpo?: string
}

/** Camada visual do nó: dado (círculo), sistema (quadrado), origem (losango). */
export type NodeKind = 'dado' | 'sistema' | 'origem'

export function nodeKind(node: Pick<GraphNodeData, 'tipo' | 'derivado'>): NodeKind {
  if (node.tipo === 'sistema') return 'sistema'
  if (node.tipo === 'origem') return 'origem'
  return 'dado'
}

/** Nó da camada de linhagem (sistema/origem emitido pelo build). */
export function isDerivado(node: Pick<GraphNodeData, 'tipo' | 'derivado'>): boolean {
  return node.derivado === true || nodeKind(node) !== 'dado'
}

export interface GraphLinkData {
  source: string
  target: string
  label?: string
}

export interface GraphJson {
  nodes: GraphNodeData[]
  links: GraphLinkData[]
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
