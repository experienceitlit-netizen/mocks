# Retomar o trabalho

Documento de passagem entre sessões. Para continuar, comece com:

> Leia `mapa-dados-atacado/docs/CONTINUAR.md` e confirme o estado atual antes de
> propor qualquer coisa.

O que está escrito aqui era verdade quando o documento foi salvo — **confirme
antes de confiar**, porque o catálogo é editado pelo app e o código pode ter
avançado:

```bash
cd mapa-dados-atacado
git log --oneline -8
git status --short        # o que ficou sem commitar
npm test && npx tsc -b --noEmit
npm run data              # contagens e avisos do catálogo
```

## O que é

MVP de um mapa de dados navegável (estilo grafo do Obsidian) da Diretoria
Comercial Atacado de um banco. O objetivo é validar com o negócio a experiência
de navegar o mapa e **tornar visível o gap de governança** — quem é dono de cada
dado, o que tem débito técnico, o que vem de onde.

Repositório: `experienceitlit-netizen/mocks` (remoto `origin`, push liberado).
O app vive em `mapa-dados-atacado/`; `entregas/` guarda os pacotes distribuíveis.

## Modelo (não rediscuta sem motivo)

Estas decisões foram tomadas com o usuário ao longo de várias rodadas, algumas
revertendo o desenho anterior. Vieram de discussão, não de conveniência técnica:

- **Todo nó é um COMPONENTE que pertence a um NÍVEL.** Não existe "produto",
  "insumo", "raiz" ou "domínio" como categoria especial no código — o que
  classifica um nó é o nível dele.
- **Nada é inferido.** Todo nó vem de uma linha do catálogo; toda aresta vem de
  uma coluna (`consome` ou `associacoes`). O build não deriva nós de campos nem
  cria ligações automáticas — isso já existiu e foi removido a pedido. Uma regra
  que pintava de âmbar quem tivesse "legado" ou "planilha" no nome também caiu
  pelo mesmo motivo: o débito já é declarado na coluna `debito`, e adivinhá-lo
  pelo texto criava uma segunda fonte de verdade.
- **Níveis são livres**: qualquer um pode ser criado, renomeado, reordenado,
  colorido e removido (removê-lo é recusado enquanto houver componentes nele).
  O código não conhece "bronze" ou "prata" — a semântica é do usuário, que
  inclusive já renomeou "Domínio" para "Jornada".
- **Nenhum nível tem tratamento especial.** Havia uma exceção — focar num
  componente do nível de menor ordem abria o inventário completo em vez de
  isolar — e ela foi removida. Ver "Correções" abaixo.
- **Eixos visuais independentes**: a COLUNA diz o nível; a COR diz o débito; a
  FORMA (losango × círculo) e o PESO DO RÓTULO dizem se é produto de dados; o
  ÍCONE interno diz o tipo de componente; a BORDA TRACEJADA diz que falta owner
  ou centro de custo. O **tamanho** não é eixo de dado: é grau de conexões mais
  o ajuste manual da sessão.
- **O CSV precisa continuar legível** para quem abre na planilha. Foi o que
  descartou identificadores opacos (uuid) quando surgiu a necessidade de chave
  estável.

## Como os dados vivem

`catalogo.csv` (uma linha por componente) e `niveis.csv` na raiz do projeto →
`scripts/graph-lib.ts` (funções **puras**, sem I/O, zero imports) →
`src/data/graph.json` → front-end. O `graph-lib` roda tanto no Node (CLI
`npm run data`) quanto no navegador — é o que permite o pacote HTML gerar o
grafo sozinho, e é por isso que ele não pode ganhar nenhum `import`.

Edição pelo app, em três modos escolhidos por detecção automática:

| Modo | Quando | Grava em |
| --- | --- | --- |
| dev server | `npm run dev` | os CSVs do projeto, via `/api/catalogo` |
| arquivo local | pacote HTML + "Abrir catálogo" | os CSVs da pasta escolhida |
| somente leitura | sem os dois | nada |

## Estado ao salvar este documento

Tudo verde: **425 testes**, `tsc` e build limpos, worktree commitado.

### O catálogo é um MAPA DE EXEMPLO, não dado real

Os 27 componentes de hoje foram criados de propósito para demonstrar o modelo:
oito sistemas na Origem (um por tipo de marca), cinco mecanismos de ingestão na
Fonte, as camadas Broze/Silver/Gold só com Tabela Delta, e três jornadas de
negócio. Os 15 tipos de componente estão todos em uso, os três do Gold são
produtos de dados, e alguns componentes ficaram sem owner e com débito de
propósito — são o retrato do gap que o mapa existe para mostrar.

**O catálogo real anterior está no commit `bb6231c`**, se precisar voltar.

### O que esta sessão entregou

- **Tipo de componente virou ÍCONE**, com 15 tipos em dois grupos que recebem
  tratamento visual diferente porque carregam informação diferente:
  - *Categoria* (Tabela SQL, Tabela Delta, Default, Servidor de arquivos,
    Processos, API REST): glifo monocromático claro sobre o nó pintado na cor do
    débito. O glifo divide o nó com a cor, então deixa campo à mostra.
  - *Marca* (SQL Server, MongoDB, S3 Bucket, Blob Storage, Salesforce, Data
    Cloud, ServiceNow, Pega, Excel): a logo nas cores próprias sobre miolo
    neutro, e o débito migra para um anel grosso na borda.

  Tudo em canvas puro, sem asset externo, para o pacote continuar autocontido. A
  legenda desenha as amostras a partir da MESMA geometria (`shapes.ts`),
  convertida para SVG — legenda e mapa não têm como divergir.

  **Houve um degrau de tamanho para as marcas, testado e descartado**: o usuário
  achou que piorava a leitura e que o redimensionamento manual já resolve. Todo
  componente nasce do mesmo tamanho. Não reintroduza sem pedido.

