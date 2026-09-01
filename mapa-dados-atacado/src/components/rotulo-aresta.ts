// Geometria do RÓTULO DA ARESTA: ONDE o verbo é escrito sobre a ligação e de
// que TAMANHO. Puro — nenhum canvas, nenhuma lib —, pela mesma separação de
// shapes.ts e node-size.ts: a matemática sai do Graph.tsx para poder ser
// testada, e lá fica só a chamada de canvas, que não se testa.
//
// A conta NÃO é "o meio entre as duas pontas". Na vista em níveis a aresta é
// CURVA (`linkCurvature`), e a lib guarda essa curva no próprio objeto do link:
// uma Bézier quadrática com um ponto de controle deslocado para o lado da
// corda. O meio da CORDA fica fora da linha desenhada — e é justamente no meio
// do vão que a curva mais se afasta dela —, então um rótulo ali flutuaria ao
// lado da aresta em vez de sobre ela. Ponto e curva de verdade, portanto; a reta
// (vista em força, `linkCurvature` 0) é só o caso do ponto de controle ausente.
//
// O TEXTO NÃO GIRA. Escrever o verbo inclinado ao longo da aresta é o desenho
// clássico e foi a primeira tentativa; caiu na tela. Numa coluna da vista em
// níveis, as arestas entre dois componentes do MESMO nível são quase verticais,
// e ali o rótulo girado vira uma tira de ~75 px de altura: três dessas, saindo
// do mesmo nó, se encavalam entre si e ainda por cima cobrem o NOME dos
// componentes — que é a primeira leitura do mapa e não pode ser tapada por uma
// informação de segunda. Deitado, o mesmo rótulo mede ~20 px de altura, cabe
// entre uma aresta e a de baixo, e nunca sai de cabeça para baixo em ângulo
// nenhum — o problema de virar o texto além de ±90° deixa de existir em vez de
// ser resolvido. Nas arestas longas entre colunas, que são quase horizontais,
// girar não mudava quase nada: o ganho do giro era pequeno onde ele funcionava e
// o prejuízo era grande onde não.
//
// Tudo aqui é geometria em unidades de GRAFO, menos as medidas de fonte e
// tarja, que são px de TELA — quem desenha divide pela escala, como o rótulo do
// nó já faz.

export interface Ponto {
  x: number
  y: number
}

/** Onde, ao longo da aresta, o rótulo é escrito. 0.5 é o meio da curva — não o
 *  meio em comprimento de arco, que numa Bézier quadrática não é o mesmo ponto,
 *  mas a diferença entre os dois é invisível na curvatura suave que o mapa usa
 *  (0.18) e o parâmetro é a conta que não precisa de integral. */
export const T_ROTULO = 0.5

/** Ponto da Bézier quadrática em t: B(t) = (1−t)²A + 2(1−t)t·C + t²B. */
export function pontoNaCurva(a: Ponto, controle: Ponto, b: Ponto, t: number): Ponto {
  const u = 1 - t
  return {
    x: u * u * a.x + 2 * u * t * controle.x + t * t * b.x,
    y: u * u * a.y + 2 * u * t * controle.y + t * t * b.y,
  }
}

/** Ponto sobre a aresta em t. `controle` null = reta, e aí é interpolação
 *  linear entre as duas pontas. */
export function pontoNaAresta(a: Ponto, b: Ponto, controle: Ponto | null, t: number): Ponto {
  if (controle === null) return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
  return pontoNaCurva(a, controle, b, t)
}

/** Onde escrever o rótulo desta aresta: o meio da linha DESENHADA. */
export function pontoDoRotulo(a: Ponto, b: Ponto, controle: Ponto | null): Ponto {
  return pontoNaAresta(a, b, controle, T_ROTULO)
}

/** Piso e teto do corpo da fonte do rótulo, em px de TELA.
 *
 *  Os dois lados existem pelo mesmo motivo do rótulo do NÓ (ver drawNode), um
 *  passo abaixo dele: o piso mantém o verbo legível quando o mapa inteiro cabe
 *  na janela e as arestas viram fios; o teto impede que, ampliado, ele cresça
 *  mais que o nome do componente e passe a competir com ele. O rótulo da aresta
 *  é informação de segunda leitura — quem é o componente vem primeiro. */
export const FONTE_MIN = 9
export const FONTE_MAX = 18

/** Corpo da fonte do rótulo em px de TELA para uma escala de zoom. Entre o piso
 *  e o teto ele acompanha o zoom, como o rótulo do nó. */
export function fonteDoRotulo(scale: number): number {
  return Math.min(FONTE_MAX, Math.max(FONTE_MIN, FONTE_MIN * scale))
}

/** Folga entre o texto e a borda da tarja, em px de TELA. */
export const TARJA_PAD_X = 5
export const TARJA_PAD_Y = 3

/** Tarja atrás do texto, em px de TELA (quem desenha divide pela escala).
 *
 *  Ela existe porque o rótulo cai EM CIMA da aresta acesa — branca, sobre
 *  faixas de nível e nós. Sem um fundo, o traço corta as letras no meio e o
 *  texto some no que passa por baixo. Totalmente arredondada (raio = metade da
 *  altura) para ler como etiqueta pendurada na linha, e não como uma caixa
 *  desenhada por cima do mapa. */
export function tarjaDoRotulo(
  larguraTexto: number,
  fonte: number,
): { largura: number; altura: number; raio: number } {
  const altura = fonte + TARJA_PAD_Y * 2
  return { largura: larguraTexto + TARJA_PAD_X * 2, altura, raio: altura / 2 }
}
