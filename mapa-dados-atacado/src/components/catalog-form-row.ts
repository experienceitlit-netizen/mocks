// Montagem da linha do catálogo a partir do estado do formulário — separada do
// componente para ser testável sem React.
//
// O formulário é o MESMO em todos os níveis: nenhum campo aparece ou some por
// causa do nível escolhido, então trocar o "Nível/Camada" nunca descarta o que
// já estava preenchido. Colunas que o formulário não edita (as que o build
// ainda mantém no CSV) viajam intactas a partir da linha original.
import type { CatalogoRow } from './catalog-api'
import type { Debito, TipoComponente } from './graph-types'

/** Estado dos campos do formulário (um por campo editável do catálogo). */
export interface RowFormState {
  nome: string
  /** Slug do nível escolhido no select "Nível/Camada". */
  nivel: string
  tipoComponente: TipoComponente
  dominio: string
  consome: string[]
  associacoes: string[]
  descricao: string
  observacoes: string
  debito: Debito | ''
  status: string
  owner: string
  centroDeCusto: string
}

/** Comparação insensível a caixa e acentos (auto-referência em listas). */
function chave(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

function textoOuNull(valor: string): string | null {
  const v = valor.trim()
  return v === '' ? null : v
}

/**
 * Linha do catálogo equivalente ao estado do formulário. `base` é a linha
 * original (edição): o que ela tiver além dos campos do formulário é
 * preservado — o save nunca apaga coluna que a UI não conhece.
 */
export function montarRow(estado: RowFormState, base?: CatalogoRow | null): CatalogoRow {
  const nome = estado.nome.trim()
  const semAutoReferencia = (lista: string[]): string[] =>
    lista.filter((item) => chave(item) !== chave(nome))

  return {
    ...(base ?? {}),
    nome,
    nivel: estado.nivel,
    tipo_componente: estado.tipoComponente,
    dominio: estado.dominio,
    consome: semAutoReferencia(estado.consome),
    associacoes: semAutoReferencia(estado.associacoes),
    descricao: estado.descricao.trim(),
    // Débito e status valem para todo componente: o vazio do formulário cai no
    // default em vez de virar um estado a mais.
    debito: estado.debito || 'avaliar',
    status: estado.status || 'producao',
    owner: textoOuNull(estado.owner),
    centro_de_custo: textoOuNull(estado.centroDeCusto),
    observacoes: estado.observacoes,
  }
}
