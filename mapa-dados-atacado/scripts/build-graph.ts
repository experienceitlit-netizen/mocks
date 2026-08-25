// STUB — Fase 0. A implementação real (Fase 1) vai varrer vault/**/*.md,
// parsear frontmatter com gray-matter, extrair [[wikilinks]] e emitir
// src/data/graph.json. Outro agente implementará essa versão.
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const out = resolve(import.meta.dirname, '../src/data/graph.json')
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, JSON.stringify({ nodes: [], links: [] }, null, 2) + '\n')
console.log(`[build-graph] stub: escreveu ${out} (0 nós, 0 arestas)`)
