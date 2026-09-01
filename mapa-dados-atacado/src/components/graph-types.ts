// Tipos do domínio (schema do graph.json) e wrapper tipado da lib
// react-force-graph-2d. Todo acesso à lib passa por estes aliases para manter o
// resto do app 100% tipado (zero `any` fora daqui).
//
// MODELO ÚNICO: todo nó é um COMPONENTE que pertence a um NÍVEL. Não existe
// categoria especial de nó — raiz, domínio, fonte e origem são níveis como
// qualquer outro, e o que separa um componente de outro é o `nivel` (coluna na
// vista em níveis) e o `tipoComponente` (forma no mapa).
import type {
  ForceGraphMethods,
  LinkObject,
  NodeObject,
} from 'react-force-graph-2d'
// O slug do verbo padrão vem do build pela ponte, não é copiado: é o mesmo
// valor que decide o que uma célula SEM prefixo significa no catálogo, e duas
// cópias dele significariam duas respostas para "o que é uma aresta sem rótulo".
import { VERBO_PADRAO } from './graph-build'

export type Debito = 'sim' | 'nao' | 'avaliar'

/** Vocabulário das colunas de bandeira do catálogo (hoje só
 *  `produto_de_dados`). Célula vazia vale "nao". */
export type SimNao = 'sim' | 'nao'

/** O que o componente É fisicamente, ou DE ONDE ele vem. Define o ÍCONE dentro
 *  do nó no mapa (a cor fica com a semântica de débito, a forma com a bandeira
 *  de produto de dados) e é independente do nível: uma Tabela Delta pode estar
 *  em qualquer camada, um Salesforce também.
 *
 *  O vocabulário tem duas metades que convivem de propósito:
 *
 *    GENÉRICOS o que a coisa é, sem dizer onde mora. "Tabela SQL" continua
 *      valendo para quem só sabe que é uma tabela relacional;
 *    SISTEMAS  de onde o dado vem. "SQL Server" é o mesmo caso granularizado —
 *      os dois existem lado a lado para o inventário poder ser preenchido no
 *      grau de certeza que se tem hoje e refinado depois, sem migração.
 *
 *  A MESMA lista vive em scripts/graph-lib.ts (o build não importa nada do
 *  front-end); um teste trava que as duas não divergem. */
export type TipoComponente =
  | 'Tabela SQL'
  | 'Tabela Delta'
  | 'Default'
  | 'Servidor de arquivos'
  | 'Processos'
  | 'API REST'
  | 'SQL Server'
  | 'MongoDB'
  | 'S3 Bucket'
  | 'Blob Storage'
  | 'Salesforce'
  | 'Data Cloud'
  | 'ServiceNow'
  | 'Pega'
  | 'Excel'

/** Grupos do vocabulário, na ordem em que legenda e select os apresentam.
 *
 *  A divisão não é cosmética: ela é o que decide COMO o nó é desenhado.
 *
 *    CATEGORIA o que a coisa é, sem dono. Glifo abstrato monocromático sobre o
 *      nó pintado na cor do débito — o desenho de sempre, sem mudança nenhuma.
 *    MARCA     o produto de um fornecedor. A logo é desenhada nas cores da
 *      marca e ampliada dentro do nó, o miolo vira neutro e o débito passa para
 *      uma borda grossa. O TAMANHO do nó não muda. Ver `marca` em shapes.ts, que
 *      é a fonte da verdade — um teste trava que os dois não divergem.
 *
 *  A ordem DENTRO de cada grupo é por parentesco de desenho (as duas tabelas
 *  juntas, as duas nuvens Salesforce juntas), para quem lê a legenda comparar os
 *  ícones parecidos lado a lado em vez de caçá-los. */
