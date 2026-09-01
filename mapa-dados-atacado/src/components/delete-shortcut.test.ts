// O atalho de teclado apaga uma linha do catálogo: quem ele pega (e quando ele
// não pega ninguém) é a regra que precisa estar amarrada.
import { describe, expect, it } from 'vitest'
import type { CatalogoRow } from './catalog-api'
import { alvoDoAtalho, ehCampoDeTexto, ehTeclaExcluir } from './delete-shortcut'

const row = (id: string, nome: string, nivel: string): CatalogoRow => ({
  id,
  nome,
  nivel,
  tipo_componente: 'Default',
  dominio: '',
  consome: [],
  descricao: '',
  debito: '',
  status: '',
  owner: null,
  centro_de_custo: null,
  observacoes: '',
  produto_de_dados: '',
})

// O id do nó É o id da linha do catálogo — é por ele que o atalho casa.
const nodes = new Map([
  ['gdad', { nome: 'GDAD', nivel: 'gold' }],
  ['rating', { nome: 'Rating', nivel: 'gold' }],
  ['rating-2', { nome: 'Rating', nivel: 'final' }],
  ['fantasma-planilha-x', { nome: 'Planilha X', nivel: 'gold' }], // citado, sem linha
])

const rows = [row('gdad', 'GDAD', 'gold'), row('rating', 'Rating', 'gold'), row('rating-2', 'Rating', 'final')]

const alvo = (selectedId: string | null, pinnedId: string | null = null) =>
  alvoDoAtalho({ selectedId, pinnedId, nodesById: nodes, rows })

describe('alvoDoAtalho', () => {
  it('pega o nó do balão aberto', () => {
    expect(alvo('gdad')).toEqual({ id: 'gdad', nome: 'GDAD', nivel: 'gold' })
  })

  it('sem balão, pega o destaque fixado pelo clique', () => {
    expect(alvo(null, 'gdad')).toEqual({ id: 'gdad', nome: 'GDAD', nivel: 'gold' })
  })

  it('balão aberto ganha do destaque fixado', () => {
    expect(alvo('rating-2', 'gdad')?.nivel).toBe('final')
  })

  it('nome repetido não confunde: o id diz exatamente qual linha é', () => {
    expect(alvo('rating')).toEqual({ id: 'rating', nome: 'Rating', nivel: 'gold' })
  })

  it('fantasma (sem linha no catálogo) não é alvo', () => {
    expect(alvo('fantasma-planilha-x')).toBeNull()
  })

  it('nada em evidência, nada a excluir', () => {
    expect(alvo(null, null)).toBeNull()
  })

  it('nó fora do grafo atual não é alvo', () => {
    expect(alvo('sumiu')).toBeNull()
  })

  it('somente leitura (sem catálogo carregado): a tecla não tem alvo', () => {
    expect(
      alvoDoAtalho({ selectedId: 'gdad', pinnedId: null, nodesById: nodes, rows: null }),
    ).toBeNull()
  })
})

describe('ehCampoDeTexto', () => {
  it('campos de digitação seguram a tecla', () => {
    expect(ehCampoDeTexto({ tagName: 'INPUT' })).toBe(true)
    expect(ehCampoDeTexto({ tagName: 'textarea' })).toBe(true)
    expect(ehCampoDeTexto({ tagName: 'SELECT' })).toBe(true)
    expect(ehCampoDeTexto({ tagName: 'DIV', isContentEditable: true })).toBe(true)
  })

  it('o resto da página não', () => {
    expect(ehCampoDeTexto({ tagName: 'BUTTON' })).toBe(false)
    expect(ehCampoDeTexto({ tagName: 'BODY', isContentEditable: false })).toBe(false)
    expect(ehCampoDeTexto(null)).toBe(false)
  })
})

describe('ehTeclaExcluir', () => {
  it('Delete e Backspace (o hábito do macOS)', () => {
    expect(ehTeclaExcluir('Delete')).toBe(true)
    expect(ehTeclaExcluir('Backspace')).toBe(true)
  })

  it('nenhuma outra tecla', () => {
    expect(ehTeclaExcluir('Enter')).toBe(false)
    expect(ehTeclaExcluir('d')).toBe(false)
    expect(ehTeclaExcluir('Escape')).toBe(false)
  })
})
