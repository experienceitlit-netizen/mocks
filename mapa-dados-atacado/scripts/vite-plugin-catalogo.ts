// Plugin Vite (SÓ dev server, apply: 'serve') que expõe o catálogo como API:
//   GET  /api/catalogo → {"rows": CatalogoRow[]} lido do catalogo.csv na hora
//   POST /api/catalogo {"rows": CatalogoRow[]} → valida, grava o catalogo.csv
//        e regenera src/data/graph.json (mesmo formato do npm run data).
// O build estático/standalone não passa por aqui — o CSV segue sendo a fonte.
import type { IncomingMessage, ServerResponse } from 'node:http'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { Plugin } from 'vite'
import {
  buildGraph,
  normalizarNivel,
  parseCatalogoRows,
  serializarCatalogo,
  validarCatalogo,
  type CatalogoRow,
  type Debito,
  type Nivel,
} from './graph-lib.ts'

const LIMITE_BODY = 2 * 1024 * 1024 // ~2MB

/** Valida a FORMA do body ({"rows": [...]}) e materializa CatalogoRow[];
 *  a validação de conteúdo (nome único, nivel/debito) é do validarCatalogo. */
export function rowsDoBody(body: unknown): { rows: CatalogoRow[]; errors: string[] } {
  const errors: string[] = []
  if (typeof body !== 'object' || body === null || !Array.isArray((body as { rows?: unknown }).rows)) {
    return { rows: [], errors: ['body deve ser um objeto {"rows": CatalogoRow[]}'] }
  }
  const rows: CatalogoRow[] = []
  const brutas = (body as { rows: unknown[] }).rows
  brutas.forEach((bruta, i) => {
    if (typeof bruta !== 'object' || bruta === null || Array.isArray(bruta)) {
      errors.push(`rows[${i}]: deve ser um objeto CatalogoRow`)
      return
    }
    const registro = bruta as Record<string, unknown>
    let ok = true
    const texto = (campo: string): string => {
      const v = registro[campo] ?? ''
      if (typeof v === 'string') return v
      errors.push(`rows[${i}].${campo}: deve ser string`)
      ok = false
      return ''
    }
    const textoOuNull = (campo: string): string | null => {
      const v = registro[campo] ?? null
      if (v === null || typeof v === 'string') return v
      errors.push(`rows[${i}].${campo}: deve ser string ou null`)
      ok = false
      return null
    }
    const lista = (campo: string): string[] => {
      const v = registro[campo] ?? []
      if (Array.isArray(v) && v.every((item) => typeof item === 'string')) return v as string[]
      errors.push(`rows[${i}].${campo}: deve ser uma lista de strings`)
      ok = false
      return []
    }
    const row: CatalogoRow = {
      nome: texto('nome'),
      // "secundario" é apelido de "final" — canonizado já na entrada.
      nivel: normalizarNivel(texto('nivel')) as Nivel,
      dominio: texto('dominio'),
      origem: textoOuNull('origem'),
      fonte_sistema: textoOuNull('fonte_sistema'),
      fontes_secundarias: lista('fontes_secundarias'),
      consome: lista('consome'),
      descricao: texto('descricao'),
      debito: texto('debito') as Debito,
      status: texto('status'),
      owner: textoOuNull('owner'),
      centro_de_custo: textoOuNull('centro_de_custo'),
      observacoes: texto('observacoes'),
    }
    if (ok) rows.push(row)
  })
  return { rows, errors }
}

function responderJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

function lerBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const pedacos: Buffer[] = []
    let tamanho = 0
    req.on('data', (pedaco: Buffer) => {
      tamanho += pedaco.length
      if (tamanho > LIMITE_BODY) {
        reject(new Error('LIMITE'))
        req.destroy()
        return
      }
      pedacos.push(pedaco)
    })
    req.on('end', () => resolve(Buffer.concat(pedacos).toString('utf8')))
    req.on('error', reject)
  })
}

export function catalogoApiPlugin(): Plugin {
  return {
    name: 'catalogo-api',
    apply: 'serve',
    configureServer(server) {
      const raiz = server.config.root
      const caminhoCsv = join(raiz, 'catalogo.csv')
      const caminhoGraph = join(raiz, 'src', 'data', 'graph.json')

      server.middlewares.use('/api/catalogo', (req, res) => {
        void (async () => {
          if (req.method === 'GET') {
            const csv = await readFile(caminhoCsv, 'utf8')
            responderJson(res, 200, { rows: parseCatalogoRows(csv) })
            return
          }

          if (req.method !== 'POST') {
            res.setHeader('Allow', 'GET, POST')
            responderJson(res, 405, { ok: false, errors: [`método ${req.method} não suportado — use GET ou POST`] })
            return
          }

          let texto: string
          try {
            texto = await lerBody(req)
          } catch (erro) {
            if (erro instanceof Error && erro.message === 'LIMITE') {
              responderJson(res, 413, { ok: false, errors: ['body excede o limite de 2MB'] })
              return
            }
            throw erro
          }

          let body: unknown
          try {
            body = JSON.parse(texto)
          } catch {
            responderJson(res, 400, { ok: false, errors: ['body não é JSON válido'] })
            return
          }

          const { rows, errors: errosForma } = rowsDoBody(body)
          if (errosForma.length > 0) {
            responderJson(res, 400, { ok: false, errors: errosForma })
            return
          }
          const { errors, warnings } = validarCatalogo(rows)
          if (errors.length > 0) {
            responderJson(res, 400, { ok: false, errors, warnings })
            return
          }

          const csv = serializarCatalogo(rows)
          const { graph, warnings: warningsBuild } = buildGraph(csv)
          await writeFile(caminhoCsv, csv)
          await mkdir(dirname(caminhoGraph), { recursive: true })
          await writeFile(caminhoGraph, JSON.stringify(graph, null, 2) + '\n')

          // warnings de validação e de build se sobrepõem (fantasmas); dedup mantendo a ordem
          const todos = [...new Set([...warnings, ...warningsBuild])]
          responderJson(res, 200, {
            ok: true,
            warnings: todos,
            counts: { nos: graph.nodes.length, arestas: graph.links.length },
          })
        })().catch((erro: unknown) => {
          server.config.logger.error(`[catalogo-api] ${String(erro)}`)
          if (!res.headersSent) {
            responderJson(res, 500, { ok: false, errors: [`erro interno: ${String(erro)}`] })
          } else {
            res.end()
          }
        })
      })
    },
  }
}