export const TIPOS_COMPONENTE_GRUPOS: ReadonlyArray<{
  titulo: string
  tipos: readonly TipoComponente[]
}> = [
  {
    titulo: 'Categoria',
    // "Processos" e "API REST" ficam juntos no fim: são os dois tipos que não
    // são um LUGAR onde o dado está parado, e sim algo que o move — a
    // engrenagem processa, a API serve. Quem procura um deles acha o outro ao
    // lado, que é o que a ordem por parentesco existe para fazer.
    tipos: ['Tabela SQL', 'Tabela Delta', 'Default', 'Servidor de arquivos', 'Processos', 'API REST'],
  },
  {
    titulo: 'Marca',
    tipos: [
      'SQL Server',
      'MongoDB',
      'S3 Bucket',
      'Blob Storage',
      'Salesforce',
      'Data Cloud',
      // Os três ladrilhos no fim, juntos: são a mesma construção (cor da marca
      // com o símbolo vazado), e vizinhos na legenda dá para comparar de uma vez
      // que o verde do Excel não é o verde do ServiceNow.
      'ServiceNow',
      'Pega',
      'Excel',
    ],
  },
]

export const TIPOS_COMPONENTE: readonly TipoComponente[] = TIPOS_COMPONENTE_GRUPOS.flatMap(
  (g) => g.tipos,
)

/** Valor assumido quando a linha não declara nada. */
export const TIPO_COMPONENTE_PADRAO: TipoComponente = 'Default'

const TIPOS_VALIDOS = new Set<string>(TIPOS_COMPONENTE)

/** Ponto único de leitura do tipo: valor ausente ou fora do vocabulário cai no
 *  padrão, então forma e select nunca ficam indefinidos. */
export function tipoComponenteDe(node: Pick<GraphNodeData, 'tipoComponente'>): TipoComponente {
  const t = node.tipoComponente
  return t !== undefined && TIPOS_VALIDOS.has(t) ? t : TIPO_COMPONENTE_PADRAO
}

/** Definição de um nível (bloco `niveis` do graph.json). A ordem numérica
 *  posiciona a coluna na vista em níveis (asc = esquerda → direita) e define
 *  qual é o nível de ENTRADA do mapa (o de menor ordem). `builtin` diz apenas
 *  que o nível veio com o modelo — não muda o comportamento de nada. */
export interface NivelDef {
  slug: string
  titulo: string
  ordem: number
  builtin: boolean
  /** Cor "#rrggbb" da faixa do nível na vista em níveis; ausente = padrão.
   *  Escolha livre de quem cadastrou o nível — o código não deriva cor de nome
   *  nenhum. Quem desenha aplica alpha (ver band-colors.ts). */
  corFundo?: string
  /** Cor "#rrggbb" da borda da faixa, que o título também herda. */
  corBorda?: string
}

/** Nó como emitido pelo build (scripts/build-graph.ts). Campos além de
 *  id/nome são opcionais para tolerar variações do JSON gerado. */
export interface GraphNodeData {
  id: string
  nome: string
  /** Slug do nível a que o componente pertence (coluna na vista em níveis). */
  nivel?: string
  tipoComponente?: TipoComponente
  dominio?: string
  debito?: Debito
  status?: string
  owner?: string | null
  centroDeCusto?: string | null
  descricao?: string
  /** Corpo markdown das observações. */
  corpo?: string
  /** Sem owner ou sem centro de custo: borda tracejada no mapa. */
  incompleto?: boolean
  /** Declarado produto de dados: o nó vira OCTÓGONO no mapa. Ausente em
   *  builds antigos — leia sempre por {@link ehProdutoDeDados}. */
  produtoDeDados?: boolean
  /** Nó fantasma: citado em "consome" sem linha no catálogo. */
  fantasma?: boolean
}

/** Slug do nível do nó ('' quando a linha ainda não declara nenhum). */
export function nivelDe(node: Pick<GraphNodeData, 'nivel'>): string {
  return node.nivel ?? ''
}

/** Débito do nó para cor, chip e filtro: o build emite "" na linha que ainda
 *  não declarou nada, e isso vale "a avaliar" — a mesma leitura em toda a UI.
 *  Quem precisa distinguir "não declarado" de "avaliar" (a tabela, que mostra
 *  "⚠ a definir") lê `node.debito` direto. */
export function debitoDe(node: Pick<GraphNodeData, 'debito'>): Debito {
  return node.debito === 'sim' || node.debito === 'nao' ? node.debito : 'avaliar'
}

