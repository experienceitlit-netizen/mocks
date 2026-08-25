// Build do grafo: lê catalogo.csv (uma linha por dado), monta os nós/arestas
// e emite src/data/graph.json. Lógica pura em ./graph-lib.ts.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { buildGraph } from './graph-lib.ts'

const raiz = resolve(import.meta.dirname, '..')
const entrada = join(raiz, 'catalogo.csv')
const saida = join(raiz, 'src', 'data', 'graph.json')

const { graph, warnings } = buildGraph(readFileSync(entrada, 'utf8'))

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
console.log(
  `[build-graph] ${relative(raiz, saida)}: ${graph.nodes.length} nós` +
    ` (${dominios} domínios, ${sistemas} sistemas, ${fsecs} fontes secundárias, ${origens} origens` +
    (fantasmas > 0 ? `, ${fantasmas} fantasma${fantasmas > 1 ? 's' : ''}` : '') +
    `), ${graph.links.length} arestas, ${warnings.length} aviso(s)`,
)
