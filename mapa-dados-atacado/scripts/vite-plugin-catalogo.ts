// Plugin Vite (SÓ dev server, apply: 'serve') que expõe o catálogo como API:
//   GET  /api/catalogo → {"rows": CatalogoRow[]} lido do catalogo.csv na hora
//        (cada row traz o `id`, a chave estável da linha)
//   POST /api/catalogo {"rows": CatalogoRow[]} → valida (id repetido é erro; id
//        vazio é aceito e gerado do nome), grava o catalogo.csv e regenera
//        src/data/graph.json (mesmo formato do npm run data).
//   GET  /api/niveis → {"rows": [{slug, titulo, ordem, builtin, corFundo?,
//        corBorda?}]} com TODOS os níveis da cadeia (built-in e customizados),
//        resolvidos do niveis.csv.
//   POST /api/niveis {"rows": [{slug?, titulo, ordem, corFundo?, corBorda?}]} →
//        a lista COMPLETA de níveis: valida (inclusive remoção de nível em uso
//        no catálogo e cor fora do hexadecimal), grava as cinco colunas do
//        niveis.csv e regenera o graph.json. Nível que não vier na lista é
//        removido; `slug` amarra a linha a um nível existente (é o que faz
//        renomear um built-in não mexer no catalogo.csv).
//   GET  /api/verbos → {"rows": [{slug, titulo, sentido, seta, builtin}]} com o
//        vocabulário COMPLETO das relações, resolvido do verbos.csv (ausente =
//        os embutidos).
//   POST /api/verbos {"rows": [{slug?, titulo, sentido?, seta?}]} → a lista
//        COMPLETA de verbos: valida (inclusive remoção de verbo em uso por
//        alguma referência, e a remoção do `consome`, que nunca é permitida),
//        grava as quatro colunas do verbos.csv e regenera o graph.json. É este
//        POST que FAZ o verbos.csv nascer: o arquivo não existe no repositório.
// O build estático/standalone não passa por aqui — os CSVs seguem sendo a fonte.
import type { IncomingMessage, ServerResponse } from 'node:http'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { Plugin } from 'vite'
import {
  buildGraph,
  canonizarCatalogo,
  carregarNiveis,
  carregarVerbos,
  normalizarCor,
  parseCatalogoRows,
  resolverNiveis,
  resolverVerbos,
  serializarCatalogo,
  serializarNiveis,
  serializarVerbos,
  validarCatalogo,
  validarNiveis,
  validarNiveisContraCatalogo,
  validarVerbos,
  validarVerbosContraCatalogo,
  type CatalogoRow,
  type Debito,
  type NivelRow,
  type SimNao,
  type VerboRow,
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
      // Ausente/vazio é aceito: a gravação gera o id a partir do nome. O que a
      // API NUNCA faz é inventar um id diferente para uma linha que já tem o
      // seu — é a chave dela.
      id: texto('id'),
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
      // Ausente/vazio é aceito e vale "nao"; valor fora de sim/nao é recusado
      // pelo validarCatalogo, não aqui (aqui só se checa a FORMA).
      produto_de_dados: texto('produto_de_dados') as SimNao | '',
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

/** Valida a FORMA do body do POST /api/verbos ({"rows": [{slug?, titulo,
 *  sentido?, seta?}]}) e materializa VerboRow[]; a validação de conteúdo
 *  (título obrigatório, slug único, sentido/seta do vocabulário, `consome`
 *  presente) é do validarVerbos. Espelha {@link niveisDoBody}: `slug` e
 *  `sentido` vazios não viram campo (é o que marca "verbo novo, derive o slug"
 *  e "sem sentido declarado, vale o padrão"), e o que vier fora do vocabulário
 *  segue CRU, para a validação recusar citando o que o usuário escreveu.
 *
 *  `seta` aceita boolean (a caixinha da tela) ou o "sim"/"nao" do arquivo — a
 *  mesma tolerância de `ordem`, que vem number ou string numérica. */
export function verbosDoBody(body: unknown): { rows: VerboRow[]; errors: string[] } {
  const errors: string[] = []
  if (typeof body !== 'object' || body === null || !Array.isArray((body as { rows?: unknown }).rows)) {
    return { rows: [], errors: ['body deve ser um objeto {"rows": [{titulo}]}'] }
  }
  const rows: VerboRow[] = []
  const brutas = (body as { rows: unknown[] }).rows
  brutas.forEach((bruta, i) => {
    if (typeof bruta !== 'object' || bruta === null || Array.isArray(bruta)) {
      errors.push(`rows[${i}]: deve ser um objeto {titulo}`)
      return
    }
    const registro = bruta as Record<string, unknown>
    let ok = true
    const titulo = registro.titulo ?? ''
    if (typeof titulo !== 'string') {
      errors.push(`rows[${i}].titulo: deve ser string`)
      ok = false
    }
    const textos: Record<'slug' | 'sentido', string> = { slug: '', sentido: '' }
    for (const campo of ['slug', 'sentido'] as const) {
      const valor = registro[campo] ?? ''
      if (typeof valor !== 'string') {
        errors.push(`rows[${i}].${campo}: deve ser string`)
        ok = false
      } else {
        textos[campo] = valor.trim()
      }
    }
    const bruto = registro.seta
    let seta = ''
    if (typeof bruto === 'boolean') {
      seta = bruto ? 'sim' : 'nao'
    } else if (typeof bruto === 'string') {
      seta = bruto.trim()
    } else if (bruto !== undefined && bruto !== null) {
      errors.push(`rows[${i}].seta: deve ser boolean (ou "sim"/"nao")`)
      ok = false
    }
    if (!ok) return
    const row: VerboRow = { titulo: (titulo as string).trim() }
    for (const campo of ['slug', 'sentido'] as const) {
      if (textos[campo] !== '') row[campo] = textos[campo]
    }
    if (seta !== '') row.seta = seta
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
      const caminhoVerbos = join(raiz, 'verbos.csv')
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

      // verbos.csv ausente = os verbos embutidos, e este é o estado NORMAL: o
      // arquivo só nasce no primeiro POST /api/verbos.
      const lerVerbosTexto = async (): Promise<string> => {
        try {
          return await readFile(caminhoVerbos, 'utf8')
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
          const { verbos } = carregarVerbos(await lerVerbosTexto())
          const { graph, warnings: warningsBuild } = buildGraph(
            csvCatalogo,
            resolverNiveis(rows),
            verbos,
          )
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

      server.middlewares.use('/api/verbos', (req, res) => {
        void (async () => {
          if (req.method === 'GET') {
            // A UI edita a lista COMPLETA: embutidos e cadastrados chegam
            // iguais, com o slug (chave semântica) e a flag de origem. Sem o
            // arquivo, o que volta são os cinco embutidos.
            const { verbos, warnings } = carregarVerbos(await lerVerbosTexto())
            responderJson(res, 200, { rows: verbos, warnings })
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

          const { rows, errors: errosForma } = verbosDoBody(body)
          if (errosForma.length > 0) {
            responderJson(res, 400, { ok: false, errors: errosForma })
            return
          }
          const { errors, warnings } = validarVerbos(rows)
          if (errors.length > 0) {
            responderJson(res, 400, { ok: false, errors, warnings })
            return
          }
          // Remoção de verbo ainda usado por alguma referência é erro. O
          // vocabulário VIGENTE é o que diz o que é prefixo: sem ele, um
          // "envia:x" pareceria referência quebrada em vez de verbo em uso.
          const csvCatalogo = await readFile(caminhoCsv, 'utf8')
          const { verbos: vigentes } = carregarVerbos(await lerVerbosTexto())
          const errosUso = validarVerbosContraCatalogo(rows, parseCatalogoRows(csvCatalogo), vigentes)
          if (errosUso.length > 0) {
            responderJson(res, 400, { ok: false, errors: errosUso, warnings })
            return
          }

          const csvVerbos = serializarVerbos(rows)
          const { niveis, warnings: warningsNiveis } = carregarNiveis(await lerNiveisTexto())
          const { graph, warnings: warningsBuild } = buildGraph(csvCatalogo, niveis, resolverVerbos(rows))
          // É aqui que o verbos.csv NASCE: o arquivo não vem no repositório, e
          // quem o escreve é sempre o serializador, nunca a mão.
          await writeFile(caminhoVerbos, csvVerbos)
          await gravarGraph(graph)

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
          const { verbos, warnings: warningsVerbos } = carregarVerbos(await lerVerbosTexto())
          const { errors, warnings } = validarCatalogo(rows, niveis, verbos)
          if (errors.length > 0) {
            responderJson(res, 400, { ok: false, errors, warnings })
            return
          }

          // Canoniza antes de gravar: id preenchido nas linhas novas e
          // referências convertidas para id. Depois disso o CSV é a forma final
          // — o build lê exatamente o que foi para o disco.
          const csv = serializarCatalogo(canonizarCatalogo(rows, niveis, verbos))
          const { graph, warnings: warningsBuild } = buildGraph(csv, niveis, verbos)
          await writeFile(caminhoCsv, csv)
          await gravarGraph(graph)

          // warnings de validação e de build se sobrepõem (fantasmas); dedup mantendo a ordem
          const todos = [
            ...new Set([...warningsNiveis, ...warningsVerbos, ...warnings, ...warningsBuild]),
          ]
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