- **Mover as faixas de nível pelo cabeçalho** (`band-move.ts`), só na sessão.
  Horizontal REORDENA dentro do fluxo (as vizinhas se acomodam, nunca sobrepõe,
  nunca deixa buraco); vertical é deslocamento livre, porque não existe fluxo
  vertical. A alça é o cabeçalho e não o corpo da faixa: ali é o pan do mapa, o
  gesto mais usado. Quando a ordem nova convence, **"✓ Aplicar esta ordem"**
  grava no `niveis.csv` — fica na barra do topo junto do "≣ Níveis", porque os
  dois botões daquela ponta gravam no catálogo e a legenda só desfaz sessão.

### Correções desta sessão

- **Foco no primeiro nível não isolava.** `buildLineage` tratava "foco num
  componente do nível de menor ordem" igual a "sem foco": ambos abriam o
  inventário completo. A regra existia para o app poder abrir "focado na
  entrada" mostrando o mapa cheio, e o preço era que a primeira coluna era a
  única em que "Focar neste nó" não fazia nada. Hoje a condição é só
  `root === null`, e a abertura do app é **sem foco** — que já significa
  inventário pelo caminho legítimo. `nivelDeEntrada`/`noDeEntrada` saíram junto.

## Como o usuário trabalha

- **Não commite sem o aval dele.** O fluxo é: implementar → verificar →
  apresentar o que testar → ele testa no app → ele pede o commit.
- **Separe código de dados nos commits.** Ele edita o catálogo pelo app enquanto
  você trabalha; `git add -A` varre a edição dele junto com o seu código e suja
  o diff. Um commit para código, outro para `catalogo.csv` + `graph.json`.
- **Verifique no navegador**, não só nos testes. Chrome headless via CDP tem
  sido usado para abrir a página, simular gestos (inclusive arrastar com
  `Input.dispatchMouseEvent`) e tirar screenshot; vários bugs só apareceram
  assim. Atenção à altura real do viewport ao escolher coordenadas.
- **Ele edita o catálogo enquanto você trabalha.** Nunca use `git checkout` em
  `catalogo.csv`/`niveis.csv`; faça backup por cópia e restaure por cópia. E
  **nunca fixe contagens do catálogo em teste** — use invariantes, senão a suíte
  quebra a cada cadastro dele.
- **Nunca edite os CSVs à mão.** Grave pelo serializador (ou pela API
  `/api/catalogo`, que é o caminho do próprio app): um teste trava o
  `catalogo.csv` byte a byte contra `serializarCatalogo`.
- **Quando um teste trava a decisão antiga, ele sai** — não seja adaptado para
  continuar passando. Mas repare se o teste é mesmo sobre a regra que mudou:
  vários testes de layout usavam o foco só como meio de montar uma coluna cheia.
- **Calibre a orquestração**: mudança pequena é edição direta; feature média é um
  agente; só trabalho grande e paralelizável justifica vários agentes.
- Ele testa em português e o código/documentação seguem em pt-BR.

## Pendências registradas

- **Ingestão do Databricks / Unity Catalog** — especificação completa em
  [`ingestao-databricks.md`](ingestao-databricks.md), com as decisões já tomadas
  com o usuário (UC em uso; coleta começa por notebook porque o acesso hoje é só
  pela interface web; a primeira fase importa componentes a partir da linhagem,
  com ele escolhendo quais e em que nível; jobs ficam fora do `catalogo.csv`).
  É o próximo trabalho grande.
- **O mapa abre cortado nas pontas** com seis colunas cheias: a primeira some
  atrás da legenda e a última passa da borda direita, e só se vê tudo dando zoom
  out. O `zoomToFit` roda (`Graph.tsx`, efeito de `fixedLayout`) mas não dá conta
  da largura. Já acontecia com o catálogo menor — não é regressão do foco.
- **A legenda cobre o painel de filtros** quando aberta. O usuário sabe e disse
  que trataria "a legenda inteira" num passo separado, incluindo reposicionamento.
- `FUTURO.md` — itens fora do MVP.
- `ligacao-por-clique.md` — criar ligações arrastando de um componente ao outro.
  As decisões pendentes ali são de produto (qual relação o gesto cria, direção,
  desfazer).
- Confirmação de exclusão por um segundo Delete foi **descartada** (a
  auto-repetição do teclado excluiria sem o usuário ler o aviso).

## Distribuição

`npm run pacote` gera `entregas/mapa-dados-atacado-demo.zip`: o HTML autocontido
mais uma **cópia** dos CSVs, para a pessoa abrir por duplo clique e editar sem
tocar no catálogo do repositório. Regere sempre que o catálogo mudar — o HTML
carrega os dados embutidos no momento da geração.

Atenção ao distribuir: um `catalogo.csv` com coluna nova aberto num **pacote
antigo** perde a coluna silenciosamente na primeira gravação, porque o parse
monta a linha campo a campo. Toda mudança de coluna obriga a reemitir o pacote e
avisar quem tem cópia.
