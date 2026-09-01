// Build do grafo: lê catalogo.csv (uma linha por COMPONENTE), niveis.csv (os
// níveis da cadeia) e verbos.csv (o vocabulário das relações), monta os
// nós/arestas e emite src/data/graph.json. Lógica pura em ./graph-lib.ts.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { buildGraph, carregarNiveis, carregarVerbos } from './graph-lib.ts'

const raiz = resolve(import.meta.dirname, '..')
const entrada = join(raiz, 'catalogo.csv')
const entradaNiveis = join(raiz, 'niveis.csv')
const entradaVerbos = join(raiz, 'verbos.csv')
const saida = join(raiz, 'src', 'data', 'graph.json')

// niveis.csv ausente = nenhum nível custom (arquivo é opcional no build).
const textoNiveis = existsSync(entradaNiveis) ? readFileSync(entradaNiveis, 'utf8') : ''
const { niveis, warnings: warningsNiveis } = carregarNiveis(textoNiveis)
// verbos.csv ausente = os verbos embutidos. É o estado normal: o arquivo só
// nasce quando alguém grava a tela de verbos.
const textoVerbos = existsSync(entradaVerbos) ? readFileSync(entradaVerbos, 'utf8') : ''
const { verbos, warnings: warningsVerbos } = carregarVerbos(textoVerbos)
const { graph, warnings: warningsBuild } = buildGraph(
  readFileSync(entrada, 'utf8'),
  niveis,
  verbos,
)
const warnings = [...warningsNiveis, ...warningsVerbos, ...warningsBuild]

for (const w of warnings) {
  console.warn(`[build-graph] AVISO: ${w}`)
}

mkdirSync(dirname(saida), { recursive: true })
writeFileSync(saida, JSON.stringify(graph, null, 2) + '\n')

// Um nó por linha do catálogo: o resumo conta por NÍVEL, na ordem da cadeia.
const fantasmas = graph.nodes.filter((n) => n.fantasma === true).length
const porNivel = graph.niveis
  .map((nivel) => ({ nivel, quantos: graph.nodes.filter((n) => n.nivel === nivel.slug).length }))
  .filter(({ quantos }) => quantos > 0)
  .map(({ nivel, quantos }) => `${quantos} ${nivel.titulo.toLowerCase()}`)
console.log(
  `[build-graph] ${relative(raiz, saida)}: ${graph.nodes.length} nós` +
    (porNivel.length > 0 ? ` (${porNivel.join(', ')})` : '') +
    (fantasmas > 0 ? `, ${fantasmas} fantasma${fantasmas > 1 ? 's' : ''}` : '') +
    `, ${graph.links.length} arestas, ${graph.niveis.length} níveis, ${warnings.length} aviso(s)`,
)
