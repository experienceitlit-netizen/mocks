// Monta o pacote de demonstração: um HTML autocontido + uma cópia dos CSVs.
//
// Quem recebe abre o HTML por duplo clique (sem instalar nada) e, para editar,
// aponta a pasta `catalogo/` que vem junto — a edição grava nos CSVs daquela
// cópia, nunca no catálogo de trabalho do repositório.
//
// Uso: npm run pacote   (o prepacote roda build:standalone antes)
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ENTREGAS = resolve(RAIZ, '..', 'entregas')
const NOME = 'Mapa de Dados do Atacado'
const ZIP = join(ENTREGAS, 'mapa-dados-atacado-demo.zip')

const HTML = join(RAIZ, 'dist-standalone', 'index.html')
if (!existsSync(HTML)) {
  console.error('dist-standalone/index.html não existe — rode `npm run build:standalone` antes.')
  process.exit(1)
}

// Pasta temporária com a estrutura final (o zip preserva o nome da pasta).
const tmp = join(RAIZ, '.pacote-tmp')
rmSync(tmp, { recursive: true, force: true })
const destino = join(tmp, NOME)
mkdirSync(join(destino, 'catalogo'), { recursive: true })

cpSync(HTML, join(destino, `${NOME}.html`))
// niveis.csv e verbos.csv são OPCIONAIS (o verbos.csv só nasce quando alguém
// grava a tela de verbos): copia-se o que existir, e a falta de um deles vale
// os padrões embutidos, igual ao build.
for (const csv of ['catalogo.csv', 'niveis.csv', 'verbos.csv']) {
  const origem = join(RAIZ, csv)
  if (existsSync(origem)) cpSync(origem, join(destino, 'catalogo', csv))
}

const hoje = new Date().toLocaleDateString('pt-BR')
writeFileSync(
  join(destino, 'LEIA-ME.txt'),
  readFileSync(join(RAIZ, 'scripts', 'pacote-leia-me.txt'), 'utf8').replace('{{DATA}}', hoje),
)

mkdirSync(ENTREGAS, { recursive: true })
rmSync(ZIP, { force: true })
execFileSync('zip', ['-rq', ZIP, NOME], { cwd: tmp })
rmSync(tmp, { recursive: true, force: true })

const kb = Math.round(readFileSync(ZIP).byteLength / 1024)
console.log(`[empacotar] ${ZIP} (${kb} KB)`)
