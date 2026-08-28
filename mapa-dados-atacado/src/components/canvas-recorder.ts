// Ajudante de TESTE (não entra em nenhuma tela): um CanvasRenderingContext2D de
// mentira que só anota, em ordem, as chamadas que recebeu.
//
// É o que permite testar o desenho do nó sem navegador nem canvas de verdade:
// as funções de shapes.ts são as únicas do app que falam com o contexto 2D, e o
// que se quer travar delas é justamente a SEQUÊNCIA de comandos (arco ou oito
// arestas? preenche ou traça? restaura o estado que mexeu?).

/** Contexto de canvas anotado: aceito onde se espera o de verdade, mais a lista
 *  de chamadas que recebeu. */
export type CanvasFake = CanvasRenderingContext2D & { calls: string[] }

/** Contexto de mentira pronto para passar a traceShape/drawGlifo. O cast é o
 *  ponto único de "faz de conta" — daqui para fora tudo é tipado. */
export function fakeCtx(): CanvasFake {
  const calls: string[] = []
  return {
    calls,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    lineCap: 'butt',
    beginPath: () => calls.push('beginPath'),
    closePath: () => calls.push('closePath'),
    moveTo: (x: number, y: number) => calls.push(`moveTo(${x},${y})`),
    lineTo: (x: number, y: number) => calls.push(`lineTo(${x},${y})`),
    arc: (x: number, y: number, r: number) => calls.push(`arc(${x},${y},${r})`),
    fill: () => calls.push('fill'),
    stroke: () => calls.push('stroke'),
    save: () => calls.push('save'),
    restore: () => calls.push('restore'),
  } as unknown as CanvasFake
}
