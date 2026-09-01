// Helpers da visão de tabela (TableView): uma linha POR COMPONENTE, com as
// relações de saída resolvidas nos nós de destino. Puros, sem React, para
// facilitar teste.
import type { Debito, GraphLinkData, GraphNodeData, NivelDef, VerboDef } from './graph-types'
import { isReal, linkLabel, nivelDe, ordemDoNivel, tituloDoNivel, tituloDoVerbo } from './graph-types'

/** Ordem executiva dos domínios (mesma da tabela que originou o projeto). */
export const DOMAIN_ORDER: readonly string[] = [
  'Cadastro',
  'Mercado',
  'Risco',
  'Resultado',
  'Regulatorio',
  'A definir',
]

/** O JSON guarda domínios sem acento; a exibição corrige. */
const DOMAIN_DISPLAY: Record<string, string> = {
  Regulatorio: 'Regulatório',
}

/** Domínio ausente OU vazio (coluna em branco no CSV) é "A definir". */
function domainOrDefault(dominio: string | undefined): string {
  const d = (dominio ?? '').trim()
  return d === '' ? 'A definir' : d
}

export function domainLabel(dominio: string | undefined): string {
  const d = domainOrDefault(dominio)
  return DOMAIN_DISPLAY[d] ?? d
}

export function domainRank(dominio: string | undefined): number {
  const i = DOMAIN_ORDER.indexOf(domainOrDefault(dominio))
  return i === -1 ? DOMAIN_ORDER.length : i
}

export const STATUS_LABEL: Record<string, string> = {
  producao: 'Produção',
  transicao: 'Transição',
  investigacao: 'Investigação',
}

export function statusLabel(status: string | undefined): string {
  if (!status) return ''
  return STATUS_LABEL[status] ?? status
}

/** Débito ordena por severidade: Sim > A avaliar > Não. */
const DEBITO_RANK: Record<Debito, number> = { sim: 0, avaliar: 1, nao: 2 }

function debitoRank(debito: Debito | undefined): number {
  return debito ? DEBITO_RANK[debito] : DEBITO_RANK.avaliar
}

const STATUS_RANK: Record<string, number> = {
  producao: 0,
  transicao: 1,
  investigacao: 2,
}

function statusRank(status: string | undefined): number {
  return status !== undefined && status in STATUS_RANK ? STATUS_RANK[status] : 3
}

/** Valor ainda pendente de mapeamento ("a confirmar", "a identificar"…). */
export function isPendingValue(value: string | undefined): boolean {
  return value !== undefined && /^a (confirmar|identificar|detalhar|definir)\b/i.test(value)
}

/** Minúsculas e sem acentos, para busca tolerante. */
export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

const COLLATOR = new Intl.Collator('pt-BR', { sensitivity: 'base' })

/** Uma relação de saída da linha: o componente alvo e o verbo declarado.
 *
 *  O verbo vem em duas metades pelo mesmo motivo que o nível — `verbo` é o
 *  slug (o `label` da aresta, que é o que compara com o padrão) e
 *  `verboTitulo` é o que a tela mostra e o filtro procura. */
export interface RelacaoDeSaida {
  node: GraphNodeData
  verbo: string
  verboTitulo: string
}

/** Linha da tabela = um componente do catálogo. */
export interface ComponenteRow {
  /** Chave estável para o React (o próprio id do nó). */
  key: string
  node: GraphNodeData
  /** Slug e título do nível do componente. */
  nivel: string
  nivelTitulo: string
  /** Ordem do nível (ordenação da coluna Nível). */
  nivelOrdem: number
  /** Relações declaradas NESTA linha (as arestas de saída): o alvo e o verbo
   *  de cada uma. Quem se relaciona com ELA se lê pelas arestas de entrada. */
  consome: RelacaoDeSaida[]
}

/** Uma linha por componente real (fantasmas ficam fora: não têm linha no
 *  catálogo). As relações vêm das arestas de saída, resolvidas nos nós. */
