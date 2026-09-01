// Lógica pura da tela "⇢ Verbos": a linha que o modal edita, a montagem do
// payload e a validação LOCAL do formulário. Fica fora do componente pelo mesmo
// motivo de catalog-form-row.ts — é o que dá para testar sem React.
//
// A validação de verdade é do backend (validarVerbos + validarVerbosContraCatalogo
// em scripts/graph-lib.ts): título obrigatório, slug único, sentido/seta do
// vocabulário, `consome` presente e verbo em uso. O que está aqui é só o que
// evita uma ida à API para um erro que a própria tela enxerga.
import type { VerboApiRow } from './catalog-api'
import type { Sentido } from './graph-types'
import { VERBO_PADRAO, VERBOS_PADRAO } from './graph-build'

/** Comparação insensível a caixa e acentos (unicidade de título). A mesma do
 *  NiveisModal e do resto do catálogo. */
function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

/** Linha do modal: o verbo como a API o devolve, com slug e origem resolvidos.
 *  `sentido` e `seta` viram valor sempre presente — a tela é um `<select>` e
 *  uma caixinha, e nenhum dos dois sabe representar "não declarado". */
export interface LinhaVerbo {
  /** Chave semântica; "" só no verbo que acabou de ser criado na tela. */
  slug: string
  titulo: string
  sentido: Sentido
  seta: boolean
  /** Veio com o modelo (informativo — não muda o que dá para editar). */
  builtin: boolean
}

/** Sentido de um verbo que não declara nenhum: o consumo de sempre. É o
 *  SENTIDO_PADRAO de scripts/graph-lib.ts, repetido aqui como em
 *  graph-types.verboDe — a tela não importa valor do build por isso. */
export const SENTIDO_PADRAO: Sentido = 'montante'

/** Seta de um verbo que não declara nenhuma: relação com direção. */
export const SETA_PADRAO = true

const SLUGS_BUILTIN = new Set<string>(VERBOS_PADRAO.map((v) => v.slug))

/** Linha do modal a partir do que a API (ou o bloco `verbos` do graph.json)
 *  devolveu. `builtin` chega pelo GET; o graph.json não o declara no tipo, e aí
 *  vale a lista de embutidos — a mesma resposta, pelos dois caminhos. */
export function comoLinhaVerbo(r: VerboApiRow): LinhaVerbo {
  const slug = (r.slug ?? '').trim()
  return {
    slug,
    titulo: r.titulo,
    sentido: r.sentido ?? SENTIDO_PADRAO,
    seta: r.seta ?? SETA_PADRAO,
    builtin: r.builtin ?? SLUGS_BUILTIN.has(slug),
  }
}

/**
 * Lista completa como o store a espera. O slug preserva a identidade de cada
 * verbo (vazio só no que acabou de ser criado, e aí o backend deriva do título)
 * — é o que faz renomear "Envia" para "Manda" não reescrever nenhuma célula do
 * catalogo.csv. `sentido` e `seta` vão sempre explícitos: a tela sempre tem os
 * dois, e mandar o valor evita depender do padrão do outro lado.
 */
export function payloadVerbos(linhas: readonly LinhaVerbo[]): VerboApiRow[] {
  return linhas.map((l) => {
    const row: VerboApiRow = { titulo: l.titulo.trim(), sentido: l.sentido, seta: l.seta }
    if (l.slug !== '') row.slug = l.slug
    return row
  })
}

/** O verbo pode sair da lista? `consome` não: ele é o significado de toda
 *  célula sem prefixo, e sem ele o catálogo inteiro ficaria sem verbo. */
export function podeRemoverVerbo(linha: Pick<LinhaVerbo, 'slug'>): boolean {
  return linha.slug !== VERBO_PADRAO
}

/** Erros do formulário de adicionar, antes de qualquer POST: título vazio ou
 *  repetido. O resto (slug derivado que colide, vocabulário) é do backend. */
export function errosDeNovoVerbo(titulo: string, linhas: readonly LinhaVerbo[]): string[] {
  const t = titulo.trim()
  const erros: string[] = []
  if (t === '') erros.push('Título é obrigatório.')
  if (t !== '' && linhas.some((l) => norm(l.titulo) === norm(t))) {
    erros.push(`Já existe um verbo chamado "${t}".`)
  }
  return erros
}

/** Erros das edições acumuladas ("Salvar alterações"): título vazio e título
 *  repetido — os dois só aparecem depois de renomear alguma linha. */
export function errosDeEdicaoVerbos(linhas: readonly LinhaVerbo[]): string[] {
  const erros: string[] = []
  if (linhas.some((l) => l.titulo.trim() === '')) {
    erros.push('Título de verbo não pode ficar vazio.')
  }
  const vistos = new Set<string>()
  for (const l of linhas) {
    const chave = norm(l.titulo)
    if (chave !== '' && vistos.has(chave)) erros.push(`Título repetido: "${l.titulo.trim()}".`)
    vistos.add(chave)
  }
  return [...new Set(erros)]
}
