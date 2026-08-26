// Plugin Vite (SÓ dev server, apply: 'serve') que expõe o catálogo como API:
//   GET  /api/catalogo → {"rows": CatalogoRow[]} lido do catalogo.csv na hora
//   POST /api/catalogo {"rows": CatalogoRow[]} → valida, grava o catalogo.csv
//        e regenera src/data/graph.json (mesmo formato do npm run data).
//   GET  /api/niveis → {"rows": [{slug, titulo, ordem, builtin, corFundo?,
//        corBorda?}]} com TODOS os níveis da cadeia (built-in e customizados),
//        resolvidos do niveis.csv.
//   POST /api/niveis {"rows": [{slug?, titulo, ordem, corFundo?, corBorda?}]} →
//        a lista COMPLETA de níveis: valida (inclusive remoção de nível em uso
//        no catálogo e cor fora do hexadecimal), grava as cinco colunas do
//        niveis.csv e regenera o graph.json. Nível que não vier na lista é
//        removido; `slug` amarra a linha a um nível existente (é o que faz
//        renomear um built-in não mexer no catalogo.csv).
// O build estático/standalone não passa por aqui — os CSVs seguem sendo a fonte.
import type { IncomingMessage, ServerResponse } from 'node:http'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { Plugin } from 'vite'
import {
  buildGraph,
  carregarNiveis,
  normalizarCor,
  parseCatalogoRows,
  resolverNiveis,
  serializarCatalogo,
  serializarNiveis,
  validarCatalogo,
  validarNiveis,
  validarNiveisContraCatalogo,
  type CatalogoRow,
  type Debito,
  type NivelRow,
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
      nivel: texto('nivel'),
      tipo_componente: texto('tipo_componente'),
      dominio: texto('dominio'),
      consome: lista('consome'),
      descricao: texto('descricao'),
      debito: texto('debito') as Debito | '',
      status: texto('status'),
      owner: textoOuNull('owner'),
      centro_de_custo: textoOuNull('centro_de_custo'),
      observacoes: texto('observacoes'),
      associacoes: lista('associacoes'),
    }
    if (ok) rows.push(row)
  })
  return { rows, errors }
}

/** Valida a FORMA do body do POST /api/niveis ({"rows": [{slug?, titulo,
 *  ordem, corFundo?, corBorda?}]}) e materializa NivelRow[]; a validação de
 *  conteúdo (título/ordem únicos, cor hexadecimal) é do validarNiveis. `ordem`
 *  aceita number ou string numérica ("42.5"); `slug` é opcional (ausente/vazio
 *  = derivar do título) e as cores também (ausente/vazia = cor padrão). */
