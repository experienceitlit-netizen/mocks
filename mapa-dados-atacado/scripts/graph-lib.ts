// Funções puras do build do grafo — separadas do CLI para serem testáveis.
import matter from 'gray-matter'

export interface GraphNode {
  id: string
  nome: string
  tipo: string
  /** primario | secundario | ambos */
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
  /** Corpo markdown do arquivo (sem o frontmatter); ausente se vazio. */
  corpo?: string
}

/** Nó materializado a partir de `sistema`/`origem` do frontmatter dos dados. */
export interface DerivedNode {
  id: string
  nome: string
  tipo: 'sistema' | 'origem'
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

export interface Wikilink {
  target: string
  label: string
}

export interface ParsedFile {
  node: GraphNode
  links: Wikilink[]
  warnings: string[]
}

export interface VaultFile {
  /** nome do arquivo, usado só nas mensagens de warning */
  name: string
  raw: string
}

export interface BuildResult {
  graph: Graph
  warnings: string[]
}

const CAMPOS_OBRIGATORIOS = [
  'id',
  'nome',
  'tipo',
  'nivel',
  'dominio',
  'origem',
  'sistema',
  'descricao',
  'debito',
  'status',
] as const

const CAMPOS_ANULAVEIS = ['owner', 'centro_de_custo'] as const

const NIVEL_DEFAULT = 'primario'

/** Extrai [[Alvo]] e [[Alvo|rotulo]] do corpo; rótulo default "consome". */
export function extractWikilinks(body: string): Wikilink[] {
  const links: Wikilink[] = []
  const re = /\[\[([^[\]|]+?)(?:\|([^[\]]+?))?\]\]/g
  for (const m of body.matchAll(re)) {
    const target = (m[1] ?? '').trim()
    if (target === '') continue
    const label = (m[2] ?? '').trim() || 'consome'
    links.push({ target, label })
  }
  return links
}

/** Slug kebab-case sem acentos, usado para id de nós fantasma. */
export function slugify(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function asStringOuNull(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null
  if (typeof valor === 'string') return valor
  return String(valor)
}

/** Parseia um .md do vault: frontmatter (gray-matter) + wikilinks do corpo. */
export function parseVaultFile(file: VaultFile): ParsedFile {
  const warnings: string[] = []
  const { data, content } = matter(file.raw)
  const fm: Record<string, unknown> = data

  const campo = (chave: string): string => {
    const valor = fm[chave]
    if (valor === undefined || valor === null || valor === '') {
      warnings.push(`${file.name}: frontmatter sem o campo obrigatório "${chave}"`)
      return ''
    }
    return typeof valor === 'string' ? valor : String(valor)
  }

  // sistema/origem: null explícito é válido ("não se aplica" — sem warning,
  // sem nó derivado); campo ausente ou vazio continua sendo warning.
  const campoRota = (chave: string): string | null => {
    if (!(chave in fm)) {
      warnings.push(`${file.name}: frontmatter sem o campo obrigatório "${chave}" (use null para "não se aplica")`)
      return null
    }
    const valor = fm[chave]
    if (valor === null) return null
    if (valor === '') {
      warnings.push(`${file.name}: frontmatter sem o campo obrigatório "${chave}"`)
      return null
    }
    return typeof valor === 'string' ? valor : String(valor)
  }

  const campoNivel = (): string => {
    const valor = fm['nivel']
    if (valor === undefined || valor === null || valor === '') {
      warnings.push(`${file.name}: frontmatter sem o campo obrigatório "nivel" — assumindo "${NIVEL_DEFAULT}"`)
      return NIVEL_DEFAULT
    }
    return typeof valor === 'string' ? valor : String(valor)
  }

  for (const chave of CAMPOS_ANULAVEIS) {
    if (!(chave in fm)) {
      warnings.push(`${file.name}: frontmatter sem o campo "${chave}" (use null para "a definir")`)
    }
  }

  const owner = asStringOuNull(fm['owner'])
  const centroDeCusto = asStringOuNull(fm['centro_de_custo'])

  const node: GraphNode = {
    id: campo('id'),
    nome: campo('nome'),
    tipo: campo('tipo'),
    nivel: campoNivel(),
    dominio: campo('dominio'),
    debito: campo('debito'),
    owner,
    centroDeCusto,
    descricao: campo('descricao'),
    sistema: campoRota('sistema'),
    origem: campoRota('origem'),
    status: campo('status'),
    incompleto: owner === null || centroDeCusto === null,
  }

  const corpo = content.trim()
  if (corpo !== '') node.corpo = corpo

  return { node, links: extractWikilinks(content), warnings }
}

/** Valores de sistema/origem que significam "ainda não sabemos" — não viram nó. */
const VALORES_DESCONHECIDOS = new Set(['', 'a confirmar', 'a identificar', 'a detalhar'])

function valorConhecido(valor: string | null | undefined): string | null {
  if (valor === null || valor === undefined) return null
  const texto = valor.trim()
  return VALORES_DESCONHECIDOS.has(texto.toLowerCase()) ? null : texto
}

/**
 * Materializa `sistema` e `origem` dos dados como nós derivados, criando a
 * linhagem dado → sistema → origem:
 * - dedup por chave normalizada (trim + lowercase) do texto original;
 * - valores desconhecidos ("a confirmar" etc.) não geram nó nem aresta;
 * - sistema desconhecido com origem conhecida liga dado → origem direto.
 */
export function derivarSistemasOrigens(dados: GraphNode[]): { nodes: DerivedNode[]; links: GraphLink[] } {
  const sistemas = new Map<string, DerivedNode>()
  const origens = new Map<string, DerivedNode>()
  const links: GraphLink[] = []
  const arestasVistas = new Set<string>()

  const noDerivado = (
    mapa: Map<string, DerivedNode>,
    prefixo: 'sys' | 'org',
    tipo: 'sistema' | 'origem',
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
    if (sistema !== null) {
      const noSistema = noDerivado(sistemas, 'sys', 'sistema', sistema)
      addLink(dado.id, noSistema.id, 'vem de')
      if (origem !== null) {
        const noOrigem = noDerivado(origens, 'org', 'origem', origem)
        addLink(noSistema.id, noOrigem.id, 'origina de')
      }
    } else if (origem !== null) {
      const noOrigem = noDerivado(origens, 'org', 'origem', origem)
      addLink(dado.id, noOrigem.id, 'origina de')
    }
  }

  return { nodes: [...sistemas.values(), ...origens.values()], links }
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
    descricao: 'Nó fantasma: referenciado por wikilink, mas sem arquivo no vault.',
    sistema: 'desconhecido',
    origem: 'desconhecida',
    status: 'investigacao',
    incompleto: true,
    fantasma: true,
  }
}

/**
 * Monta o grafo a partir dos arquivos do vault.
 * - resolve wikilinks por `nome` OU `id`, case-insensitive;
 * - link para alvo inexistente vira warning + nó fantasma;
 * - saída determinística (nodes por id, links por source/target/label).
 */
export function buildGraph(files: VaultFile[]): BuildResult {
  const warnings: string[] = []
  const parsed: ParsedFile[] = [...files]
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .map(parseVaultFile)

  const nodes: GraphNode[] = []
  const porId = new Map<string, GraphNode>()
  const porNome = new Map<string, GraphNode>()

  for (const p of parsed) {
    warnings.push(...p.warnings)
    const chaveId = p.node.id.toLowerCase()
    if (porId.has(chaveId)) {
      warnings.push(`id duplicado "${p.node.id}" — o arquivo repetido foi ignorado`)
      continue
    }
    nodes.push(p.node)
    porId.set(chaveId, p.node)
    porNome.set(p.node.nome.toLowerCase(), p.node)
  }

  const links: GraphLink[] = []
  const fantasmas = new Map<string, GraphNode>()

  for (const p of parsed) {
    const origem = porId.get(p.node.id.toLowerCase())
    if (origem !== p.node) continue // arquivo descartado por id duplicado
    for (const link of p.links) {
      const chave = link.target.toLowerCase()
      let alvo = porId.get(chave) ?? porNome.get(chave)
      if (alvo === undefined) {
        alvo = fantasmas.get(chave)
        if (alvo === undefined) {
          alvo = nodeFantasma(link.target)
          fantasmas.set(chave, alvo)
          warnings.push(
            `link quebrado: [[${link.target}]] em "${p.node.nome}" não corresponde a nenhum nó — criado nó fantasma "${alvo.id}"`,
          )
        }
      }
      links.push({ source: origem.id, target: alvo.id, label: link.label })
    }
  }

  const derivados = derivarSistemasOrigens(nodes)
  const todosNodes: AnyNode[] = [...nodes, ...fantasmas.values(), ...derivados.nodes]
  links.push(...derivados.links)

  todosNodes.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  links.sort((a, b) => {
    const ka = `${a.source}\u0000${a.target}\u0000${a.label}`
    const kb = `${b.source}\u0000${b.target}\u0000${b.label}`
    return ka < kb ? -1 : ka > kb ? 1 : 0
  })

  return { graph: { nodes: todosNodes, links }, warnings }
}

export { CAMPOS_OBRIGATORIOS }
