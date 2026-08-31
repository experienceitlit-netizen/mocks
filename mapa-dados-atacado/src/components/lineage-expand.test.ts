// A ARMADILHA QUE ESTE MÓDULO EXISTE PARA EVITAR está no primeiro describe: a
// árvore de linhagem REUSA a mesma entrada para um componente que aparece em
// vários galhos, então o estado de expansão não pode ser indexado por
// componente. O teste monta um grafo com um consumo compartilhado, confirma que
// buildLineageTree de fato devolve o mesmo objeto nos dois galhos, e só então
// verifica que os caminhos os separam — se um dia a memoização sair de
// lineage.ts, a primeira asserção cai e este arquivo vira ruído honesto.
import { describe, expect, it } from 'vitest'
import type { GraphLinkData, GraphNodeData } from './graph-types'
import { buildLineageTree } from './lineage'
import {
  CAMINHO_RAIZ,
  caminhoFilho,
  comRamoAlternado,
  RAMOS_INICIAIS,
  ramoAberto,
  rotuloDoRamo,
} from './lineage-expand'

/** Dois produtos que consomem a MESMA tabela: a forma mínima em que a
 *  memoização das entradas aparece. */
const NODES: GraphNodeData[] = [
  { id: 'raiz', nome: 'Rentabilidade', nivel: 'final' },
  { id: 'a', nome: 'Painel A', nivel: 'gold' },
  { id: 'b', nome: 'Painel B', nivel: 'gold' },
  { id: 'comum', nome: 'Tabela comum', nivel: 'bronze' },
]
const LINKS: GraphLinkData[] = [
  { source: 'raiz', target: 'a', label: 'consome' },
  { source: 'raiz', target: 'b', label: 'consome' },
  { source: 'a', target: 'comum', label: 'consome' },
  { source: 'b', target: 'comum', label: 'consome' },
]

describe('caminho do galho x componente compartilhado', () => {
  it('a árvore reusa a MESMA entrada nos dois galhos', () => {
    const raiz = buildLineageTree('raiz', NODES, LINKS)
    if (!raiz) throw new Error('linhagem null')

    const viaA = raiz.upstream[0].entry.upstream[0].entry
    const viaB = raiz.upstream[1].entry.upstream[0].entry
    expect(viaA.data.id).toBe('comum')
    expect(viaA).toBe(viaB)
  })

  it('mesmo componente em galhos diferentes tem caminhos diferentes', () => {
    const viaA = caminhoFilho(caminhoFilho(CAMINHO_RAIZ, 0, 'a'), 0, 'comum')
    const viaB = caminhoFilho(caminhoFilho(CAMINHO_RAIZ, 1, 'b'), 0, 'comum')

    expect(viaA).not.toBe(viaB)
    const abertos = comRamoAlternado(RAMOS_INICIAIS, viaA)
    expect(ramoAberto(abertos, viaA)).toBe(true)
    expect(ramoAberto(abertos, viaB)).toBe(false)
  })

  it('duas arestas do mesmo pai para o mesmo alvo continuam separadas', () => {
    expect(caminhoFilho(CAMINHO_RAIZ, 0, 'comum')).not.toBe(
      caminhoFilho(CAMINHO_RAIZ, 1, 'comum'),
    )
  })
})

describe('estado inicial', () => {
  it('só a raiz nasce aberta — um nível de dependências à vista', () => {
    expect(ramoAberto(RAMOS_INICIAIS, CAMINHO_RAIZ)).toBe(true)
    expect(ramoAberto(RAMOS_INICIAIS, caminhoFilho(CAMINHO_RAIZ, 0, 'a'))).toBe(false)
  })
})

describe('alternar um galho', () => {
  it('abre, fecha e devolve sempre um conjunto novo', () => {
    const filho = caminhoFilho(CAMINHO_RAIZ, 0, 'a')

    const aberto = comRamoAlternado(RAMOS_INICIAIS, filho)
    expect(aberto).not.toBe(RAMOS_INICIAIS)
    expect(RAMOS_INICIAIS.has(filho)).toBe(false) // o anterior fica intacto
    expect(ramoAberto(aberto, filho)).toBe(true)

    const fechado = comRamoAlternado(aberto, filho)
    expect(ramoAberto(fechado, filho)).toBe(false)
  })

  it('a raiz também recolhe — dá para esconder a linhagem inteira', () => {
    const fechada = comRamoAlternado(RAMOS_INICIAIS, CAMINHO_RAIZ)
    expect(ramoAberto(fechada, CAMINHO_RAIZ)).toBe(false)
  })

  it('fechar um galho não esquece o que estava aberto dentro dele', () => {
    const pai = caminhoFilho(CAMINHO_RAIZ, 0, 'a')
    const neto = caminhoFilho(pai, 0, 'comum')

    const abertos = comRamoAlternado(comRamoAlternado(RAMOS_INICIAIS, pai), neto)
    const reabertos = comRamoAlternado(comRamoAlternado(abertos, pai), pai)
    expect(ramoAberto(reabertos, pai)).toBe(true)
    expect(ramoAberto(reabertos, neto)).toBe(true)
  })
})

describe('rótulo da alça', () => {
  it('diz o verbo, a contagem e o componente', () => {
    expect(rotuloDoRamo('Painel A', 3, false)).toBe('Mostrar 3 dependências de Painel A')
    expect(rotuloDoRamo('Painel A', 3, true)).toBe('Esconder 3 dependências de Painel A')
  })

  it('uma dependência fica no singular', () => {
    expect(rotuloDoRamo('Painel A', 1, false)).toBe('Mostrar 1 dependência de Painel A')
  })
})
