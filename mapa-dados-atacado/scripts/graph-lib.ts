// Funções puras do build do grafo — separadas do CLI para serem testáveis.
// Fonte única: catalogo.csv (separador ";", uma linha por dado).

export interface GraphNode {
  id: string
  nome: string
  tipo: string
  /** raiz | primario | secundario | ambos */
  nivel: string
  dominio: string
  debito: string
  owner: string | null
  centroDeCusto: string | null
  descricao: string
  /** null = não se aplica (secundários derivam a rota dos primários que consomem) */
  sistema: string | null
  origem: string | null
  status: string
  incompleto: boolean
  fantasma?: boolean
  derivado?: undefined
  /** Tabelas UCS onde a fonte é ingerida antes de virar produto (opcional):
   *  presença substitui a aresta direta dado→sistema por dado→fsec→sistema. */
  fontesSecundarias?: string[]
  /** Coluna "observacoes" do CSV: texto livre em markdown; ausente se vazia.
   *  [[Wikilinks]] no texto viram links de navegação no balão, mas NÃO geram
   *  arestas — arestas de consumo vêm só da coluna "consome". */
  corpo?: string
}

/** Nó materializado pelo build: `fonte_sistema`/`origem`/`fontes_secundarias`
 *  dos dados ou o domínio dos produtos finais agregados pela raiz. */
export interface DerivedNode {
  id: string
  nome: string
  tipo: 'sistema' | 'origem' | 'dominio' | 'fonte-secundaria'
  derivado: true
  incompleto: false
  fantasma?: undefined
}

export type AnyNode = GraphNode | DerivedNode

export interface GraphLink {
  source: string
  target: string
  label: string
}

export interface Graph {
  nodes: AnyNode[]
  links: GraphLink[]
}

export interface ParsedRow {
  node: GraphNode
  /** nomes (ou ids) da coluna "consome", ainda não resolvidos */
  consome: string[]
}

export interface CatalogoParseResult {
  rows: ParsedRow[]
  warnings: string[]
}

export interface BuildResult {
  graph: Graph
  warnings: string[]
}

/** Colunas do catalogo.csv, na ordem canônica do cabeçalho. */
export const COLUNAS = [
  'nome',
  'nivel',
  'dominio',
  'origem',
  'fonte_sistema',
  'fontes_secundarias',
  'consome',
  'descricao',
  'debito',
  'status',
  'owner',
  'centro_de_custo',
  'observacoes',
] as const

type Coluna = (typeof COLUNAS)[number]

const NIVEIS_VALIDOS = new Set(['primario', 'secundario', 'ambos'])
const NIVEL_DEFAULT = 'primario'

/** Slug kebab-case sem acentos, usado como id dos nós (id = slug do nome). */
export function slugify(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Parser CSV mínimo (RFC 4180 com separador ";"): células entre aspas podem
 * conter ";", quebras de linha e aspas escapadas (""); aceita BOM UTF-8 e
 * fim de linha \r\n ou \n. Linhas totalmente vazias são descartadas.
 */
export function parseCsv(texto: string): string[][] {
  const t = texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto
  const registros: string[][] = []
  let registro: string[] = []
  let celula = ''
  let emAspas = false

  const fimCelula = (): void => {
    registro.push(celula)
    celula = ''
  }
  const fimRegistro = (): void => {
    fimCelula()
    registros.push(registro)
    registro = []
  }

  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (emAspas) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          celula += '"'
          i++
        } else {
          emAspas = false
        }
      } else {
        celula += c
      }
    } else if (c === '"' && celula === '') {
      emAspas = true
    } else if (c === ';') {
      fimCelula()
    } else if (c === '\n') {
      fimRegistro()
    } else if (c === '\r') {
      if (t[i + 1] === '\n') i++
      fimRegistro()
    } else {
      celula += c
    }
  }
  if (celula !== '' || registro.length > 0) fimRegistro()

  return registros.filter((r) => r.some((c) => c.trim() !== ''))
}

/** Divide uma célula-lista ("A | B") em nomes; vazio = lista vazia. */
function splitLista(celula: string): string[] {
  return celula
    .split('|')
    .map((s) => s.trim())
    .filter((s) => s !== '')
}

/**
 * Parseia o catalogo.csv: cabeçalho por nome de coluna (ordem livre) + uma
 * linha por dado. Warnings legíveis para coluna faltando/desconhecida, linha
 * sem nome e nivel inválido; "linha N" conta o cabeçalho como linha 1.
 */
