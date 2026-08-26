// Exclusão de uma linha do catálogo, com as referências a ela em outras linhas.
//
// Só remover a linha deixaria quem a citava apontando para o vazio — no build
// isso vira nó fantasma (em `consome`) ou aviso (em `associacoes`). Aqui a
// linha sai junto com toda menção ao seu nome, e o resultado diz o que foi
// tocado para o formulário confirmar antes de gravar.
import type { CatalogoRow } from './catalog-api'
import { formatAssocList, parseAssocList } from './catalog-api'

/** Comparação insensível a caixa e acentos (a mesma do resto do catálogo). */
function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

/** Níveis em que a lista de associações mora nas colunas de rota. */
const ASSOC_NA_ROTA = new Set(['fonte', 'fonte-secundaria'])

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
 * Catálogo sem a linha `nome`/`nivel` e sem nenhuma menção a ela em
 * `consome`, `associacoes`, `fontes_secundarias` e nas colunas de rota que
 * guardam associações ('fonte' e 'fonte-secundaria').
 *
 * A linha é identificada por nome E nível: nomes iguais em níveis diferentes
 * são linhas diferentes (um produto e uma origem podem se chamar "Rating").
 * As menções, essas, são por nome — é assim que o build as resolve.
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

  const limpas = semLinha.map((r) => {
    const row: CatalogoRow = {
      ...r,
      consome: limparLista(r.consome, r.nome, 'Consome/Upstream'),
      associacoes: limparLista(r.associacoes, r.nome, 'Associações'),
      fontes_secundarias: limparLista(r.fontes_secundarias, r.nome, 'Fontes secundárias'),
    }
    // Em 'fonte' e 'fonte-secundaria' a coluna de rota é a lista de associações.
    if (ASSOC_NA_ROTA.has(r.nivel)) {
      const coluna = r.nivel === 'fonte' ? 'origem' : 'fonte_sistema'
      const lista = parseAssocList(row[coluna])
      const restante = limparLista(lista, r.nome, 'Associações')
      if (restante.length !== lista.length) row[coluna] = formatAssocList(restante)
    } else {
      // Rota simples: o nome do excluído citado como origem/fonte de um dado.
      if (row.origem !== null && norm(row.origem) === chave) {
        referencias.push({ nome: r.nome, campo: 'Origem' })
        row.origem = null
      }
      if (row.fonte_sistema !== null && norm(row.fonte_sistema) === chave) {
        referencias.push({ nome: r.nome, campo: 'Fonte / sistema' })
        row.fonte_sistema = null
      }
    }
    return row
  })

  return { rows: limpas, referencias, encontrada }
}