/** Bandeira de produto de dados do nó: ponto único de leitura, porque o campo
 *  falta no graph.json anterior à coluna `produto_de_dados` (e lá "ausente"
 *  vale "não", igual à célula vazia do CSV). */
export function ehProdutoDeDados(node: Pick<GraphNodeData, 'produtoDeDados'>): boolean {
  return node.produtoDeDados === true
}

/** Componente com linha própria no catálogo (o oposto do fantasma). */
export function isReal(node: Pick<GraphNodeData, 'fantasma'>): boolean {
  return node.fantasma !== true
}

/** Rótulo de um nível pelo slug, com o próprio slug como último recurso. */
export function tituloDoNivel(niveis: readonly NivelDef[], slug: string): string {
  return niveis.find((nv) => nv.slug === slug)?.titulo ?? (slug === '' ? 'Sem nível' : slug)
}

/** Ordem numérica de um nível; slug desconhecido vai para o fim da fila. */
export function ordemDoNivel(niveis: readonly NivelDef[], slug: string): number {
  const nv = niveis.find((n) => n.slug === slug)
  if (nv) return nv.ordem
  return Math.max(0, ...niveis.map((n) => n.ordem)) + 1
}

/** Níveis derivados dos próprios nós, para o graph.json que ainda não traz o
 *  bloco `niveis`: um nível por slug presente, em ordem alfabética. */
export function derivarNiveis(nodes: readonly GraphNodeData[]): NivelDef[] {
  const slugs = [...new Set(nodes.map(nivelDe).filter((s) => s !== ''))].sort((a, b) =>
    a.localeCompare(b, 'pt-BR'),
  )
  return slugs.map((slug, i) => ({
    slug,
    titulo: slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, ' '),
    ordem: i * 10,
    builtin: false,
  }))
}

// nivelDeEntrada/noDeEntrada viviam aqui: o "nível de entrada" era o de menor
// ordem com componentes, e o app abria focado no único nó dele. Saíram junto
// com a exceção que os justificava — focar num componente da primeira coluna
// abria o inventário em vez de isolar. Hoje a entrada do app é simplesmente
// "sem foco", que já é o inventário, e nenhum nível tem tratamento especial.

/** Relação entre dois componentes. O `label` é o SLUG do verbo declarado na
 *  célula do `consome` (`envia:alvo`) — texto livre, não uma união fechada:
 *  o vocabulário é DADO editável pelo usuário (bloco `verbos`), e um tipo que
 *  o enumerasse voltaria a travá-lo no código. Rótulo que não está no
 *  vocabulário não quebra nada — {@link verboDe} cai no padrão.
 *
 *  A aresta guarda o sentido em que a linha foi ESCRITA; quem lê o verbo para
 *  decidir por onde a linhagem anda é a travessia (ver lineage.ts), e o
 *  desenho aponta sempre para o alvo declarado. */
export interface GraphLinkData {
  source: string
  target: string
  label?: string
}

/** Aresta sem rótulo é consumo (formato antigo do build) — o mesmo default
 *  que vale para uma célula do catálogo sem prefixo de verbo. */
export function linkLabel(link: Pick<GraphLinkData, 'label'>): string {
  return link.label ?? VERBO_PADRAO
}

/** Como a linhagem percorre uma aresta deste verbo: `montante` é o consumo de
 *  sempre (o alvo está acima); `jusante` é o contrário; `ambos` percorre nos
 *  dois sentidos; `nenhum` fica FORA da linhagem. A MESMA união vive em
 *  scripts/graph-lib.ts (`SENTIDOS`), que é a fonte da verdade — aqui só o
 *  schema, porque o front não pode importar do build. */
export type Sentido = 'montante' | 'jusante' | 'ambos' | 'nenhum'

