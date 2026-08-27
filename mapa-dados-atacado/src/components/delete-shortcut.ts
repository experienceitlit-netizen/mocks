// Regras do atalho de exclusão pelo teclado. Ficam fora do App porque decidem
// quando uma tecla apaga uma linha do catálogo — é a parte que precisa de rede.
//
// A tecla só age sobre um componente que JÁ TEM linha no catálogo (mesma regra
// do "✎ Editar" do balão): fantasma não tem o que excluir. E só quando existe
// store de edição — em somente leitura, `rows` é null e o atalho não existe.
import type { CatalogoRow } from './catalog-api'
import type { GraphNodeData } from './graph-types'
import { nivelDe } from './graph-types'

/** Teclas que iniciam a exclusão do componente em evidência. Backspace entra
 *  junto com Delete: é o hábito de quem vem do macOS. */
export function ehTeclaExcluir(key: string): boolean {
  return key === 'Delete' || key === 'Backspace'
}

/**
 * Elemento que recebe digitação — nele, Delete/Backspace apagam texto e Enter é
 * do próprio campo, nunca do atalho. Sem esta guarda, corrigir o nome no
 * formulário excluiria o componente.
 */
export function ehCampoDeTexto(
  el: { tagName?: string; isContentEditable?: boolean } | null,
): boolean {
  if (el === null) return false
  if (el.isContentEditable === true) return true
  const tag = (el.tagName ?? '').toUpperCase()
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

/** Linha do catálogo que o atalho excluiria (nome + nível a identificam). */
export interface AlvoExclusao {
  /** Id do nó no grafo, para abrir o balão junto com a confirmação. */
  id: string
  nome: string
  nivel: string
}

/**
 * Componente em evidência que o atalho excluiria, ou null quando não há um.
 *
 * A evidência é o balão aberto (`selectedId`) e, na falta dele, o destaque
 * fixado pelo clique esquerdo (`pinnedId`) — a mesma ordem de precedência que o
 * grafo usa para decidir quem está aceso.
 */
export function alvoDoAtalho(params: {
  selectedId: string | null
  pinnedId: string | null
  nodesById: ReadonlyMap<string, Pick<GraphNodeData, 'nome' | 'nivel'>>
  /** Linhas do catálogo; null = somente leitura (sem store, sem exclusão). */
  rows: readonly CatalogoRow[] | null
}): AlvoExclusao | null {
  const { selectedId, pinnedId, nodesById, rows } = params
  if (rows === null) return null
  const id = selectedId ?? pinnedId
  if (id === null) return null
  const node = nodesById.get(id)
  if (node === undefined) return null
  const nivel = nivelDe(node)
  const row = rows.find((r) => r.nivel === nivel && r.nome === node.nome)
  return row === undefined ? null : { id, nome: row.nome, nivel: row.nivel }
}
