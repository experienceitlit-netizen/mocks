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
  isolar — e ela foi removida no commit `c005a33`. Hoje a abertura do app é
  **sem foco**, que já significa inventário pelo caminho legítimo.
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

Código e testes verdes: **425 testes**, `tsc` limpo, `npm run data` com 0 avisos.
O worktree tem alterações **não commitadas** (só dados): `catalogo.csv`,
`niveis.csv`, `src/data/graph.json` — e `backup/` untracked, que não está no
`.gitignore`.

### O catálogo é a ARQUITETURA DO RAR NO DATA CLOUD, não dado de exemplo

Em 2026-08-31 o usuário substituiu o mapa de exemplo pela arquitetura real que
ele está desenhando: o RAR do Atacado do sistema de origem até o consumo no
Salesforce Data Cloud. **45 componentes em 10 camadas**, 55 arestas:

Consumidores (5) · Identidade (3) · DMO (4) · DLO (4) · Transporte (4) ·
Gold (3) · Silver (6) · Bronze (6) · Fonte (4) · Origem (6)

Ele entregou isso em duas rodadas — primeiro um JSON parcial (3 nós), depois a
planilha inteira em texto. A conversão em si **não mudou uma linha de código**,
a pedido explícito dele; a única mudança de código do dia foi a seta da aresta,
que veio depois (ver abaixo).

- O mapa de exemplo anterior está no commit `4ca5e3b` e em
  `backup/catalogo.20260831-010423.csv` + `backup/niveis.20260831-010423.csv`
  (cópia, nunca `git checkout`).
- O script de conversão vive fora do repo, no scratchpad da sessão. Ele declara
  cada relação UMA vez, e dela saem a coluna do CSV e a linha do corpo do balão
  — foi o que impediu os dois de divergirem. Se for reconverter, refaça igual.

### Como as relações foram registradas

Descoberta que vale reusar: **`descricao` é texto puro** (parágrafo de resumo no
balão) e **`observacoes` é o corpo markdown** (`node.corpo`), onde
`[[wikilink]]` vira botão que navega o grafo. Então cada componente ganhou:

```
## Relações

- transforma de [[fato_capital]] — denominador

## Detalhes

- Grão: grupo econômico × mês
```

O wikilink resolve **por NOME** (`idByName`), não por id — nome errado vira link
quebrado silencioso. Um bloco só vira lista se TODAS as linhas começam com `- `,
e um título precisa ser um bloco de uma linha só.

É o que salvou o que o modelo não tem coluna para guardar: os verbos reais
(`ingere`, `transforma`, `transporta`, `mapeia`, `relaciona`, `le_direto`), os
mapeamentos campo a campo do DMO, grão, colunas, modo/cópia/frequência do
transporte e os critérios do ruleset de identidade.

### A seta da aresta

A seta sempre existiu em `Graph.tsx`, mas `linkDirectionalArrowRelPos={1}` punha
a ponta **no centro do nó alvo**, onde o glifo a esconde — na prática o mapa
parecia não ter seta nenhuma. Agora o comprimento é 7 (era 3.5) e a posição é
uma função por aresta, que recua o raio do alvo NA DIREÇÃO de quem aponta mais
uma folga, com o mesmo `raioNaDirecao` que o canvas usa para desenhar a borda.

Não pode ser constante: o raio varia por nó (grau + ajuste da sessão), o losango
do produto de dados não tem raio constante, e aresta que pula colunas é mais
longa. A legenda ganhou a linha "a seta aponta para o componente consumido".

### Decisões da conversão (não refaça sem motivo)

- **Direção**: a planilha descreve fluxo (produtor → consumidor); o modelo é o
  consumidor que declara o produtor. Toda aresta foi invertida.
- **"Ingestion API bulk" virou dois componentes** (`— rar_grupo` e
  `— rar_grupo_atual`). Um nó só fundiria os dois fluxos e criaria um caminho
  falso de `gold.rar_grupo` até `rar_grupo_atual__dll`.
- **"Produto de dados corporativo" é um componente só** para GDAD, ESTATAG e
  PSDC, que declaram o mesmo mecanismo.
- **"a confirmar" virou nó de verdade** na camada Fonte, com o nome literal da
  célula: é o buraco da ingestão do Capital Regulatório aparecendo no mapa.