export function parseCatalogo(texto: string): CatalogoParseResult {
  const warnings: string[] = []
  const registros = parseCsv(texto)
  if (registros.length === 0) {
    warnings.push('catalogo.csv: arquivo vazio — nenhum dado no catálogo')
    return { rows: [], warnings }
  }

  const cabecalho = registros[0].map((c) => c.trim())
  const indice = new Map<string, number>(cabecalho.map((c, i) => [c, i]))
  for (const col of COLUNAS) {
    if (!indice.has(col)) warnings.push(`catalogo.csv: coluna obrigatória "${col}" ausente do cabeçalho`)
  }
  for (const col of cabecalho) {
    if (!(COLUNAS as readonly string[]).includes(col)) {
      warnings.push(`catalogo.csv: coluna desconhecida "${col}" ignorada`)
    }
  }

  const rows: ParsedRow[] = []
  for (let r = 1; r < registros.length; r++) {
    const registro = registros[r]
    const linha = r + 1

    const celula = (col: Coluna): string => {
      const i = indice.get(col)
      return i === undefined ? '' : (registro[i] ?? '').trim()
    }
    const textoOuNull = (col: Coluna): string | null => {
      const v = celula(col)
      return v === '' ? null : v
    }

    const nome = celula('nome')
    if (nome === '') {
      warnings.push(`catalogo.csv linha ${linha}: célula "nome" vazia — linha ignorada`)
      continue
    }

    let nivel = celula('nivel')
    if (!NIVEIS_VALIDOS.has(nivel)) {
      warnings.push(
        `catalogo.csv linha ${linha} ("${nome}"): nivel "${nivel}" inválido` +
          ` (use primario, secundario ou ambos) — assumindo "${NIVEL_DEFAULT}"`,
      )
      nivel = NIVEL_DEFAULT
    }

    const owner = textoOuNull('owner')
    const centroDeCusto = textoOuNull('centro_de_custo')

    const node: GraphNode = {
      id: slugify(nome),
      nome,
      // tipo é derivado do nivel: primário = insumo, o resto = produto final.
      tipo: nivel === 'primario' ? 'insumo' : 'produto',
      nivel,
      dominio: celula('dominio') || 'A definir',
      debito: celula('debito'),
      owner,
      centroDeCusto,
      descricao: celula('descricao'),
      sistema: textoOuNull('fonte_sistema'),
      origem: textoOuNull('origem'),
      status: celula('status'),
      incompleto: owner === null || centroDeCusto === null,
    }

    const fsecs = splitLista(celula('fontes_secundarias'))
    if (fsecs.length > 0) node.fontesSecundarias = fsecs

    const corpo = celula('observacoes')
    if (corpo !== '') node.corpo = corpo

    rows.push({ node, consome: splitLista(celula('consome')) })
  }

  return { rows, warnings }
}

/** Valores de sistema/origem que significam "ainda não sabemos" — não viram nó. */
const VALORES_DESCONHECIDOS = new Set(['', 'a confirmar', 'a identificar', 'a detalhar'])

function valorConhecido(valor: string | null | undefined): string | null {
  if (valor === null || valor === undefined) return null
  const texto = valor.trim()
  return VALORES_DESCONHECIDOS.has(texto.toLowerCase()) ? null : texto
}

/**
 * Materializa `fonte_sistema`, `origem` e `fontes_secundarias` dos dados como
 * nós derivados, criando a linhagem dado → [fonte secundária →] sistema → origem:
 * - dedup por chave normalizada (trim + lowercase) do texto original;
 * - valores desconhecidos ("a confirmar" etc.) não geram nó nem aresta;
 * - sistema desconhecido com origem conhecida liga dado → origem direto;
 * - `fontes_secundarias` (tabelas UCS) SUBSTITUI a aresta direta dado→sistema
 *   por dado→fsec ("vem de") + fsec→sistema ("vem de"); com sistema
 *   desconhecido, fsec→origem direto ("origina de").
 */
