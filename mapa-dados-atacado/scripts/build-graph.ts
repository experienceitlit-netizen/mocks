// Build do grafo: lê catalogo.csv (uma linha por dado) e niveis.csv (níveis
// customizados), monta os nós/arestas e emite src/data/graph.json. Lógica
// pura em ./graph-lib.ts.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { buildGraph, carregarNiveis } from './graph-lib.ts'

const raiz = resolve(import.meta.dirname, '..')
const entrada = join(raiz, 'catalogo.csv')
const entradaNiveis = join(raiz, 'niveis.csv')
const saida = join(raiz, 'src', 'data', 'graph.json')

// niveis.csv ausente = nenhum nível custom (arquivo é opcional no build).
const textoNiveis = existsSync(entradaNiveis) ? readFileSync(entradaNiveis, 'utf8') : ''
const { niveis, warnings: warningsNiveis } = carregarNiveis(textoNiveis)
const { graph, warnings: warningsBuild } = buildGraph(readFileSync(entrada, 'utf8'), niveis)
const warnings = [...warningsNiveis, ...warningsBuild]

for (const w of warnings) {
  console.warn(`[build-graph] AVISO: ${w}`)
}

mkdirSync(dirname(saida), { recursive: true })
writeFileSync(saida, JSON.stringify(graph, null, 2) + '\n')

const fantasmas = graph.nodes.filter((n) => n.fantasma === true).length
const dominios = graph.nodes.filter((n) => n.derivado === true && n.tipo === 'dominio').length
const sistemas = graph.nodes.filter((n) => n.derivado === true && n.tipo === 'sistema').length
const fsecs = graph.nodes.filter((n) => n.derivado === true && n.tipo === 'fonte-secundaria').length
const origens = graph.nodes.filter((n) => n.derivado === true && n.tipo === 'origem').length
const customs = graph.nodes.filter((n) => n.derivado === true && n.tipo === 'nivel-custom').length
console.log(
  `[build-graph] ${relative(raiz, saida)}: ${graph.nodes.length} nós` +
    ` (${dominios} domínios, ${sistemas} sistemas, ${fsecs} fontes secundárias, ${origens} origens` +
    (customs > 0 ? `, ${customs} de nível custom` : '') +
    (fantasmas > 0 ? `, ${fantasmas} fantasma${fantasmas > 1 ? 's' : ''}` : '') +
    `), ${graph.links.length} arestas, ${graph.niveis.length} níveis, ${warnings.length} aviso(s)`,
)
