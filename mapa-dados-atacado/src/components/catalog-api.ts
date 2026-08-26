// Contrato da API de edição do catálogo (só existe no Vite dev server — o
// plugin regrava catalogo.csv e regenera graph.json ao salvar). O App faz
// feature-detect no mount: se o GET falhar (build estático/standalone),
// nenhum controle de edição aparece.
import type { Debito } from './graph-types'

/** Nível como registrado no CSV (a raiz não tem linha no catálogo).
 *  Além dos produtos (primario/final/ambos), o catálogo aceita linhas de
 *  componente: dominio, origem, fonte (sistema), fonte-secundaria e qualquer
 *  slug de nível customizado cadastrado em /api/niveis (`string & {}` mantém
 *  o autocomplete dos built-ins sem fechar o conjunto). */
export type NivelRow =
  | 'dominio'
  | 'origem'
  | 'fonte'
  | 'fonte-secundaria'
  | 'primario'
  | 'final'
  | 'ambos'
  | (string & {})

/** 'secundario' é o nome legado de 'final' e ainda pode chegar em CSV/JSON
 *  antigos; fora deste arquivo ele não circula. */
export type NivelRowLegado = NivelRow | 'secundario'

/** Ponto ÚNICO de tratamento do legado no contrato da API: toda linha lida
 *  passa por aqui antes de chegar à UI. */
export function normalizeNivelRow(nivel: NivelRowLegado): NivelRow {
  return nivel === 'secundario' ? 'final' : nivel
}

/** Linha de produto de dado (o resto são linhas de componente). */
export function isProdutoRow(nivel: NivelRow): boolean {
  return nivel === 'primario' || nivel === 'final' || nivel === 'ambos'
}

/** Listas de associação em campos string do CSV usam " | " como separador
 *  (linhas 'fonte' guardam origens associadas em `origem`; linhas
 *  'fonte-secundaria' guardam fontes associadas em `fonte_sistema`).
 *  parse/format ficam isolados aqui: se o shape da integração virar array,
 *  o ajuste é local. */
export function parseAssocList(value: string | null): string[] {
  if (value === null) return []
  return value
    .split('|')
    .map((s) => s.trim())
    .filter((s) => s !== '')
}

export function formatAssocList(names: string[]): string | null {
  const limpos = names.map((s) => s.trim()).filter((s) => s !== '')
  return limpos.length === 0 ? null : limpos.join(' | ')
}

/** Linha do catalogo.csv como servida por GET /api/catalogo. */
export interface CatalogoRow {
  nome: string
  nivel: NivelRow
  dominio: string
  /** Produto: área/processo de origem (null = não se aplica).
   *  Linha 'fonte': origens associadas separadas por " | " (parseAssocList). */
  origem: string | null
  /** Produto: sistema onde o dado vive (null = não se aplica).
   *  Linha 'fonte-secundaria': fontes associadas separadas por " | ". */
  fonte_sistema: string | null
  fontes_secundarias: string[]
  consome: string[]
  descricao: string
  /** "" só em linhas de componente (coluna ignorada nelas). */
  debito: Debito | ''
  status: string
  /** null = a definir. */
  owner: string | null
  /** null = a definir. */
  centro_de_custo: string | null
  observacoes: string
  /** Só linhas de nível customizado usam: nomes de outros componentes
   *  não-produto aos quais este se associa (arestas custom→alvo "vem de"). */
  associacoes: string[]
}

export interface SaveOk {
  ok: true
  warnings: string[]
  counts: Record<string, number>
}

export interface SaveErrors {
  ok: false
  errors: string[]
}

export type SaveResult = SaveOk | SaveErrors

/** GET /api/catalogo. Retorna null quando a API não existe (build estático,
 *  preview, standalone) — qualquer resposta que não seja o shape esperado
 *  conta como "sem API", nunca como erro. */
