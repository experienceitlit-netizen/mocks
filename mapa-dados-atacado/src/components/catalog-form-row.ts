// Montagem da linha do catálogo a partir do estado do formulário — separada do
// componente para ser testável sem React.
//
// Regra central: trocar o "Tipo de componente" NUNCA apaga dado. O formulário
// esconde os campos que o nível escolhido não usa, mas o estado deles continua
// carregado da linha original e é gravado como está; só duas famílias de campo
// não sobrevivem à troca, e {@link avisoTroca} avisa antes de salvar:
//   - a coluna `origem` (em linha 'fonte') e `fonte_sistema` (em linha
//     'fonte-secundaria') têm OUTRO significado — guardam as associações;
//   - `debito` em componente built-in e `associacoes` fora de nível
//     customizado são canonizadas para "" pelo serializador.
import type { CatalogoRow, NivelRow } from './catalog-api'
import { formatAssocList, isProdutoRow } from './catalog-api'
import type { Debito } from './graph-types'

/** Estado dos campos do formulário (um por campo do catálogo). */
export interface RowFormState {
  nome: string
  tipo: NivelRow
  /** `tipo` é slug de um nível customizado (bloco `niveis` do graph.json). */
  custom: boolean
  dominio: string
  /** Rota herdada da linha: fora do formulário desde que origem e fonte viraram
   *  níveis próprios, mas carregada e regravada para não se perder. */
  origem: string
  fonteSistema: string
  /** Idem: tabelas UCS já declaradas continuam na planilha. */
  fsec: string[]
  consome: string[]
  /** Campo único de associação do formulário. A coluna de destino depende do
   *  nível: 'fonte' guarda em `origem`, 'fonte-secundaria' em `fonte_sistema`,
   *  os demais em `associacoes`. */
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

/** Níveis que usam os campos de dado (domínio, rota, consome, débito, status):
 *  produtos e — desde que níveis customizados viraram níveis de DADO — as
 *  linhas de nível customizado. */
export function usaCamposDeDado(estado: Pick<RowFormState, 'tipo' | 'custom'>): boolean {
  return isProdutoRow(estado.tipo) || estado.custom
}

/**
 * Linha do catálogo equivalente ao estado do formulário. Todo campo é gravado
 * a partir do estado (que o formulário carrega da linha original, exibido ou
 * não), então trocar o tipo preserva o que já estava na planilha.
 */
export function montarRow(estado: RowFormState): CatalogoRow {
  const nome = estado.nome.trim()
  const semAutoReferencia = (lista: string[]): string[] =>
    lista.filter((item) => chave(item) !== chave(nome))
  const produto = isProdutoRow(estado.tipo)

  const assoc = semAutoReferencia(estado.associacoes)
  // Nesses dois níveis a associação É a rota: 'fonte' lista suas origens na
  // coluna `origem`, 'fonte-secundaria' lista suas fontes em `fonte_sistema`.
  const assocNaRota = estado.tipo === 'fonte' || estado.tipo === 'fonte-secundaria'

  return {
    nome,
    nivel: estado.tipo,
    dominio: estado.dominio,
    origem: estado.tipo === 'fonte' ? formatAssocList(assoc) : textoOuNull(estado.origem),
    fonte_sistema:
      estado.tipo === 'fonte-secundaria'
        ? formatAssocList(assoc)
        : textoOuNull(estado.fonteSistema),
    fontes_secundarias: estado.fsec,
    consome: semAutoReferencia(estado.consome),
    descricao: estado.descricao.trim(),
    // Produto exige débito e status; nos demais níveis o vazio é legítimo
    // (componente simples, sem semântica de débito).
    debito: produto ? estado.debito || 'avaliar' : estado.debito,
    status: produto ? estado.status || 'producao' : estado.status,
    owner: textoOuNull(estado.owner),
    centro_de_custo: textoOuNull(estado.centroDeCusto),
    observacoes: estado.observacoes,
    associacoes: assocNaRota ? [] : assoc,
  }
}

/** Rótulos dos campos, como aparecem no formulário. */
const LABEL = {
  dominio: 'Domínio',
  origem: 'Origem',
  fonteSistema: 'Fonte / sistema',
  fsec: 'Fontes secundárias',
  consome: 'Consome/Upstream',
  debito: 'Débito técnico',
  status: 'Status',
  associacoes: 'Associações',
} as const

export interface AvisoTroca {
  /** Preenchidos, guardados na planilha, mas sem uso no nível escolhido. */
  mantidos: string[]
  /** Preenchidos que o nível escolhido NÃO consegue guardar. */
  perdidos: string[]
}

/**
 * O que acontece com os campos preenchidos ao gravar a linha no nível
 * escolhido. Alimenta o aviso do formulário — nada some sem que o usuário
 * tenha sido avisado.
 */
export function avisoTroca(estado: RowFormState): AvisoTroca {
  const mantidos: string[] = []
  const perdidos: string[] = []
  const dado = usaCamposDeDado(estado)
  const temTexto = (v: string): boolean => v.trim() !== ''

  if (!dado) {
    // Componente built-in: as colunas de dado ficam no arquivo sem uso…
    if (temTexto(estado.dominio)) mantidos.push(LABEL.dominio)
    if (estado.consome.length > 0) mantidos.push(LABEL.consome)
    if (temTexto(estado.status)) mantidos.push(LABEL.status)
    // …menos o débito, que o serializador zera nessas linhas.
    if (estado.debito !== '') perdidos.push(LABEL.debito)
  }
  // A rota (origem/fonte_sistema) e as tabelas UCS saíram do formulário: seguem
  // guardadas na linha, exceto nos dois níveis em que a coluna passa a ser a
  // lista de associações.
  if (estado.fsec.length > 0 && !dado) mantidos.push(LABEL.fsec)
  if (estado.tipo === 'fonte' && temTexto(estado.origem)) perdidos.push(LABEL.origem)
  if (estado.tipo === 'fonte-secundaria' && temTexto(estado.fonteSistema)) {
    perdidos.push(LABEL.fonteSistema)
  }

  return { mantidos, perdidos }
}