- **`Opportunity` não virou nó** — está fora do Data Cloud e não é componente
  catalogado; a leitura direta da ação Agentforce ficou no corpo dela.
- Duas arestas furam a cadeia de propósito, a pedido do usuário: o **Conector
  CRM** sai direto da origem Salesforce CRM, e o **dashboard Tableau** lê
  `gold.rar_grupo` sem passar pelo Data Cloud.

### O que a arquitetura real expôs de lacuna no modelo

Quatro coisas que o dado de verdade pediu e o modelo não tem. Nenhuma foi
implementada:

1. **Débito herdado não tem eixo.** O usuário pediu "marque no visual" para o
   débito que vem de `raw_custo_capital`. Só existe `debito: sim/nao/avaliar`,
   então `dim_custo_capital` e `Rentabilidade Atacado` entraram como
   **"a avaliar"** com a explicação no corpo. Fica visível com o rótulo errado.
2. **Só há dois tipos de aresta.** Os seis verbos reais viraram todos `consome`;
   sobrevivem apenas como texto no corpo.
3. **`associacoes` é rotulada "vem de"**, que é errado para a relação
   `Rentabilidade_Grupo_Mensal.cd_grupo → Account.cd_grupo`. São as 3 arestas
   de relação (as outras 52 são `consome`).
4. **Não dá para saber se um componente chega ao consumo** (ver Pendências).

### A restrição que os TESTES impõem ao catálogo vivo

Isto custou tempo e vai voltar: **o catálogo real só pode usar 10 slugs de
nível** — os 7 built-in mais `gold`, `silver` e `broze`. Slug novo derruba 13
testes.

A causa é `catalog-store-local.test.ts`, que importa o `catalogo.csv` **real**
(`?raw`) mas o casa com uma fixture de níveis congelada em modo legado. E
`niveis.test.ts` exige, por outro lado, que todo nível NÃO built-in do arquivo
tenha pelo menos um nó.

O contorno em uso: **renomear built-ins pelo `slug`**, o mesmo mecanismo que faz
"Jornada" ser o `dominio`. Hoje cinco níveis fazem isso —
Consumidores=`fonte-secundaria`, Identidade=`raiz`, DMO=`dominio`, DLO=`final`,
Transporte=`primario`. Funciona, mas **os 10 slugs estão ocupados: não cabe mais
uma camada**, e o `niveis.csv` ficou difícil de ler. O conserto de verdade é uma
linha na fixture daquele teste; não foi feito porque o usuário pediu para não
mexer em código.

## Como o usuário trabalha

- **Não commite sem o aval dele.** O fluxo é: implementar → verificar →
  apresentar o que testar → ele testa no app → ele pede o commit.
- **Separe código de dados nos commits.** Ele edita o catálogo pelo app enquanto
  você trabalha; `git add -A` varre a edição dele junto com o seu código e suja
  o diff. Um commit para código, outro para `catalogo.csv` + `graph.json`.
- **Verifique no navegador**, não só nos testes. Chrome headless via CDP tem
  sido usado para abrir a página, simular gestos (inclusive arrastar com
  `Input.dispatchMouseEvent`) e tirar screenshot; vários bugs só apareceram
  assim. Três armadilhas que já custaram tentativas:
  - **A altura real do viewport não é a que você pediu.** Com
    `--window-size=1600,1000` o screenshot sai com 861px de altura. Tire uma
    captura primeiro e leia as coordenadas nela.
  - **O rótulo não é o nó.** Mirar no texto acerta a aresta que passa por trás;
    o alvo é o glifo, uns 20px acima.
  - **Para abrir o balão**: `mouseMoved` na posição do nó (é o mousemove que faz
    o force-graph saber qual nó está sob o cursor), esperar, e só então o botão
    direito de verdade (`Input.dispatchMouseEvent` press+release). Um
    `new MouseEvent('contextmenu')` sintético via `Runtime.evaluate` NÃO
    dispara o `onNodeRightClick`.
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
- **Você é ORQUESTRADOR, não executor** — palavras dele: *"pra tarefas de tasks
  sempre deve spawnar o agente, pra perguntas é aqui, vc é orquestrador"*. Seu
  trabalho é recortar a tarefa, escrever o briefing, conferir o que voltou e
  reportar.
