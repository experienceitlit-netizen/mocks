// Cor do nó = semântica de débito, igual para TODO componente: o nível não
// entra na conta, então transferir uma linha de camada nunca muda a cor dela.
import { describe, expect, it } from 'vitest'
import type { GraphNodeData } from './graph-types'
import { COLOR_AVALIAR, COLOR_CURADO, COLOR_DEBITO, COLOR_FANTASMA, nodeColor } from './palette'

const node = (extra: Partial<GraphNodeData>): GraphNodeData => ({
  id: 'x',
  nome: 'X',
  nivel: 'gold',
  ...extra,
})

describe('nodeColor', () => {
  it('precedência: fantasma > débito sim > a avaliar', () => {
    expect(nodeColor(node({ fantasma: true, debito: 'sim' }))).toBe(COLOR_FANTASMA)
    expect(nodeColor(node({ debito: 'sim' }))).toBe(COLOR_DEBITO)
    expect(nodeColor(node({ debito: 'avaliar' }))).toBe(COLOR_AVALIAR)
  })

  it('débito não declarado conta como "a avaliar" — ausente ou "" do build', () => {
    expect(nodeColor(node({}))).toBe(COLOR_AVALIAR)
    expect(nodeColor(node({ debito: '' as unknown as GraphNodeData['debito'] }))).toBe(
      COLOR_AVALIAR,
    )
  })

  it('a cor sai SÓ do que a linha declara, nunca do texto que ela carrega', () => {
    // Havia um âmbar de "legado/manual" ligado por regex sobre nome e descrição.
    // Saiu: o débito é declarado na coluna `debito`, e adivinhá-lo pela prosa
    // fazia uma linha com `debito=nao` aparecer como problema sem que o dono
    // pudesse corrigir a não ser reescrevendo a descrição.
    for (const texto of ['planilha manual', 'sistema on-premise', 'dado curado']) {
      expect(nodeColor(node({ debito: 'nao', descricao: texto }))).toBe(COLOR_CURADO)
    }
    expect(nodeColor(node({ debito: 'nao', nome: 'Base legado' }))).toBe(COLOR_CURADO)
  })

  it('o nível não muda a cor: mesma linha, em qualquer camada', () => {
    const campos = { debito: 'nao', descricao: 'dado curado' } as const
    expect(nodeColor(node({ nivel: 'gold', ...campos }))).toBe(
      nodeColor(node({ nivel: 'primario', ...campos })),
    )
  })
})