export function buildRows(
  nodes: readonly GraphNodeData[],
  links: readonly GraphLinkData[],
  niveis: readonly NivelDef[] = [],
  verbos: readonly VerboDef[] = [],
): ComponenteRow[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const consome = new Map<string, RelacaoDeSaida[]>()
  for (const l of links) {
    const alvo = byId.get(l.target)
    if (!alvo) continue
    const verbo = linkLabel(l)
    const rel: RelacaoDeSaida = { node: alvo, verbo, verboTitulo: tituloDoVerbo(verbos, verbo) }
    const lista = consome.get(l.source)
    if (lista) lista.push(rel)
    else consome.set(l.source, [rel])
  }
  // Duas relações podem ter o mesmo alvo com verbos diferentes: o verbo
  // desempata, senão a ordem das duas dependeria da ordem das arestas.
  const porNome = (a: RelacaoDeSaida, b: RelacaoDeSaida) =>
    COLLATOR.compare(a.node.nome, b.node.nome) || COLLATOR.compare(a.verboTitulo, b.verboTitulo)

  return nodes.filter(isReal).map((node) => {
    const slug = nivelDe(node)
    return {
      key: node.id,
      node,
      nivel: slug,
      nivelTitulo: tituloDoNivel(niveis, slug),
      nivelOrdem: ordemDoNivel(niveis, slug),
      consome: [...(consome.get(node.id) ?? [])].sort(porNome),
    }
  })
}

/** Filtro rápido sobre a linha: nome, descrição, nível, domínio, governança e
 *  as relações dela — nome do alvo E título do verbo, para "envia" achar as
 *  linhas que enviam. Insensível a acentos. */
export function matchesFilter(row: ComponenteRow, query: string): boolean {
  const q = normalizeText(query.trim())
  if (q === '') return true
  const { node } = row
  const haystack = normalizeText(
    [
      node.nome,
      node.descricao ?? '',
      row.nivelTitulo,
      node.tipoComponente ?? '',
      node.dominio ?? '',
      node.status ?? '',
      node.owner ?? '',
      node.centroDeCusto ?? '',
      ...row.consome.flatMap((r) => [r.node.nome, r.verboTitulo]),
    ].join('\n'),
  )
  return haystack.includes(q)
}

export type SortKey =
  | 'nivel'
  | 'nome'
  | 'tipo'
  | 'dominio'
  | 'debito'
  | 'status'
  | 'owner'
  | 'centroDeCusto'
export type SortDir = 'asc' | 'desc'

/** Vazio vai sempre para o fim, em qualquer direção. */
function compareTexto(a: string, b: string): number {
  if (a === '' || b === '') return (a === '' ? 1 : 0) - (b === '' ? 1 : 0)
  return COLLATOR.compare(a, b)
}

function compareBy(a: ComponenteRow, b: ComponenteRow, key: SortKey): number {
  switch (key) {
    case 'nivel':
      return a.nivelOrdem - b.nivelOrdem || compareTexto(a.nivelTitulo, b.nivelTitulo)
    case 'nome':
      return COLLATOR.compare(a.node.nome, b.node.nome)
    case 'tipo':
      return compareTexto(a.node.tipoComponente ?? '', b.node.tipoComponente ?? '')
    case 'dominio':
      return domainRank(a.node.dominio) - domainRank(b.node.dominio)
    case 'debito':
      return debitoRank(a.node.debito) - debitoRank(b.node.debito)
    case 'status':
      return statusRank(a.node.status) - statusRank(b.node.status)
    case 'owner':
      return compareTexto(a.node.owner ?? '', b.node.owner ?? '')
    case 'centroDeCusto':
      return compareTexto(a.node.centroDeCusto ?? '', b.node.centroDeCusto ?? '')
  }
}

/** Cópia ordenada; desempata por nível e nome para o resultado ser estável. */
export function sortRows(
  rows: readonly ComponenteRow[],
  key: SortKey,
  dir: SortDir,
): ComponenteRow[] {
  const sign = dir === 'desc' ? -1 : 1
  return [...rows].sort((a, b) => {
    const primary = compareBy(a, b, key)
    if (primary !== 0) return sign * primary
    const byNivel = a.nivelOrdem - b.nivelOrdem
    if (byNivel !== 0) return byNivel
    return COLLATOR.compare(a.node.nome, b.node.nome)
  })
}