/** Definição de um verbo (bloco `verbos` do graph.json): o vocabulário das
 *  relações. O `slug` é o `label` da aresta, e os dois atributos são eixos
 *  INDEPENDENTES — `sentido` diz como a LINHAGEM percorre a aresta, `seta` se
 *  o DESENHO põe ponta nela. "Associado" não tem ponta e mesmo assim carrega o
 *  dado: sem ponta ≠ fora da linhagem.
 *
 *  A LISTA de verbos não vive aqui: ela chega pelo graph.json (ou, no modo
 *  local, pela ponte graph-build.ts). Isto é só a forma de cada entrada. */
export interface VerboDef {
  slug: string
  titulo: string
  sentido: Sentido
  seta: boolean
}

/** Ponto único de leitura de um rótulo de aresta: rótulo desconhecido (build
 *  antigo, verbo removido do vocabulário depois de gravado) cai no padrão —
 *  montante, com seta —, então desenho e travessia nunca ficam indefinidos.
 *  Espelha {@link tipoComponenteDe} e {@link debitoDe}; os dois valores padrão
 *  são os mesmos SENTIDO_PADRAO/SETA_PADRAO de scripts/graph-lib.ts. */
export function verboDe(verbos: readonly VerboDef[], label: string): VerboDef {
  return (
    verbos.find((v) => v.slug === label) ?? {
      slug: label,
      titulo: label,
      sentido: 'montante',
      seta: true,
    }
  )
}

/** Rótulo do verbo para a tela; verbo desconhecido mostra o próprio slug. */
export function tituloDoVerbo(verbos: readonly VerboDef[], label: string): string {
  return verboDe(verbos, label).titulo
}

/** Como a linhagem atravessa esta aresta. */
export function sentidoDoVerbo(verbos: readonly VerboDef[], label: string): Sentido {
  return verboDe(verbos, label).sentido
}

/** A aresta desenha ponta? */
export function temSeta(verbos: readonly VerboDef[], label: string): boolean {
  return verboDe(verbos, label).seta
}

export interface GraphJson {
  nodes: GraphNodeData[]
  links: GraphLinkData[]
  /** TODOS os níveis, ordenados por `ordem`. Ausente em builds antigos — use
   *  derivarNiveis(nodes). */
  niveis?: NivelDef[]
  /** TODOS os verbos do vocabulário, na ordem do arquivo. Ausente em builds
   *  antigos — leia sempre por {@link verboDe}, que cai no padrão. */
  verbos?: VerboDef[]
}

/** Nó/aresta em tempo de simulação (a lib injeta x, y, vx, vy…). */
export type SimNode = NodeObject<GraphNodeData>
export type SimLink = LinkObject<GraphNodeData, GraphLinkData>
export type GraphMethods = ForceGraphMethods<SimNode, SimLink>

/** A simulação troca source/target de string para o objeto do nó. */
export function linkEndId(end: string | number | SimNode | undefined): string {
  if (typeof end === 'object' && end !== null) return String(end.id)
  return String(end)
}

/** Ponto de CONTROLE da curva que a lib desenhou para esta aresta, ou null
 *  quando ela é reta.
 *
 *  Com `linkCurvature` ligado (a vista em níveis), o force-graph calcula por
 *  quadro, para cada aresta visível, uma Bézier QUADRÁTICA e guarda o ponto de
 *  controle no próprio objeto do link, em `__controlPoints` — dois números. Sem
 *  curvatura o campo é null; e no laço de um nó consigo mesmo ele traz QUATRO
 *  números (Bézier cúbica), caso que aqui vale como "sem curva", porque o
 *  catálogo não permite self-loop e nada no mapa desenha um.
 *
 *  É campo interno, fora dos tipos publicados da lib, e por isso a leitura
 *  mora AQUI: este módulo é o wrapper tipado onde toda conversa com a lib
 *  acontece, e o resto do app fica sem `any`. Quem desenha só recebe um ponto —
 *  ou null. */
export function curvaDaAresta(link: SimLink): { x: number; y: number } | null {
  const pontos = (link as { __controlPoints?: unknown }).__controlPoints
  if (!Array.isArray(pontos) || pontos.length !== 2) return null
  const [x, y] = pontos as unknown[]
  return typeof x === 'number' && typeof y === 'number' ? { x, y } : null
}
