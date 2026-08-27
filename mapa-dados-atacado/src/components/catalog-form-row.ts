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
  /** Referências como vão para o CSV: o id do alvo quando ele existe no
   *  catálogo, ou o texto digitado quando não (vira fantasma). O formulário
   *  mostra NOMES; a conversão é feita no CatalogForm. */
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
export function montarRow(
  estado: RowFormState,
  base?: CatalogoRow | null,
  /** Ids que existem no catálogo. Um item que está aqui é referência a OUTRO
   *  componente mesmo quando o texto coincide com o nome deste — id gerado é o
   *  slug de um nome, e sem esta lista "GDAD" apagaria o id `gdad` do vizinho. */
  idsConhecidos?: ReadonlySet<string>,
): CatalogoRow {
  const nome = estado.nome.trim()
  const proprioId = (base?.id ?? '').trim()
  // Auto-referência sai pelo id (o caso normal) e pelo nome, que é como o texto
  // digitado livre e o formato antigo ainda citam um componente.
  const semAutoReferencia = (lista: string[]): string[] =>
    lista.filter((item) => {
      const ref = item.trim()
      if (proprioId !== '' && ref === proprioId) return false
      if (idsConhecidos?.has(ref) === true) return true
      return chave(ref) !== chave(nome)
    })

  return {
    ...(base ?? {}),
    // O id é da LINHA, não do formulário: a de edição carrega o seu e a nova
    // sai sem, para a gravação gerar. Renomear ou trocar de nível não passa
    // por aqui — é justamente o que mantém as ligações de pé.
    id: proprioId,
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
