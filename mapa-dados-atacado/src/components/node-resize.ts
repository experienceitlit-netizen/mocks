// REDIMENSIONAR UM NÓ PELA BORDA — a lógica pura do gesto, sem React e sem
// canvas. Graph.tsx só liga isto a eventos de mouse; tudo que decide alguma
// coisa (o que conta como "estar na borda", quanto o arraste muda o tamanho,
// onde ficam os limites, que cursor mostrar) mora aqui e é testado aqui.
//
// O QUE ESTE AJUSTE **NÃO** É: ele não muda o significado do tamanho no modelo.
// O raio de um nó continua vindo do GRAU (quantas conexões ele tem) e da
// bandeira de PRODUTO DE DADOS (a ponta do losango chega um pouco além do
// círculo) — ver Graph.tsx/shapes.ts.
// O fator daqui é uma lente por cima disso, para o usuário destacar à mão o nó
// de que está falando numa reunião. Por isso ele vive só na sessão: não vai
// para o CSV, nem para a URL, nem para o armazenamento do navegador, e um
// F5 devolve o mapa ao tamanho que os dados calculam.

/** Fator de um nó que ninguém redimensionou. Um nó nesse fator NÃO fica no mapa
 *  de escalas — "nenhum nó mexido" é sempre um mapa vazio (ver comFator). */
export const FATOR_PADRAO = 1

/** Limites do ajuste, multiplicando o raio que o nó teria normalmente.
 *
 *  Metade ainda é um nó legível: o menor raio do mapa é ~5 px de grafo, e 2,5 px
 *  continua sendo um ponto visível e clicável (a área de clique acompanha o
 *  fator). O triplo é o teto porque acima disso um único nó já cobre os vizinhos
 *  da própria coluna na vista em níveis — deixaria de destacar e passaria a
 *  esconder. */
export const FATOR_MIN = 0.5
export const FATOR_MAX = 3

/** Meia-largura da faixa de borda, em px de TELA.
 *
 *  Em px de tela, e não de grafo, porque isto é uma zona de INTERAÇÃO e não uma
 *  medida do dado: a faixa tem a mesma espessura aparente com o mapa inteiro na
 *  tela e no close de um nó — igual ao halo de seleção (HALO_GAP em shapes.ts),
 *  pelo mesmo motivo. 6 px é o alvo confortável de mouse sem invadir o miolo do
 *  menor nó do mapa. */
export const BORDA_TOL_PX = 6

/** Distância mínima (px de tela) do cursor ao centro para o arraste ter razão
 *  de escala confiável. Abaixo disso a divisão explode; o gesto simplesmente
 *  não mexe no tamanho. */
const DIST_MIN_PX = 1

/** Diferença de fator abaixo da qual dois tamanhos são o mesmo tamanho — evita
 *  gravar um estado novo (e re-renderizar) a cada pixel de mouse. */
const EPSILON = 0.005

/** Fator dentro dos limites. Valor inválido (NaN de uma divisão por zero, por
 *  exemplo) volta ao padrão em vez de sumir com o nó. */
export function clampFator(fator: number): number {
  if (!Number.isFinite(fator)) return FATOR_PADRAO
  return Math.min(FATOR_MAX, Math.max(FATOR_MIN, fator))
}

/** O fator já está encostado num dos limites? (a marca de borda avisa o usuário
 *  de que puxar mais não adianta). */
export function noLimite(fator: number): boolean {
  return fator <= FATOR_MIN + EPSILON || fator >= FATOR_MAX - EPSILON
}

/** Fator em vigor para um nó; ausente do mapa = o tamanho calculado. */
export function fatorDe(escalas: ReadonlyMap<string, number>, id: string): number {
  return clampFator(escalas.get(id) ?? FATOR_PADRAO)
}

/** O cursor está na faixa da borda? `dist` é a distância do cursor ao centro do
 *  nó e `raioBorda` é a distância do centro à silhueta NAQUELA direção — os
 *  dois em px de tela. A faixa é simétrica: pega tanto por dentro quanto por
 *  fora, senão a borda de um nó pequeno seria quase impossível de acertar. */
export function naBorda(dist: number, raioBorda: number, tol: number = BORDA_TOL_PX): boolean {
  return Math.abs(dist - raioBorda) <= tol
}

/** Fator durante o arraste.
 *
 *  A regra é uma razão de distâncias, não um delta: o novo fator é o do início
 *  do gesto vezes quanto o cursor se afastou (ou se aproximou) do centro. Quem
 *  pegou EXATAMENTE na borda desenhada tem distInicial = raio da borda, e então
 *  o raio novo é a própria distância do cursor — ou seja, a borda gruda no
 *  cursor e o nó "estica" junto com a mão. Um delta em px daria o mesmo passo
 *  para um nó pequeno e um grande (e dependeria do zoom); a razão é invariante
 *  aos dois. */
export function fatorArrastando(
  fatorInicial: number,
  distInicial: number,
  distAtual: number,
): number {
  if (!(distInicial > DIST_MIN_PX)) return clampFator(fatorInicial)
  return clampFator((clampFator(fatorInicial) * distAtual) / distInicial)
}

/** Mapa de escalas com `id` no fator dado.
 *
 *  Devolve o MESMO mapa quando nada muda de fato (o arraste dispara dezenas de
 *  eventos por segundo e a maioria não move o tamanho o bastante para valer um
 *  render), e apaga a entrada quando o nó volta ao padrão — assim `size === 0`
 *  significa sempre "nenhum nó redimensionado", que é o que a legenda mostra. */
export function comFator(
  escalas: ReadonlyMap<string, number>,
  id: string,
  fator: number,
): ReadonlyMap<string, number> {
  const alvo = clampFator(fator)
  if (Math.abs(fatorDe(escalas, id) - alvo) < EPSILON) return escalas
  const proximo = new Map(escalas)
  if (Math.abs(alvo - FATOR_PADRAO) < EPSILON) proximo.delete(id)
  else proximo.set(id, alvo)
  return proximo
}

/** Escalas sem os nós que saíram do grafo (componente excluído com a página
 *  aberta). Mesmo contrato de identidade: sem sobra, devolve o mapa recebido. */
export function podadas(
  escalas: ReadonlyMap<string, number>,
  existe: (id: string) => boolean,
): ReadonlyMap<string, number> {
  const sobrando = [...escalas.keys()].filter((id) => !existe(id))
  if (sobrando.length === 0) return escalas
  const proximo = new Map(escalas)
  for (const id of sobrando) proximo.delete(id)
  return proximo
}

/** Cursores de redimensionar, na ordem dos setores de 45° a partir do leste.
 *  São os quatro que todo sistema operacional desenha nas alças de uma janela —
 *  usar o que casa com a DIREÇÃO em que a mão vai puxar é o que faz o gesto ser
 *  reconhecido sem ninguém explicar. */
const CURSORES = ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'] as const

/** Cursor para a borda na direção `theta` (mesma convenção do canvas: 0 =
 *  leste, y para baixo). Leste/oeste ↔ ew, sul/norte ↔ ns, e as diagonais
 *  recebem o par que aponta na mesma inclinação. */
export function cursorDaBorda(theta: number): string {
  const setor = Math.round(theta / (Math.PI / 4))
  return CURSORES[((setor % 4) + 4) % 4]
}