export function derivarSistemasOrigens(dados: GraphNode[]): { nodes: DerivedNode[]; links: GraphLink[] } {
  const sistemas = new Map<string, DerivedNode>()
  const origens = new Map<string, DerivedNode>()
  const fontesSecundarias = new Map<string, DerivedNode>()
  const links: GraphLink[] = []
  const arestasVistas = new Set<string>()

  const noDerivado = (
    mapa: Map<string, DerivedNode>,
    prefixo: 'sys' | 'org' | 'fsec',
    tipo: DerivedNode['tipo'],
    texto: string,
  ): DerivedNode => {
    const chave = texto.toLowerCase()
    let no = mapa.get(chave)
    if (no === undefined) {
      no = { id: `${prefixo}-${slugify(texto)}`, nome: texto, tipo, derivado: true, incompleto: false }
      mapa.set(chave, no)
    }
    return no
  }

  const addLink = (source: string, target: string, label: string): void => {
    const chave = `${source}\u0000${target}\u0000${label}`
    if (arestasVistas.has(chave)) return
    arestasVistas.add(chave)
    links.push({ source, target, label })
  }

  for (const dado of dados) {
    const sistema = valorConhecido(dado.sistema)
    const origem = valorConhecido(dado.origem)
    const fsecs = (dado.fontesSecundarias ?? []).map((nome) =>
      noDerivado(fontesSecundarias, 'fsec', 'fonte-secundaria', nome.trim()),
    )
    // O dado que declara ingestão via UCS não liga direto na fonte: a rota
    // passa pelas tabelas UCS (o débito técnico da fonte permanece no dado).
    const cabecas = fsecs.length > 0 ? fsecs.map((f) => f.id) : [dado.id]
    for (const f of fsecs) addLink(dado.id, f.id, 'vem de')
    if (sistema !== null) {
      const noSistema = noDerivado(sistemas, 'sys', 'sistema', sistema)
      for (const cabeca of cabecas) addLink(cabeca, noSistema.id, 'vem de')
      if (origem !== null) {
        const noOrigem = noDerivado(origens, 'org', 'origem', origem)
        addLink(noSistema.id, noOrigem.id, 'origina de')
      }
    } else if (origem !== null) {
      const noOrigem = noDerivado(origens, 'org', 'origem', origem)
      for (const cabeca of cabecas) addLink(cabeca, noOrigem.id, 'origina de')
    }
  }

  return { nodes: [...sistemas.values(), ...fontesSecundarias.values(), ...origens.values()], links }
}

/** O catálogo guarda domínios sem acento; o nó derivado exibe com. */
const DOMINIO_DISPLAY: Record<string, string> = {
  Regulatorio: 'Regulatório',
}

/**
 * Insere o nível de domínio entre a raiz e os produtos finais: cada aresta
 * "agrega" raiz→produto vira raiz→dom-<slug do domínio> e dom-<slug>→produto
 * (ambas "agrega", deduplicadas). As demais arestas passam intactas.
 * Devolve os nós de domínio derivados e a lista de arestas já reescrita.
 */
export function derivarDominios(
  dados: GraphNode[],
  links: GraphLink[],
): { nodes: DerivedNode[]; links: GraphLink[] } {
  const porId = new Map(dados.map((n) => [n.id, n]))
  const dominios = new Map<string, DerivedNode>()
  const saida: GraphLink[] = []
  const arestasVistas = new Set<string>()

  const addAgrega = (source: string, target: string): void => {
    const chave = `${source} ${target}`
    if (arestasVistas.has(chave)) return
    arestasVistas.add(chave)
    saida.push({ source, target, label: 'agrega' })
  }

  for (const l of links) {
    if (l.label !== 'agrega') {
      saida.push(l)
      continue
    }
    const dominio = porId.get(l.target)?.dominio ?? 'A definir'
    const id = `dom-${slugify(dominio)}`
    if (!dominios.has(id)) {
      dominios.set(id, {
        id,
        nome: DOMINIO_DISPLAY[dominio] ?? dominio,
        tipo: 'dominio',
        derivado: true,
        incompleto: false,
      })
    }
    addAgrega(l.source, id)
    addAgrega(id, l.target)
  }

  return { nodes: [...dominios.values()], links: saida }
}

function nodeFantasma(nomeAlvo: string): GraphNode {
  return {
    id: slugify(nomeAlvo) || nomeAlvo.toLowerCase(),
    nome: nomeAlvo,
    tipo: 'desconhecido',
    nivel: NIVEL_DEFAULT,
    dominio: 'A definir',
    debito: 'avaliar',
    owner: null,
    centroDeCusto: null,
    descricao: 'Nó fantasma: referenciado na coluna "consome", mas sem linha no catálogo.',
    sistema: 'desconhecido',
    origem: 'desconhecida',
    status: 'investigacao',
    incompleto: true,
    fantasma: true,
  }
}

/**
 * Nó-raiz do portfólio, criado automaticamente pelo build (não tem linha no
 * catalogo.csv). Agrega todos os dados de nivel secundario/ambos; owner e
 * centro de custo não se aplicam (nunca renderiza incompleto).
 */
