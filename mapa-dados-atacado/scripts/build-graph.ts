// Build do grafo: varre vault/**/*.md, parseia frontmatter + wikilinks e
// emite src/data/graph.json. Lógica pura em ./graph-lib.ts.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { buildGraph, type VaultFile } from './graph-lib.ts'

const raiz = resolve(import.meta.dirname, '..')
const vaultDir = join(raiz, 'vault')
const saida = join(raiz, 'src', 'data', 'graph.json')

function coletarArquivos(dir: string): VaultFile[] {
  const arquivos: VaultFile[] = []
  for (const entrada of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (!entrada.isFile() || !entrada.name.endsWith('.md')) continue
    if (entrada.name.startsWith('_')) continue // _template.md e afins
    const caminho = join(entrada.parentPath, entrada.name)
    arquivos.push({ name: relative(dir, caminho), raw: readFileSync(caminho, 'utf8') })
  }
  return arquivos
}

const arquivos = coletarArquivos(vaultDir)
const { graph, warnings } = buildGraph(arquivos)

for (const w of warnings) {
  console.warn(`[build-graph] AVISO: ${w}`)
}

mkdirSync(dirname(saida), { recursive: true })
writeFileSync(saida, JSON.stringify(graph, null, 2) + '\n')

const fantasmas = graph.nodes.filter((n) => n.fantasma === true).length
console.log(
  `[build-graph] ${relative(raiz, saida)}: ${graph.nodes.length} nós` +
    (fantasmas > 0 ? ` (${fantasmas} fantasma${fantasmas > 1 ? 's' : ''})` : '') +
    `, ${graph.links.length} arestas, ${warnings.length} aviso(s)`,
)
