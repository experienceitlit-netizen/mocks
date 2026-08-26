// Exclusão de uma linha do catálogo, com as referências a ela em outras linhas.
//
// Só remover a linha deixaria quem a citava apontando para o vazio — no build
// isso vira nó fantasma. Aqui a linha sai junto com toda menção ao seu nome nas
// duas colunas que geram aresta (`consome` e `associacoes`), e o resultado diz
// o que foi tocado para o formulário confirmar antes de gravar.
import type { CatalogoRow } from './catalog-api'

/** Comparação insensível a caixa e acentos (a mesma do resto do catálogo). */
function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

/** Uma referência ao componente excluído, para listar na confirmação. */
export interface Referencia {
  /** Nome da linha que cita o excluído. */
  nome: string
  /** Campo em que a menção aparece, como aparece no formulário. */
  campo: string
}

export interface ResultadoExclusao {
  /** Catálogo sem a linha e sem as menções a ela. */
  rows: CatalogoRow[]
  /** Menções removidas (uma por campo de cada linha que citava). */
  referencias: Referencia[]
  /** false quando o nome/nível não existe no catálogo (nada a excluir). */
  encontrada: boolean
}

/**
 * Catálogo sem a linha `nome`/`nivel` e sem nenhuma menção a ela em `consome`
 * e `associacoes`.
 *
 * A linha é identificada por nome E nível: nomes iguais em níveis diferentes
 * são linhas diferentes. As menções, essas, são por nome — é assim que o build
 * as resolve.
 */
export function removerComponente(
  rows: readonly CatalogoRow[],
  alvo: { nome: string; nivel: string },
): ResultadoExclusao {
  const chave = norm(alvo.nome)
  const encontrada = rows.some((r) => norm(r.nome) === chave && r.nivel === alvo.nivel)
  const referencias: Referencia[] = []

  const semLinha = rows.filter((r) => !(norm(r.nome) === chave && r.nivel === alvo.nivel))

  const limparLista = (lista: string[], nome: string, campo: string): string[] => {
    const restante = lista.filter((item) => norm(item) !== chave)
    if (restante.length !== lista.length) referencias.push({ nome, campo })
    return restante
  }

  const limpas = semLinha.map((r) => ({
    ...r,
    consome: limparLista(r.consome, r.nome, 'Consome/Upstream'),
    associacoes: limparLista(r.associacoes, r.nome, 'Associações'),
  }))

  return { rows: limpas, referencias, encontrada }
}