export function criarRaiz(): GraphNode {
  return {
    id: 'atacado-dados',
    nome: 'Atacado — Dados',
    tipo: 'dominio',
    nivel: 'raiz',
    dominio: 'Atacado',
    debito: 'nao',
    owner: null,
    centroDeCusto: null,
    descricao: 'Portfólio de dados da Diretoria Comercial Atacado — ponto de entrada do mapa',
    sistema: null,
    origem: null,
    status: 'producao',
    incompleto: false,
    corpo:
      'Portfólio de dados da Diretoria Comercial Atacado — ponto de entrada do mapa. ' +
      'Agrega todos os produtos finais do catálogo, as visões consumidas diretamente pelas ' +
      'equipes comerciais e de gestão. Não é um dado em si: é o nó-raiz que organiza a ' +
      'navegação do portfólio.\n\n' +
      'Agrega [[Account|agrega]], [[Faturamento|agrega]], [[Segmentação e Encarteiramento|agrega]], ' +
      '[[Setorização|agrega]], [[Localização|agrega]], [[Evolução do Resultado|agrega]], ' +
      '[[Evolução do Resultado por produto|agrega]], [[RAR 12M|agrega]], [[Estoque (carteira)|agrega]], ' +
      '[[Resultado|agrega]], [[Endividamento de mercado|agrega]], [[Rating|agrega]] e ' +
      '[[Restritivos e tipos|agrega]].',
  }
}

/**
 * Monta o grafo a partir do texto do catalogo.csv.
 * - id = slug(nome); nome duplicado (mesmo slug) vira warning e é ignorado;
 * - a raiz "Atacado — Dados" é criada automaticamente e agrega todos os
 *   dados de nivel secundario/ambos;
 * - a coluna "consome" resolve por nome OU id, case-insensitive; alvo
 *   inexistente vira warning + nó fantasma;
 * - saída determinística (nodes por id, links por source/target/label).
 */
export function buildGraph(csv: string): BuildResult {
  const { rows, warnings } = parseCatalogo(csv)

  const raiz = criarRaiz()
  const nodes: GraphNode[] = [raiz]
  const porId = new Map<string, GraphNode>([[raiz.id, raiz]])
  const porNome = new Map<string, GraphNode>([[raiz.nome.toLowerCase(), raiz]])
  const aceitas: ParsedRow[] = []

  // Ordena por id (estável: entre duplicatas, a primeira linha do arquivo
  // vence) para que a saída não dependa da ordem das linhas no CSV.
  const ordenadas = [...rows].sort((a, b) => (a.node.id < b.node.id ? -1 : a.node.id > b.node.id ? 1 : 0))

  for (const p of ordenadas) {
    if (porId.has(p.node.id)) {
      warnings.push(`nome duplicado "${p.node.nome}" (id "${p.node.id}") — a linha repetida foi ignorada`)
      continue
    }
    nodes.push(p.node)
    porId.set(p.node.id, p.node)
    porNome.set(p.node.nome.toLowerCase(), p.node)
    aceitas.push(p)
  }

  const links: GraphLink[] = []
  const fantasmas = new Map<string, GraphNode>()

  for (const p of aceitas) {
    for (const nomeAlvo of p.consome) {
      const chave = nomeAlvo.toLowerCase()
      let alvo = porId.get(chave) ?? porNome.get(chave)
      if (alvo === undefined) {
        alvo = fantasmas.get(chave)
        if (alvo === undefined) {
          alvo = nodeFantasma(nomeAlvo)
          fantasmas.set(chave, alvo)
          warnings.push(
            `consome quebrado: "${nomeAlvo}" em "${p.node.nome}" não corresponde a nenhuma linha do catálogo — criado nó fantasma "${alvo.id}"`,
          )
        }
      }
      links.push({ source: p.node.id, target: alvo.id, label: 'consome' })
    }
  }

  // A raiz agrega automaticamente todos os produtos finais do catálogo.
  for (const n of nodes) {
    if (n.nivel === 'secundario' || n.nivel === 'ambos') {
      links.push({ source: raiz.id, target: n.id, label: 'agrega' })
    }
  }

  const dominios = derivarDominios([...nodes, ...fantasmas.values()], links)
  const derivados = derivarSistemasOrigens(nodes)
  const todosNodes: AnyNode[] = [
    ...nodes,
    ...fantasmas.values(),
    ...dominios.nodes,
    ...derivados.nodes,
  ]
  const todosLinks = [...dominios.links, ...derivados.links]

  todosNodes.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  todosLinks.sort((a, b) => {
    const ka = `${a.source}\u0000${a.target}\u0000${a.label}`
    const kb = `${b.source}\u0000${b.target}\u0000${b.label}`
    return ka < kb ? -1 : ka > kb ? 1 : 0
  })

  return { graph: { nodes: todosNodes, links: todosLinks }, warnings }
}
