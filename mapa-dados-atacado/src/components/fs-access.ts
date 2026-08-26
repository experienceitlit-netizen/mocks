// File System Access API: escolher a pasta do catálogo, ler os dois CSVs,
// gravá-los de volta e lembrar a pasta entre sessões.
//
// É a única parte do adaptador que fala com o navegador — por isso fica
// isolada aqui, fora do catalog-store-local (que é lógica pura e testável em
// Node). Nada disto existe no Firefox: quem decide é suportaFsAccess().
//
// Os tipos dos handles já vêm do lib.dom; `showDirectoryPicker` e as permissões
// por handle ainda não estão lá, então são declarados abaixo.
import type { ArquivosCatalogo } from './catalog-store'
import type { ArquivoCatalogo, DestinoLocal } from './catalog-store-local'

interface DescritorPermissao {
  mode: 'read' | 'readwrite'
}

/** Handle de pasta com os métodos de permissão (Chromium). */
export type PastaHandle = FileSystemDirectoryHandle & {
  queryPermission?(desc: DescritorPermissao): Promise<PermissionState>
  requestPermission?(desc: DescritorPermissao): Promise<PermissionState>
}

interface OpcoesPicker {
  /** Faz o Chrome reabrir na última pasta usada com este mesmo id. */
  id?: string
  mode?: 'read' | 'readwrite'
  startIn?: string
}

type JanelaComPicker = Window & {
  showDirectoryPicker?(opcoes?: OpcoesPicker): Promise<PastaHandle>
}

/** Nomes fixos: a pasta escolhida é a que tem o catálogo, com os mesmos nomes
 *  de arquivo do projeto. */
export const ARQUIVO_CATALOGO = 'catalogo.csv'
export const ARQUIVO_NIVEIS = 'niveis.csv'

const ESCRITA: DescritorPermissao = { mode: 'readwrite' }

/** O navegador tem File System Access? (Chrome/Edge sim, inclusive em file://;
 *  Firefox e Safari não.) */
export function suportaFsAccess(): boolean {
  return typeof window !== 'undefined' && typeof (window as JanelaComPicker).showDirectoryPicker === 'function'
}

/** Abre o seletor de pasta (exige gesto do usuário). null = cancelado. */
export async function escolherPasta(): Promise<PastaHandle | null> {
  const picker = (window as JanelaComPicker).showDirectoryPicker
  if (picker === undefined) return null
  try {
    return await picker.call(window, { id: 'catalogo-atacado', mode: 'readwrite' })
  } catch (erro) {
    // Cancelar o diálogo não é erro.
    if (erro instanceof DOMException && erro.name === 'AbortError') return null
    throw erro
  }
}

export function permissaoDeEscrita(pasta: PastaHandle): Promise<PermissionState> {
  // Sem o método (navegador que só implementa o básico), assume-se concedida —
  // a gravação em si dirá se não era.
  return pasta.queryPermission?.(ESCRITA) ?? Promise.resolve<PermissionState>('granted')
}

/** Pede a permissão de gravação de novo (exige gesto do usuário). */
export function pedirPermissaoDeEscrita(pasta: PastaHandle): Promise<PermissionState> {
  return pasta.requestPermission?.(ESCRITA) ?? Promise.resolve<PermissionState>('granted')
}

async function lerArquivo(pasta: PastaHandle, nome: string): Promise<string | null> {
  try {
    const handle = await pasta.getFileHandle(nome)
    return await (await handle.getFile()).text()
  } catch (erro) {
    if (erro instanceof DOMException && erro.name === 'NotFoundError') return null
    throw erro
  }
}

/**
 * Lê os dois CSVs da pasta. catalogo.csv é obrigatório (sem ele a pasta não é
 * um catálogo); niveis.csv ausente vira "", a mesma tolerância do build — o
 * mapa fica com os níveis padrão.
 */
export async function lerArquivosDaPasta(pasta: PastaHandle): Promise<ArquivosCatalogo> {
  const catalogo = await lerArquivo(pasta, ARQUIVO_CATALOGO)
  if (catalogo === null) {
    throw new Error(
      `A pasta "${pasta.name}" não tem ${ARQUIVO_CATALOGO} — escolha a pasta onde o catálogo está.`,
    )
  }
  return { catalogo, niveis: (await lerArquivo(pasta, ARQUIVO_NIVEIS)) ?? '' }
}

const NOME_DO_ARQUIVO: Record<ArquivoCatalogo, string> = {
  catalogo: ARQUIVO_CATALOGO,
  niveis: ARQUIVO_NIVEIS,
}

