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
  /** false quando o id não existe no catálogo (nada a excluir). */
  encontrada: boolean
}

/**
 * Catálogo sem a linha de id `alvo.id` e sem nenhuma menção a ela em `consome`
 * e `associacoes`.
 *
 * A linha é identificada pelo ID — a chave estável dela. As menções saem pelo
 * id e também pelo NOME, que é como o formato antigo (e a planilha editada à
 * mão) ainda pode citá-la; é a mesma tolerância do build.
 */
export function removerComponente(
  rows: readonly CatalogoRow[],
  alvo: { id: string; nome: string },
): ResultadoExclusao {
  const id = alvo.id.trim()
  const chave = norm(alvo.nome)
  const ehAlvo = (r: CatalogoRow): boolean => r.id.trim() === id && id !== ''
  const encontrada = rows.some(ehAlvo)
  const referencias: Referencia[] = []

  const semLinha = rows.filter((r) => !ehAlvo(r))
  const idsRestantes = new Set(semLinha.map((r) => r.id.trim()).filter((s) => s !== ''))

  const limparLista = (lista: string[], nome: string, campo: string): string[] => {
    const restante = lista.filter((item) => {
      const ref = item.trim()
      if (id !== '' && ref === id) return false
      // Menção por nome só conta quando o texto NÃO é o id de outra linha: id
      // gerado é o slug de um nome, e sem esta guarda apagar "GDAD" levaria
      // junto quem aponta para o id `gdad` de outro componente.
      return idsRestantes.has(ref) || norm(ref) !== chave
    })
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