export function niveisDoBody(body: unknown): { rows: NivelRow[]; errors: string[] } {
  const errors: string[] = []
  if (typeof body !== 'object' || body === null || !Array.isArray((body as { rows?: unknown }).rows)) {
    return { rows: [], errors: ['body deve ser um objeto {"rows": [{titulo, ordem}]}'] }
  }
  const rows: NivelRow[] = []
  const brutas = (body as { rows: unknown[] }).rows
  brutas.forEach((bruta, i) => {
    if (typeof bruta !== 'object' || bruta === null || Array.isArray(bruta)) {
      errors.push(`rows[${i}]: deve ser um objeto {titulo, ordem}`)
      return
    }
    const registro = bruta as Record<string, unknown>
    let ok = true
    const titulo = registro.titulo ?? ''
    if (typeof titulo !== 'string') {
      errors.push(`rows[${i}].titulo: deve ser string`)
      ok = false
    }
    const bruto = registro.ordem
    let ordem = Number.NaN
    if (typeof bruto === 'number') {
      ordem = bruto
    } else if (typeof bruto === 'string' && bruto.trim() !== '') {
      ordem = Number(bruto)
    } else if (bruto !== undefined && bruto !== null) {
      errors.push(`rows[${i}].ordem: deve ser number (ou string numérica)`)
      ok = false
    }
    const slug = registro.slug ?? ''
    if (typeof slug !== 'string') {
      errors.push(`rows[${i}].slug: deve ser string`)
      ok = false
    }
    const cores: Record<'corFundo' | 'corBorda', string> = { corFundo: '', corBorda: '' }
    for (const campo of ['corFundo', 'corBorda'] as const) {
      const cor = registro[campo] ?? ''
      if (typeof cor !== 'string') {
        errors.push(`rows[${i}].${campo}: deve ser string`)
        ok = false
      } else {
        cores[campo] = cor.trim()
      }
    }
    if (!ok) return
    const row: NivelRow = { titulo: (titulo as string).trim(), ordem }
    // Slug vazio não vira campo: é o que marca "nível novo" (derivar do título).
    if ((slug as string).trim() !== '') row.slug = (slug as string).trim()
    // Cor vazia idem ("volte ao padrão"); a que vier vira canônica aqui e o que
    // não for hex segue cru, para validarNiveis reclamar citando o valor.
    for (const campo of ['corFundo', 'corBorda'] as const) {
      if (cores[campo] !== '') row[campo] = normalizarCor(cores[campo]) ?? cores[campo]
    }
    rows.push(row)
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
      const caminhoNiveis = join(raiz, 'niveis.csv')
      const caminhoGraph = join(raiz, 'src', 'data', 'graph.json')

      // niveis.csv ausente = nenhum nível custom (mesma tolerância do build).
      const lerNiveisTexto = async (): Promise<string> => {
        try {
          return await readFile(caminhoNiveis, 'utf8')
        } catch (erro) {
          if ((erro as NodeJS.ErrnoException).code === 'ENOENT') return ''
          throw erro
        }
      }

      const gravarGraph = async (graph: unknown): Promise<void> => {
        await mkdir(dirname(caminhoGraph), { recursive: true })
        await writeFile(caminhoGraph, JSON.stringify(graph, null, 2) + '\n')
      }

      server.middlewares.use('/api/niveis', (req, res) => {
        void (async () => {
          if (req.method === 'GET') {
            // A UI edita a lista COMPLETA: built-in e custom chegam iguais,
            // com o slug (chave semântica) e a flag de origem.
            const { niveis, warnings } = carregarNiveis(await lerNiveisTexto())
            responderJson(res, 200, { rows: niveis, warnings })
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

          const { rows, errors: errosForma } = niveisDoBody(body)
          if (errosForma.length > 0) {
            responderJson(res, 400, { ok: false, errors: errosForma })
            return
          }
          const { errors, warnings } = validarNiveis(rows)
          if (errors.length > 0) {
            responderJson(res, 400, { ok: false, errors, warnings })
            return
          }
          // Remoção de nível ainda usado por linhas do catálogo é erro.
          const csvCatalogo = await readFile(caminhoCsv, 'utf8')
          const errosUso = validarNiveisContraCatalogo(rows, parseCatalogoRows(csvCatalogo))
          if (errosUso.length > 0) {
            responderJson(res, 400, { ok: false, errors: errosUso, warnings })
            return
          }

          const csvNiveis = serializarNiveis(rows)
          const { graph, warnings: warningsBuild } = buildGraph(csvCatalogo, resolverNiveis(rows))
          await writeFile(caminhoNiveis, csvNiveis)
          await gravarGraph(graph)

          const todos = [...new Set([...warnings, ...warningsBuild])]
          responderJson(res, 200, {
            ok: true,
            warnings: todos,
            counts: { nos: graph.nodes.length, arestas: graph.links.length, niveis: graph.niveis.length },
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
          const { niveis, warnings: warningsNiveis } = carregarNiveis(await lerNiveisTexto())
          const { errors, warnings } = validarCatalogo(rows, niveis)
          if (errors.length > 0) {
            responderJson(res, 400, { ok: false, errors, warnings })
            return
          }

          const csv = serializarCatalogo(rows)
          const { graph, warnings: warningsBuild } = buildGraph(csv, niveis)
          await writeFile(caminhoCsv, csv)
          await gravarGraph(graph)

          // warnings de validação e de build se sobrepõem (fantasmas); dedup mantendo a ordem
          const todos = [...new Set([...warningsNiveis, ...warnings, ...warningsBuild])]
          responderJson(res, 200, {
            ok: true,
            warnings: todos,
            counts: { nos: graph.nodes.length, arestas: graph.links.length, niveis: graph.niveis.length },
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
