// Tipos do domínio (schema do graph.json — seção 3 do plano) e wrapper tipado
// da lib react-force-graph-2d. Todo acesso à lib passa por estes aliases para
// manter o resto do app 100% tipado (zero `any` fora daqui).
import type {
  ForceGraphMethods,
  LinkObject,
  NodeObject,
} from 'react-force-graph-2d'

export type Debito = 'sim' | 'nao' | 'avaliar'

/** Nível do produto de dado no modelo executivo em 4 camadas:
 *  primário (tem origem/sistema próprios, não consome nada), final
 *  (derivado de primários via "consome"; sistema/origem null = não se aplica),
 *  ambos (primário que também é produto final) ou raiz (nó único do domínio
 *  que agrega todos os produtos finais via arestas "agrega").
 *  'secundario' é o nome legado de 'final' (graph.json antigo). */
export type Nivel = 'primario' | 'secundario' | 'final' | 'ambos' | 'raiz'

/** Ponto ÚNICO de tratamento do legado: 'secundario' (JSON/CSV antigos) é o
 *  nível 'final'. Todo código que compara/rotula nível passa por aqui. */
export function normalizeNivel(nivel: Nivel): Nivel
export function normalizeNivel(nivel: Nivel | undefined): Nivel | undefined
export function normalizeNivel(nivel: Nivel | undefined): Nivel | undefined {
  return nivel === 'secundario' ? 'final' : nivel
}

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
  /** null = não se aplica (secundário); string pendente = "a confirmar…". */
  sistema?: string | null
  /** null = não se aplica (secundário); string pendente = "a confirmar…". */
  origem?: string | null
  nivel?: Nivel
  status?: string
  /** Nomes das fontes secundárias (tabelas UCS), na ordem do frontmatter;
   *  os nós fsec-* correspondentes vêm das arestas "vem de" dado→fsec. */
  fontesSecundarias?: string[]
  incompleto?: boolean
  /** Nó fantasma: citado em "consome" sem linha no catálogo. */
  fantasma?: boolean
  /** Nó derivado pelo build (camada de linhagem): sistema ou origem. */
  derivado?: boolean
  /** Componente com linha própria no catálogo (domínio/origem/fonte/fonte
   *  secundária cadastrados): carrega descricao/owner/centroDeCusto/corpo. */
  cadastrado?: boolean
  /** Nó sintetizado na UI: fonte/origem desconhecida na vista de linhagem. */
  placeholder?: boolean
  /** Corpo markdown do .md (pode não existir no JSON gerado). */
  corpo?: string
}

/** Camada visual do nó: dado (círculo), domínio (quadrado arredondado na cor
 *  da área), fonte secundária (quadrado de cantos bem arredondados), sistema
 *  (quadrado), origem (losango). */
export type NodeKind = 'dado' | 'dominio' | 'fonte-secundaria' | 'sistema' | 'origem'

export function nodeKind(node: Pick<GraphNodeData, 'tipo' | 'derivado'>): NodeKind {
  if (node.tipo === 'sistema') return 'sistema'
  if (node.tipo === 'origem') return 'origem'
  if (node.tipo === 'fonte-secundaria') return 'fonte-secundaria'
  // A raiz também tem tipo "dominio", mas é nó de dado (criado pelo build);
  // só o nó de domínio derivado pelo build ganha a forma própria.
  if (node.tipo === 'dominio' && node.derivado === true) return 'dominio'
  return 'dado'
}

/** Nó derivado pelo build (domínio, sistema ou origem — sem linha no catálogo). */
export function isDerivado(node: Pick<GraphNodeData, 'tipo' | 'derivado'>): boolean {
  return node.derivado === true || nodeKind(node) !== 'dado'
}

/** Nó de domínio derivado (nível entre a raiz e os produtos finais). */
export function isDominio(node: Pick<GraphNodeData, 'tipo' | 'derivado'>): boolean {
  return nodeKind(node) === 'dominio'
}

/** Nível "ambos" conta nos dois lados do modelo executivo. */
export function isPrimario(node: Pick<GraphNodeData, 'nivel'>): boolean {
  return node.nivel === 'primario' || node.nivel === 'ambos'
}

/** Produto final ('final', legado 'secundario') ou 'ambos'. */
export function isSecundario(node: Pick<GraphNodeData, 'nivel'>): boolean {
  const nivel = normalizeNivel(node.nivel)
  return nivel === 'final' || nivel === 'ambos'
}

/** Nó-raiz do domínio ("Atacado — Dados"): agrega os produtos finais, mas não
 *  é um produto de dado — fica fora de contadores, filtros e tabela. */
export function isRaiz(node: Pick<GraphNodeData, 'nivel'>): boolean {
  return node.nivel === 'raiz'
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