/** Destino que grava de verdade na pasta escolhida. */
export function destinoPasta(pasta: PastaHandle): DestinoLocal {
  return {
    modo: 'arquivo',
    rotulo: `${pasta.name}/${ARQUIVO_CATALOGO}`,
    async gravar(arquivo: ArquivoCatalogo, texto: string): Promise<void> {
      try {
        const handle = await pasta.getFileHandle(NOME_DO_ARQUIVO[arquivo], { create: true })
        const escrita = await handle.createWritable()
        await escrita.write(texto)
        await escrita.close()
      } catch (erro) {
        if (erro instanceof DOMException && erro.name === 'NotAllowedError') {
          throw new Error(
            'Permissão de gravação perdida — clique em "Abrir catálogo" e escolha a pasta de novo.',
          )
        }
        throw erro
      }
    },
  }
}

// ---------------------------------------------------------------------------
// Handle guardado entre sessões (IndexedDB).
//
// O Chrome sabe serializar um FileSystemDirectoryHandle no IndexedDB, e na
// volta basta re-pedir a permissão com um clique. Mas o IndexedDB NÃO funciona
// em file:// — a abertura do banco simplesmente nunca responde. Por isso toda
// chamada aqui tem prazo e devolve null em vez de travar: sem o handle
// guardado, o usuário só escolhe a pasta de novo.
// ---------------------------------------------------------------------------

const DB_NOME = 'mapa-dados-atacado'
const DB_STORE = 'handles'
const DB_CHAVE = 'pasta-catalogo'
/** Prazo para o IndexedDB responder antes de desistir (file:// nunca responde). */
const DB_TIMEOUT_MS = 1500

function comPrazo<T>(executar: (resolver: (valor: T | null) => void) => void): Promise<T | null> {
  return new Promise<T | null>((resolve) => {
    let encerrado = false
    const encerrar = (valor: T | null): void => {
      if (encerrado) return
      encerrado = true
      window.clearTimeout(prazo)
      resolve(valor)
    }
    const prazo = window.setTimeout(() => encerrar(null), DB_TIMEOUT_MS)
    try {
      executar(encerrar)
    } catch {
      encerrar(null)
    }
  })
}

function abrirDb(): Promise<IDBDatabase | null> {
  return comPrazo<IDBDatabase>((pronto) => {
    const req = indexedDB.open(DB_NOME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(DB_STORE)) req.result.createObjectStore(DB_STORE)
    }
    req.onsuccess = () => pronto(req.result)
    req.onerror = () => pronto(null)
    req.onblocked = () => pronto(null)
  })
}

/** Guarda a pasta escolhida para a próxima sessão. Falhar aqui é irrelevante:
 *  no máximo o usuário escolhe a pasta de novo. */
export async function guardarPasta(pasta: PastaHandle): Promise<void> {
  const db = await abrirDb()
  if (db === null) return
  await comPrazo<true>((pronto) => {
    const tx = db.transaction(DB_STORE, 'readwrite')
    tx.objectStore(DB_STORE).put(pasta, DB_CHAVE)
    tx.oncomplete = () => pronto(true)
    tx.onerror = () => pronto(null)
    tx.onabort = () => pronto(null)
  })
  db.close()
}

/** Pasta da sessão anterior, se o navegador ainda a tiver. */
export async function lerPastaGuardada(): Promise<PastaHandle | null> {
  const db = await abrirDb()
  if (db === null) return null
  const pasta = await comPrazo<PastaHandle>((pronto) => {
    const req = db.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).get(DB_CHAVE)
    req.onsuccess = () => {
      const valor: unknown = req.result
      pronto(
        typeof valor === 'object' && valor !== null && (valor as FileSystemHandle).kind === 'directory'
          ? (valor as PastaHandle)
          : null,
      )
    }
    req.onerror = () => pronto(null)
  })
  db.close()
  return pasta
}

/** Esquece a pasta guardada (o usuário trocou de catálogo ou negou o acesso). */
export async function esquecerPasta(): Promise<void> {
  const db = await abrirDb()
  if (db === null) return
  await comPrazo<true>((pronto) => {
    const tx = db.transaction(DB_STORE, 'readwrite')
    tx.objectStore(DB_STORE).delete(DB_CHAVE)
    tx.oncomplete = () => pronto(true)
    tx.onerror = () => pronto(null)
    tx.onabort = () => pronto(null)
  })
  db.close()
}
