// Helpers da visão de tabela (TableView). Derivação das cadeias (uma linha
// por aresta "consome" primário→secundário, como na tabela executiva), regras
// de ordenação, agrupamento por domínio e filtro sem acentos — puros, sem
// React, para facilitar teste.
import type { Debito, GraphLinkData, GraphNodeData } from './graph-types'
import { isDerivado, isRaiz } from './graph-types'

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

export function domainLabel(dominio: string | undefined): string {
  const d = dominio ?? 'A definir'
  return DOMAIN_DISPLAY[d] ?? d
}

export function domainRank(dominio: string | undefined): number {
  const i = DOMAIN_ORDER.indexOf(dominio ?? 'A definir')
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

/** Linha da tabela = nó de dado real (nem derivado da linhagem, nem fantasma,
 *  nem o nó-raiz do domínio — que agrega produtos mas não é um). */
export function isDataNode(node: GraphNodeData): boolean {
  return !isDerivado(node) && !node.fantasma && !isRaiz(node)
}

/** Valor ainda pendente de mapeamento ("a confirmar", "a identificar"…). */
export function isPendingValue(value: string | undefined): boolean {
  return value !== undefined && /^a (confirmar|identificar|detalhar|definir)\b/i.test(value)
}

/** Minúsculas e sem acentos, para busca tolerante. */
export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

/** Linha da tabela executiva: uma cadeia primário→secundário. Domínio,
 *  origem, fonte, débito e status vêm sempre do primário. */
export interface ChainRow {
  /** Chave estável para o React (par primário/secundário). */
  key: string
  primario: GraphNodeData
  /** null = primário sem produto final ("—" na coluna secundário). */
  secundario: GraphNodeData | null
}

/** Deriva as cadeias das arestas "consome" entre dados (consumidor → insumo):
 *  cada aresta vira uma linha (primário = insumo, secundário = consumidor);
 *  nós "ambos" viram linha consigo mesmos; dados que não aparecem em nenhuma
 *  linha (primários sem secundário) viram linha com secundário null. */
export function buildChains(
  nodes: readonly GraphNodeData[],
  links: readonly GraphLinkData[],
): ChainRow[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const rows: ChainRow[] = []
  const cobertos = new Set<string>()

  for (const l of links) {
    if ((l.label ?? 'consome') !== 'consome') continue
    const consumidor = byId.get(l.source)
    const insumo = byId.get(l.target)
    if (!consumidor || !insumo || !isDataNode(consumidor) || !isDataNode(insumo)) continue
    rows.push({ key: `${insumo.id}→${consumidor.id}`, primario: insumo, secundario: consumidor })
    cobertos.add(insumo.id)
    cobertos.add(consumidor.id)
  }

  for (const n of nodes) {
    if (!isDataNode(n)) continue
    if (n.nivel === 'ambos') {
      rows.push({ key: `${n.id}→${n.id}`, primario: n, secundario: n })
      cobertos.add(n.id)
    }
  }

  for (const n of nodes) {
    if (!isDataNode(n) || cobertos.has(n.id)) continue
    rows.push({ key: n.id, primario: n, secundario: null })
  }

  return rows
}

/** Filtro rápido sobre a cadeia: nome/descrição/origem/sistema do primário e
 *  nome/descrição do secundário, insensível a acentos. */
export function matchesFilter(row: ChainRow, query: string): boolean {
  const q = normalizeText(query.trim())
  if (q === '') return true
  const { primario, secundario } = row
  const haystack = normalizeText(
    [
      primario.nome,
      primario.descricao ?? '',
      primario.origem ?? '',
      primario.sistema ?? '',
      secundario?.nome ?? '',
      secundario?.descricao ?? '',
    ].join('\n'),
  )
  return haystack.includes(q)
}

export type SortKey = 'primario' | 'secundario' | 'dominio' | 'debito' | 'status'
export type SortDir = 'asc' | 'desc'

const COLLATOR = new Intl.Collator('pt-BR', { sensitivity: 'base' })

function compareBy(a: ChainRow, b: ChainRow, key: SortKey): number {
  switch (key) {
    case 'primario':
      return COLLATOR.compare(a.primario.nome, b.primario.nome)
    case 'secundario':
      // Linhas sem secundário ("—") vão para o fim do grupo.
      if (a.secundario === null || b.secundario === null) {
        return (a.secundario === null ? 1 : 0) - (b.secundario === null ? 1 : 0)
      }
      return COLLATOR.compare(a.secundario.nome, b.secundario.nome)
    case 'dominio':
      return domainRank(a.primario.dominio) - domainRank(b.primario.dominio)
    case 'debito':
      return debitoRank(a.primario.debito) - debitoRank(b.primario.debito)
    case 'status':
      return statusRank(a.primario.status) - statusRank(b.primario.status)
  }
}

/** Cópia ordenada; desempata por domínio (ordem executiva) e nomes, para o
 *  agrupamento visual por domínio continuar coeso quando fizer sentido. */
export function sortChains(
  rows: readonly ChainRow[],
  key: SortKey,
  dir: SortDir,
): ChainRow[] {
  const sign = dir === 'desc' ? -1 : 1
  return [...rows].sort((a, b) => {
    const primary = compareBy(a, b, key)
    if (primary !== 0) return sign * primary
    const byDomain = domainRank(a.primario.dominio) - domainRank(b.primario.dominio)
    if (byDomain !== 0) return byDomain
    const byPrimario = COLLATOR.compare(a.primario.nome, b.primario.nome)
    if (byPrimario !== 0) return byPrimario
    return COLLATOR.compare(a.secundario?.nome ?? '', b.secundario?.nome ?? '')
  })
}
