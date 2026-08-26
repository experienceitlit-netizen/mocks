// Contrato da API de edição do catálogo (só existe no Vite dev server — o
// plugin regrava catalogo.csv e regenera graph.json ao salvar). O App faz
// feature-detect no mount: se o GET falhar (build estático/standalone),
// nenhum controle de edição aparece.
import type { Debito, TipoComponente } from './graph-types'
import { TIPO_COMPONENTE_PADRAO, TIPOS_COMPONENTE } from './graph-types'

/** Linha do catalogo.csv como servida por GET /api/catalogo. Uma linha por
 *  COMPONENTE: o `nivel` (slug) diz a que camada ele pertence e
 *  `tipo_componente` o que ele é fisicamente. */
export interface CatalogoRow {
  nome: string
  /** Slug do nível — qualquer um do bloco `niveis`, sem valor especial. */
  nivel: string
  tipo_componente: TipoComponente
  dominio: string
  /** Nomes consumidos por este componente (arestas "consome"). */
  consome: string[]
  /** Nomes a que este componente se associa (arestas "vem de"). */
  associacoes: string[]
  descricao: string
  /** "" = não declarado (linha antiga); o formulário sempre grava um valor. */
  debito: Debito | ''
  status: string
  /** null = a definir. */
  owner: string | null
  /** null = a definir. */
  centro_de_custo: string | null
  observacoes: string
}

/** Tipo de componente válido, com o padrão para o que vier fora do
 *  vocabulário (linha antiga, coluna ainda vazia). */
export function normalizeTipoComponente(valor: unknown): TipoComponente {
  return typeof valor === 'string' && (TIPOS_COMPONENTE as readonly string[]).includes(valor)
    ? (valor as TipoComponente)
    : TIPO_COMPONENTE_PADRAO
}

function asStringArray(valor: unknown): string[] {
  return Array.isArray(valor) ? valor.filter((v): v is string => typeof v === 'string') : []
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
    // Campos do contrato normalizados na entrada: a UI só vê valores válidos.
    return (rows as CatalogoRow[]).map((r) => ({
      ...r,
      nivel: typeof r.nivel === 'string' ? r.nivel : '',
      tipo_componente: normalizeTipoComponente(r.tipo_componente),
      consome: asStringArray(r.consome),
      associacoes: asStringArray(r.associacoes),
    }))
  } catch {
    return null
  }
}

/** POST /api/catalogo com o conjunto COMPLETO de linhas (edição substitui a
 *  linha pelo nome original; cadastro acrescenta ao final). Lança em falha de
 *  rede/resposta ilegível; 400 vem como {ok:false, errors}. */
export async function saveCatalogo(rows: CatalogoRow[]): Promise<SaveResult> {
  return postJson('/api/catalogo', { rows })
}

/** Nível como trafegado por GET/POST /api/niveis. `slug` é a chave semântica —
 *  mandá-lo de volta é o que diz "este é aquele nível, só mudei o rótulo";
 *  ausente/vazio, o backend deriva um novo do título. `builtin` só vem no GET
 *  (informativo: diz que o nível veio com o modelo). */
export interface NivelApiRow {
  titulo: string
  ordem: number
  slug?: string
  builtin?: boolean
  /** Cor "#rrggbb" da faixa do nível; ausente/vazia = cor padrão. O POST
   *  recusa o que não for hexadecimal ("#RGB" também vale, e é normalizado). */
  corFundo?: string
  corBorda?: string
}

/** GET /api/niveis. null quando a API não existe (mesma disciplina de
 *  feature-detect do fetchCatalogo). */
export async function fetchNiveis(): Promise<NivelApiRow[] | null> {
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
    return ok ? (rows as NivelApiRow[]) : null
  } catch {
    return null
  }
}

/** POST /api/niveis com a lista COMPLETA de níveis (remoção = lista sem a
 *  linha; a API recusa se o nível estiver em uso). */
export async function saveNiveis(rows: NivelApiRow[]): Promise<SaveResult> {
  return postJson('/api/niveis', { rows })
}

/** POST + interpretação da resposta {ok, warnings|errors}, comum às duas APIs. */
async function postJson(url: string, payload: unknown): Promise<SaveResult> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
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