export async function fetchCatalogo(): Promise<CatalogoRow[] | null> {
  try {
    const res = await fetch('/api/catalogo')
    if (!res.ok) return null
    const body: unknown = await res.json()
    if (typeof body !== 'object' || body === null) return null
    const rows = (body as { rows?: unknown }).rows
    if (!Array.isArray(rows)) return null
    const ok = rows.every(
      (r: unknown) =>
        typeof r === 'object' && r !== null && typeof (r as { nome?: unknown }).nome === 'string',
    )
    if (!ok) return null
    // Nível legado normalizado na entrada: a UI só vê o vocabulário novo.
    // `associacoes` pode faltar em API anterior à migração de níveis.
    return (rows as (CatalogoRow & { nivel: NivelRowLegado })[]).map((r) => ({
      ...r,
      nivel: normalizeNivelRow(r.nivel),
      associacoes: Array.isArray(r.associacoes) ? r.associacoes : [],
    }))
  } catch {
    return null
  }
}

/** POST /api/catalogo com o conjunto COMPLETO de linhas (edição substitui a
 *  linha pelo nome original; cadastro acrescenta ao final). Lança em falha de
 *  rede/resposta ilegível; 400 vem como {ok:false, errors}. */
export async function saveCatalogo(rows: CatalogoRow[]): Promise<SaveResult> {
  const res = await fetch('/api/catalogo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rows }),
  })
  const body: unknown = await res.json().catch(() => null)
  if (typeof body === 'object' && body !== null && 'ok' in body) {
    const r = body as { ok: boolean; warnings?: unknown; errors?: unknown; counts?: unknown }
    if (r.ok) {
      return {
        ok: true,
        warnings: Array.isArray(r.warnings) ? r.warnings.map(String) : [],
        counts:
          typeof r.counts === 'object' && r.counts !== null
            ? (r.counts as Record<string, number>)
            : {},
      }
    }
    return {
      ok: false,
      errors: Array.isArray(r.errors) ? r.errors.map(String) : [`Erro ${res.status} ao salvar.`],
    }
  }
  throw new Error(`Resposta inesperada da API (HTTP ${res.status}).`)
}

/** Linha de nível customizado como trafegada por GET/POST /api/niveis (SÓ os
 *  customs — built-ins são fixos; o slug é derivado do título pelo backend). */
export interface NivelCustomRow {
  titulo: string
  ordem: number
}

/** GET /api/niveis. null quando a API não existe (mesma disciplina de
 *  feature-detect do fetchCatalogo). */
export async function fetchNiveis(): Promise<NivelCustomRow[] | null> {
  try {
    const res = await fetch('/api/niveis')
    if (!res.ok) return null
    const body: unknown = await res.json()
    if (typeof body !== 'object' || body === null) return null
    const rows = (body as { rows?: unknown }).rows
    if (!Array.isArray(rows)) return null
    const ok = rows.every(
      (r: unknown) =>
        typeof r === 'object' &&
        r !== null &&
        typeof (r as { titulo?: unknown }).titulo === 'string' &&
        typeof (r as { ordem?: unknown }).ordem === 'number',
    )
    return ok ? (rows as NivelCustomRow[]) : null
  } catch {
    return null
  }
}

/** POST /api/niveis com o conjunto COMPLETO de níveis customizados (remoção =
 *  conjunto sem a linha; a API recusa se o nível estiver em uso). Mesma
 *  disciplina ok/errors do saveCatalogo. */
export async function saveNiveis(rows: NivelCustomRow[]): Promise<SaveResult> {
  const res = await fetch('/api/niveis', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rows }),
  })
  const body: unknown = await res.json().catch(() => null)
  if (typeof body === 'object' && body !== null && 'ok' in body) {
    const r = body as { ok: boolean; warnings?: unknown; errors?: unknown; counts?: unknown }
    if (r.ok) {
      return {
        ok: true,
        warnings: Array.isArray(r.warnings) ? r.warnings.map(String) : [],
        counts:
          typeof r.counts === 'object' && r.counts !== null
            ? (r.counts as Record<string, number>)
            : {},
      }
    }
    return {
      ok: false,
      errors: Array.isArray(r.errors) ? r.errors.map(String) : [`Erro ${res.status} ao salvar.`],
    }
  }
  throw new Error(`Resposta inesperada da API (HTTP ${res.status}).`)
}