- **Tarefa vai para um agente** (regra dele, 2026-08-31): implementar, explorar
  o código, converter dados, revisar, investigar bug — delegue, mesmo quando
  parecer pequena. **Conversa não**: pergunta sobre o modelo, discussão de
  desenho, relatório de estado e decisão a tomar com ele são respondidos direto.
  A quantidade é proporcional ao trabalho, não ao rito: um agente resolve a
  maioria, vários só quando as frentes são de fato independentes.
  Isto revisa a regra anterior (2026-08-25), que veio de ele reclamar do gasto
  de dois agentes paralelos mais integração para adicionar um nó. O que o
  incomodou lá foi o rito desproporcional, não o agente — e aqui, o contrário:
  eu fazendo a tarefa inteira na mão.
- Ele testa em português e o código/documentação seguem em pt-BR.

## Pendências registradas

- **Ingestão do Databricks / Unity Catalog** — especificação completa em
  [`ingestao-databricks.md`](ingestao-databricks.md), com as decisões já tomadas
  com o usuário (UC em uso; coleta começa por notebook porque o acesso hoje é só
  pela interface web; a primeira fase importa componentes a partir da linhagem,
  com ele escolhendo quais e em que nível; jobs ficam fora do `catalogo.csv`).
  É o próximo trabalho grande.
- **Saber se um componente chega ao consumo.** Foi a pergunta que abriu o dia
  30/08 e não tem resposta no app: não há indicador, filtro nem coluna para
  "este componente é consumido, transitivamente, por alguma jornada/consumidor".
  Focar num consumidor por vez responde (`buildLineageTree` devolve exatamente o
  fecho montante dele), mas é manual e por eliminação; e o **hover não serve** —
  o `chainOf` é fecho NÃO direcionado, e num grafo conexo ele acende tudo.
  Proposta apresentada e não implementada: linha "Consumido por: …" no balão,
  coluna na Tabela e chip de filtro ao lado de "sem owner" — com o nível-alvo
  vindo do `niveis.csv`, nunca com o slug cravado no código (isso reintroduziria
  o tratamento especial de nível removido em `c005a33`).
- **Verbo por referência (`envia`) — desenhado, não implementado.** O usuário
  quer poder representar um processo/transporte no meio de duas tabelas, com a
  aresta rotulada "Envia" em vez de "Consome". O desenho proposto: vocabulário
  fixo de verbos (como `TIPOS_COMPONENTE`), sintaxe `envia:alvo` na própria
  célula do `consome`, referência sem prefixo continua valendo `consome`. Como
  `CatalogoRow.consome` continua `string[]`, o serializador e o teste de
  round-trip byte a byte não mudam; só `buildGraph` e `normalizarReferencias`
  precisam separar verbo e alvo.
  **A decisão que falta é dele**: `envia` aponta para o lado CONTRÁRIO de
  `consome`, e o `buildLineage` percorre as arestas de saída como montante — um
  `envia` ingênuo faria a linhagem dizer que o produto do processo é insumo
  dele. A saída proposta é dar um *sentido* a cada verbo (a seta continua sempre
  apontando para o alvo declarado; só a travessia lê o `envia` ao contrário).
- **A fixture de níveis de `catalog-store-local.test.ts` prende o catálogo
  vivo** a 10 slugs, e os 10 já estão ocupados: não cabe mais uma camada. Uma
  linha naquela fixture resolve. Ver "A restrição que os TESTES impõem" acima.
- **O pacote de demonstração está desatualizado**: `entregas/` ainda tem o mapa
  de exemplo. `npm run pacote` regera com a arquitetura nova, quando ele pedir.
- **O mapa abre cortado nas pontas** com seis colunas cheias: a primeira some
  atrás da legenda e a última passa da borda direita, e só se vê tudo dando zoom
  out. O `zoomToFit` roda (`Graph.tsx`, efeito de `fixedLayout`) mas não dá conta
  da largura. Já acontecia com o catálogo menor — não é regressão do foco, e
  com as 10 colunas de hoje ficou pior: a legenda esconde Consumidores,
  Identidade e DMO inteiras.
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
