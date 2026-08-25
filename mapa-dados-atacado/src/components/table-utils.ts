// Helpers da visão de tabela (TableView). Regras de ordenação, agrupamento
// por domínio e filtro sem acentos — puros, sem React, para facilitar teste.
import type { Debito, GraphNodeData } from './graph-types'
import { isDerivado } from './graph-types'

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

/** Linha da tabela = nó de dado real (nem derivado da linhagem, nem fantasma). */
export function isDataNode(node: GraphNodeData): boolean {
  return !isDerivado(node) && !node.fantasma
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

/** Filtro rápido: nome, descrição, origem e sistema, insensível a acentos. */
export function matchesFilter(node: GraphNodeData, query: string): boolean {
  const q = normalizeText(query.trim())
  if (q === '') return true
  const haystack = normalizeText(
    [node.nome, node.descricao ?? '', node.origem ?? '', node.sistema ?? ''].join('\n'),
  )
  return haystack.includes(q)
}

export type SortKey = 'nome' | 'dominio' | 'debito' | 'status'
export type SortDir = 'asc' | 'desc'

const COLLATOR = new Intl.Collator('pt-BR', { sensitivity: 'base' })

function compareBy(a: GraphNodeData, b: GraphNodeData, key: SortKey): number {
  switch (key) {
    case 'nome':
      return COLLATOR.compare(a.nome, b.nome)
    case 'dominio':
      return domainRank(a.dominio) - domainRank(b.dominio)
    case 'debito':
      return debitoRank(a.debito) - debitoRank(b.debito)
    case 'status':
      return statusRank(a.status) - statusRank(b.status)
  }
}

/** Cópia ordenada; desempata por domínio (ordem executiva) e nome, para o
 *  agrupamento visual por domínio continuar coeso quando fizer sentido. */
export function sortNodes(
  nodes: readonly GraphNodeData[],
  key: SortKey,
  dir: SortDir,
): GraphNodeData[] {
  const sign = dir === 'desc' ? -1 : 1
  return [...nodes].sort((a, b) => {
    const primary = compareBy(a, b, key)
    if (primary !== 0) return sign * primary
    const byDomain = domainRank(a.dominio) - domainRank(b.dominio)
    if (byDomain !== 0) return byDomain
    return COLLATOR.compare(a.nome, b.nome)
  })
}
