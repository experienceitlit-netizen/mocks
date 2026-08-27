// Invólucro dos painéis flutuantes do mapa (filtros e legenda): recolhe para um
// botão pequeno e volta ao clique. A preferência fica no navegador — quem
// trabalha com o mapa cheio esconde uma vez e não precisa repetir a cada visita.
//
// Recolhido, o painel some do fluxo visual mas continua acessível: o botão
// mantém o mesmo canto, então o gesto de voltar é o mesmo de esconder.
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'

interface PainelRecolhivelProps {
  /** Some no rótulo do botão quando recolhido e no title do "−". */
  titulo: string
  /** Chave do localStorage (uma por painel). */
  chave: string
  /** Canto em que o painel vive, para o botão nascer no mesmo lugar. */
  posicao: 'superior' | 'inferior'
  children: ReactNode
}

function leuRecolhido(chave: string): boolean {
  try {
    return window.localStorage.getItem(chave) === '1'
  } catch {
    // Navegador com storage bloqueado: o painel só não lembra da escolha.
    return false
  }
}

export default function PainelRecolhivel({
  titulo,
  chave,
  posicao,
  children,
}: PainelRecolhivelProps) {
  const [recolhido, setRecolhido] = useState(() => leuRecolhido(chave))

  useEffect(() => {
    try {
      window.localStorage.setItem(chave, recolhido ? '1' : '0')
    } catch {
      /* sem storage: a escolha vale só nesta sessão */
    }
  }, [chave, recolhido])

  if (recolhido) {
    return (
      <button
        type="button"
        className={`painel-abrir painel-abrir--${posicao}`}
        onClick={() => setRecolhido(false)}
        title={`Mostrar ${titulo.toLowerCase()}`}
      >
        {titulo}
      </button>
    )
  }

  return (
    <div className={`painel painel--${posicao}`}>
      <button
        type="button"
        className="painel__recolher"
        onClick={() => setRecolhido(true)}
        aria-label={`Esconder ${titulo.toLowerCase()}`}
        title={`Esconder ${titulo.toLowerCase()}`}
      >
        −
      </button>
      {children}
    </div>
  )
}
