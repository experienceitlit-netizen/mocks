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
- **Nada é inferido.** Todo nó vem de uma linha do catálogo; toda aresta vem da
  coluna `consome`, e o VERBO dela vem do prefixo da própria célula. O build não
  deriva nós de campos nem cria ligações automáticas — isso já existiu e foi
  removido a pedido. Uma regra que pintava de âmbar quem tivesse "legado" ou
  "planilha" no nome também caiu pelo mesmo motivo: o débito já é declarado na
  coluna `debito`, e adivinhá-lo pelo texto criava uma segunda fonte de verdade.
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
  ou centro de custo; a PONTA DA SETA diz se o verbo tem direção declarada. O
  **tamanho** não é eixo de dado: é grau de conexões mais o ajuste manual da
  sessão.
- **UMA coluna de relação, e ela aponta para o ALVO DECLARADO** (2026-08-31). A
  linha diz o que ela consome/envia/acessa; o outro lado da relação é a MESMA
  aresta lida de trás para frente, derivada, sem coluna própria. A segunda
  coluna (`associacoes`, aresta "vem de") saiu: dizia a mesma coisa de um jeito
  ambíguo. Ver "A fusão das relações" abaixo.
- **O VERBO é declarado na referência, nunca derivado da camada** (2026-09-01).
  A proposta de inferir o verbo do par de níveis foi recusada por ele — *"vai
  ficar engessado"* — e o contraexemplo é concreto: um job `acessa` uma tabela e
  `envia` para outra **na mesma linha**. Ver "O verbo por referência" abaixo.
- **O CSV precisa continuar legível** para quem abre na planilha. Foi o que
  descartou identificadores opacos (uuid) quando surgiu a necessidade de chave
  estável.

## Como os dados vivem

`catalogo.csv` (uma linha por componente), `niveis.csv` (as camadas) e
`verbos.csv` (o vocabulário das relações) na raiz do projeto →
`scripts/graph-lib.ts` (funções **puras**, sem I/O, zero imports) →
`src/data/graph.json` → front-end. O `graph-lib` roda tanto no Node (CLI
`npm run data`) quanto no navegador — é o que permite o pacote HTML gerar o
grafo sozinho, e é por isso que ele não pode ganhar nenhum `import`.

**O `verbos.csv` é OPCIONAL e hoje não existe no repositório.** Ausente ou
vazio = os cinco verbos embutidos, que é o estado normal; ele só nasce no
primeiro `POST /api/verbos`, isto é, na primeira gravação da tela "⇢ Verbos".
Presente, ele é a lista **completa**: verbo embutido que não estiver listado
está removido (menos o `consome`, que não pode sair).

Edição pelo app, em três modos escolhidos por detecção automática:

| Modo | Quando | Grava em |
| --- | --- | --- |
| dev server | `npm run dev` | os CSVs do projeto, via `/api/catalogo`, `/api/niveis`, `/api/verbos` |
| arquivo local | pacote HTML + "Abrir catálogo" | os CSVs da pasta escolhida |
| somente leitura | sem os dois | nada |

## Estado ao salvar este documento

Código e testes verdes: **627 testes em 26 arquivos**, `tsc` limpo, `npm run
data` com 0 avisos (**49 nós, 59 arestas, 11 níveis**). Worktree **sem nenhuma
alteração de código ou de dado pendente** — tudo do dia está commitado; o único
arquivo sujo é este documento. Untracked: `backup/` e `docs/ajustes.md` (as duas
queixas do usuário que abriram o dia; as duas foram atendidas), nenhum dos dois
no `.gitignore`. Untracked também, mas **fora do projeto** e sem relação com
ele: `grafo-execucao.md` na raiz do repositório, um rascunho de post do usuário.

Os três commits de 2026-09-01, nesta ordem:

- `0d0ae90` **feat(relações): verbo por referência, com vocabulário editável**
- `088488d` **chore(dados): camada Jobs (Pipelines) e as primeiras relações com
  verbo** (cadastrado pelo usuário no app)
- `cb17456` **feat(destaque): só o primeiro nível, e o clique acumula um rastro**

Distribuição das 59 arestas por verbo: `consome` 53, `envia` 3, `associado` 2,
`acessa` 1.

### O catálogo é a ARQUITETURA DO RAR NO DATA CLOUD, não dado de exemplo

Em 2026-08-31 o usuário substituiu o mapa de exemplo pela arquitetura real que
ele está desenhando: o RAR do Atacado do sistema de origem até o consumo no
Salesforce Data Cloud. Desde então ele vem cadastrando pelo app. Hoje são
**49 componentes em 11 camadas**, 59 arestas:

Consumidores (5) · Identidade (3) · DMO (4) · DLO (4) · Transporte (4) ·
Gold (3) · Silver (6) · Bronze (7) · **Jobs (Pipelines) (2)** · Fonte (4) ·
Origem (7)

- **Jobs (Pipelines)** é a camada nova (`088488d`), criada por ele no app. É a
  primeira que usa um slug fora dos dez de antes (`jobs-pipelines`) — o que só
  foi possível porque a trava dos testes caiu no mesmo dia (ver abaixo). Os dois
  jobs estão com nome de rascunho ("Job 001 - JJ", "Job 002 - aaad"): não
  invente semântica em cima deles.
- O mapa de exemplo anterior está no commit `4ca5e3b` e em
  `backup/catalogo.20260831-010423.csv` + `backup/niveis.20260831-010423.csv`
  (cópia, nunca `git checkout`).
- O script de conversão vive fora do repo, no scratchpad da sessão. Ele declara
  cada relação UMA vez, e dela saem a coluna do CSV e a linha do corpo do balão
  — foi o que impediu os dois de divergirem. Se for reconverter, refaça igual.

### Como as relações foram registradas (e onde isso já azedou)

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

Isso salvou o que o modelo não tinha coluna para guardar: os verbos reais, os
mapeamentos campo a campo do DMO, grão, colunas, modo/cópia/frequência do
transporte e os critérios do ruleset de identidade.

**Mas o bloco `## Relações` virou segunda fonte de verdade, e já divergiu.** O
`dim_cliente` declara três referências na coluna (`raw-psdc | raw-account |
bureau-neoway`) e lista **dois** "vem de" no corpo — o terceiro entrou pelo app,
que grava a coluna e não mexe no markdown. Agora que o verbo existe na própria
coluna, o corpo deveria guardar só o que a coluna NÃO guarda (grão, colunas,
mapeamento, critérios). Está nas Pendências.

### A seta, a ponta e o verbo escrito sobre a aresta

A seta sempre existiu em `Graph.tsx`, mas `linkDirectionalArrowRelPos={1}` punha
a ponta **no centro do nó alvo**, onde o glifo a esconde — na prática o mapa
parecia não ter seta nenhuma. Hoje o comprimento é 7 (era 3.5) e a posição é uma
função por aresta, que recua o raio do alvo NA DIREÇÃO de quem aponta mais uma
folga, com o mesmo `raioNaDirecao` que o canvas usa para desenhar a borda. Não
pode ser constante: o raio varia por nó (grau + ajuste da sessão), o losango do
produto de dados não tem raio constante, e aresta que pula colunas é mais longa.

Com os verbos, **o comprimento da ponta também virou função por aresta**
(`setaComprimento`): 0 apaga a seta e a aresta vira traço puro. É o eixo `seta`
do verbo. A legenda hoje diz *"a seta aponta para o componente declarado"* e
*"relação sem direção não tem ponta"* — a frase antiga ("componente consumido")
saiu, porque `envia` aponta para o alvo declarado e não para um consumo.

**O VERBO ESCRITO SOBRE A ARESTA**, e a armadilha que vai voltar: ele é
desenhado em `onRenderFramePost`, **não** em `linkCanvasObject`. A lib pinta na
ordem arestas → setas → NÓS, e o desenho por aresta (mesmo em modo `'after'`)
entra no primeiro passo: o rótulo saía por baixo dos nós e, pior, por baixo do
NOME deles, que o canvas escreve logo abaixo de cada nó — numa aresta curta o
meio da linha cai justamente nessa faixa e virava um borrão ilegível.
`onRenderFramePost` roda depois do quadro inteiro, nas mesmas coordenadas de
grafo do `onRenderFramePre` das faixas, e é o único ponto em que o rótulo fica
por cima de tudo. **De quebra, o desenho nativo da aresta fica intocado** —
linha, curvatura, cor, espessura e a ponta por aresta continuam como estavam,
porque nada disso entra no passo das arestas. Se alguém "consertar" isso movendo
para `linkCanvasObject`, os dois problemas voltam juntos.

Escopo do rótulo: só as arestas em que uma ÂNCORA do destaque é uma das pontas
(o primeiro nível, `linkTouchesActive`). Nada de fecho transitivo. E aqui todo
verbo aparece, `consome` inclusive — ao contrário do balão e da Tabela, onde o
padrão é omitido: lá ele estaria em toda linha e viraria ruído; aqui existe em
meia dúzia de arestas por vez, e omitir o mais comum leria como falta.

### Decisões da conversão (não refaça sem motivo)

- **Direção**: a planilha descreve fluxo (produtor → consumidor); o modelo é o
  consumidor que declara o produtor. Toda aresta foi invertida.
- **"Ingestion API bulk" virou dois componentes** (`— rar_grupo` e
  `— rar_grupo_atual`). Um nó só fundiria os dois fluxos e criaria um caminho
  falso de `gold.rar_grupo` até `rar_grupo_atual__dll`.
- **"Produto de dados corporativo" é um componente só** para GDAD, ESTATAG e
  PSDC, que declaram o mesmo mecanismo.
- ~~**"a confirmar" virou nó de verdade**~~ — **o usuário REMOVEU esse nó** em
  `088488d`. O buraco do Capital Regulatório continua no mapa, mas de outra
  forma: `base_capital_regulatorio` ficou **isolado** (ninguém o consome) e
  `raw_capital_reg` ficou **sem montante**. Não é erro de build (0 avisos) — é
  o dado dizendo que a ligação não é conhecida.
- **`Opportunity` não virou nó** — está fora do Data Cloud e não é componente
  catalogado; a leitura direta da ação Agentforce ficou no corpo dela.
- Duas arestas furam a cadeia de propósito, a pedido do usuário: o **Conector
  CRM** sai direto da origem Salesforce CRM, e o **dashboard Tableau** lê
  `gold.rar_grupo` sem passar pelo Data Cloud.

### O que a arquitetura real expôs de lacuna no modelo

Quatro coisas que o dado de verdade pediu. Duas já foram atendidas:

1. **Débito herdado não tem eixo.** O usuário pediu "marque no visual" para o
   débito que vem de `raw_custo_capital`. Só existe `debito: sim/nao/avaliar`,
   então `dim_custo_capital` e `Rentabilidade Atacado` entraram como
   **"a avaliar"** com a explicação no corpo. Fica visível com o rótulo errado.
   **Continua aberto.**
2. ~~**Só há dois tipos de aresta.**~~ — **RESOLVIDO em 2026-09-01**: o verbo por
   referência (`0d0ae90`). Ver a seção abaixo.
3. ~~**`associacoes` é rotulada "vem de"**~~ — **RESOLVIDO em 2026-08-31**: a
   coluna saiu e as arestas viraram `consome`.
4. **Não dá para saber se um componente chega ao consumo** (ver Pendências).
   **Continua aberto.**

## O verbo por referência (2026-09-01, `0d0ae90`)

O que era "desenhado, não implementado" está feito. A coluna `consome` aceita
`verbo:alvo`; **referência sem prefixo continua valendo `consome`**, e é isso
que mantém todo catálogo já escrito valendo o que valia (o teste de round-trip
byte a byte do `catalogo.csv` não mudou — `formatarReferencia` omite o prefixo
quando o verbo é o padrão).

**Prefixo fora do vocabulário não é assumido nem descartado**: a célula inteira
vira o nome do alvo (fantasma com dois-pontos no nome, feio de propósito) e sai
um aviso citando o prefixo. Cadastrar o verbo depois conserta retroativamente.

### Dois eixos INDEPENDENTES por verbo

Esta é a parte que se perde se não estiver escrita:

| eixo | quem lê | pergunta |
| --- | --- | --- |
| `sentido` (`montante`/`jusante`/`ambos`/`nenhum`) | a travessia da linhagem | por onde a linhagem passa? |
| `seta` (`sim`/`nao`) | só o desenho | a aresta desenha ponta? |

**"Sem ponta" NÃO é "fora da linhagem".** `associado` tem `seta: nao` e
`sentido: ambos` — não tem direção declarada e mesmo assim carrega o dado. A
ponta, quando existe, aponta sempre para o ALVO DECLARADO na linha; quem lê o
`sentido` é a travessia, nunca o desenho.

Os cinco embutidos (`VERBOS_BUILTIN` em `graph-lib.ts`, nesta ordem, que é a do
`<select>`):

| slug | título | sentido | seta |
| --- | --- | --- | --- |
| `consome` | Consome | montante | sim |
| `acessa` | Acessa | montante | sim |
| `envia` | Envia | **jusante** | sim |
| `associado` | Associado | **ambos** | **não** |
| `relaciona` | Relaciona | **nenhum** | **não** |

`consome` **não pode ser removido** — é o significado de toda célula sem
prefixo, e sem ele o catálogo inteiro ficaria sem verbo (`podeRemoverVerbo` em
`verbos-form.ts`; a validação também recusa no `POST /api/verbos`).

### Por que o vocabulário é dado, e não código

A alternativa avaliada era derivar o verbo do par de camadas. O usuário recusou
— *"vai ficar engessado"* — e o contraexemplo mata a ideia: um job `acessa` uma
tabela e `envia` para outra **na mesma linha**, então o par de camadas não
determina nada. Daí o `verbos.csv` e a tela **"⇢ Verbos"** (`VerbosModal.tsx`,
só em modo edição), com `slug` como chave estável: renomear "Envia" para "Manda"
não reescreve nenhuma célula do `catalogo.csv`.

### Onde o verbo aparece

- **Formulário** (`CatalogForm.tsx`): um `<select>` de verbo por chip do campo
  Consome/Upstream.
- **Balão** (`NodeBalloon.tsx` + `ligacoes-por-verbo.ts`): as ligações agrupam
  **por verbo**, uma seção por verbo, na ordem do vocabulário (não na ordem em
  que as arestas apareceram — essa dançaria a cada navegação). As duas seções
  fixas **"Consome →" e "← Consumido por" NÃO EXISTEM MAIS**. O título da seção
  é `Verbo →` no sentido direto e `↩ Verbo` quando é a mesma aresta lida do
  outro lado; a assimetria dos glifos (`↩` na frente × `→` no fim) é de
  propósito, para as duas seções de um mesmo verbo nunca terem a mesma silhueta.
  Não há rótulo por item: o cabeçalho já vale para a lista inteira.
- **Mapa**: o rótulo sobre a aresta e a ponta condicional (acima).
- **Linhagem** (`lineage.ts`): `indiceMontante` é a **única** leitura do
  `sentido` no módulo — a árvore do balão e o alcance do mapa saem dali, e assim
  não existem duas respostas para "por onde a linhagem anda". `envia` sobe ao
  contrário; `relaciona` fica fora da árvore e do `chainOf`, mas a aresta
  continua desenhada.

### O alcance do foco (e por que é uma escada)

`FocusBar.tsx`, controle de três posições, na URL como `?alcance=` (só na vista
Níveis; na vista Força a URL leva `?prof=`):

- **Montante** — a cadeia de que o componente depende, recursiva. O
  comportamento de sempre, sem uma vírgula de diferença.
- **+ Vizinhos** — o montante inteiro MAIS todo vizinho de primeiro nível, em
  qualquer sentido, inclusive pelo verbo de sentido `nenhum`.
- **Dois sentidos** — montante e jusante, os dois recursivos.

**As três são uma ESCADA: cada uma contém a anterior**, e isso é decisão, não
descuido. "Dois sentidos" puro não percorreria o verbo de sentido `nenhum`, e um
controle de *alcance* que **some com um vizinho ao ser aumentado** não se
explica para ninguém. Por isso `ambos` também traz os vizinhos diretos.

Duas separações que valem lembrar: o default da FUNÇÃO `buildLineage` é
`montante` (para nenhuma chamada antiga mudar de resultado ao ganhar o
parâmetro) e o da TELA é `vizinhos` (`ALCANCE_INICIAL`), que é o que responde à
queixa "só aparecem as de consumo". E a árvore do balão (`lineage.root`) é
sempre a montante pura, em qualquer alcance — o alcance é do mapa.

### Chips por tipo de ligação

Também na `FocusBar`, um chip por verbo, vindos do **vocabulário** (bloco
`verbos` do `graph.json`), nunca de uma lista no código: verbo recém-cadastrado
já nasce com chip. O estado guardado é o dos **ocultos**, não o dos visíveis —
guardar os visíveis congelaria a tela no vocabulário do momento em que ela
montou.

**Precedência: chip > destaque > toggle** (`arestas-visiveis.ts`, uma função
pura de três linhas com a explicação inteira em cima). O chip vale sempre,
inclusive sobre o nó em destaque — se fosse ao contrário, o hover ressuscitaria
justamente a aresta que o usuário acabou de apagar, e o chip pareceria não
funcionar. Destaque e toggle nunca são consultados no mesmo instante: o toggle é
preferência de repouso, o destaque é gesto em curso.

## O destaque de primeiro nível e o rastro (2026-09-01, `cb17456`)

`vizinhanca-destacada.ts` + `arestas-visiveis.ts`, ambos puros, com o porquê
inteiro nos comentários de topo. Resumo do que custou tentativa:

- **Com destaque ativo, só as arestas do primeiro nível são desenhadas.** Nos
  NÓS a regra esmaece; nas ARESTAS ela apaga de verdade. Aresta esmaecida vira
  risco cinza ilegível; nó apagado é perda de contexto.
- **NÓS NUNCA SOMEM.** A primeira tentativa ocultava o segundo nível e foi
  corrigida a pedido dele: *"não era pra sumir os componentes, somente as
  setas/ligações e manter as do primeiro nível"*. Com nós sumindo, o mapa
  piscava ao cruzar o vazio, um nó de grau baixo esvaziava a tela, e não dava
  nem para mirar no vizinho seguinte porque ele não estava mais lá.
- **O clique ACUMULA**: `pinnedId` virou `pinnedIds` (conjunto). Cada clique
  acrescenta a vizinhança daquele nó ao que já está aceso — é o que deixa
  perseguir a trilha inteira sem perder o rastro. Segundo clique no mesmo nó
  tira aquela vizinhança (o rastro é corrigível). **Esc, clique no fundo e o `✕`
  do chip `Rastro · N componentes` zeram tudo. O duplo clique (foco) zera**,
  porque um rastro montado na vista anterior não diz nada na nova. **O balão não
  zera**, porque ler os detalhes é parte de percorrer a trilha.
- **O primeiro nível é de CADA âncora, não do conjunto**: duas âncoras vizinhas
  não somam alcance. É o que impede o rastro de virar, depois de alguns cliques,
  um fecho transitivo que acende o grafo inteiro.
- **Destaque e filtro se separaram.** `dimmedIds` é **só filtro** agora. Antes
  os dois viviam no mesmo conjunto e o hover ANULAVA o filtro ativo enquanto
  durasse — um conjunto só não sabe dizer se um id está lá por não interessar ou
  por estar longe. Separados, convivem: com "Somente sem owner" ligado, um
  vizinho que TEM owner aparece esmaecido dentro da vizinhança acesa.
- **`umSoFixado`**: o atalho de exclusão só age com **um** componente no rastro.
  Com seis fixados não existe "o componente em evidência", e devolver o último
  apagaria uma linha do catálogo pela ordem em que a trilha foi montada.

### Correção: o `chainOf` não é fecho não direcionado

Versões anteriores deste documento diziam que o `chainOf` era "fecho NÃO
direcionado" e que "num grafo conexo ele acende tudo". **Está errado.** São
**duas travessias DIRIGIDAS que não se misturam no meio do caminho**: a ida a
partir do nó e a volta a partir dele, sobre as arestas da vista. Resultado =
ancestrais ∪ descendentes, nunca o componente conexo — quem só é irmão não
acende. O teste `lineage-alcance.test.ts` (*"o chainOf acompanha o alcance sem
regra própria"*) trava exatamente essa diferença. Um comentário dentro do
próprio `lineage.ts` ainda repete a expressão "fecho NÃO direcionado"; o código
ao lado dele é que manda.

E o `chainOf` está **fora de uso na tela** desde `cb17456` — quem percorre a
cadeia hoje é o rastro. Ele continua exportado e testado porque responde à
pergunta que o mapa ainda não responde ("até onde este componente chega", ver
Pendências).

## Testes não podem depender do CONTEÚDO do catálogo vivo

Isto substitui a antiga seção "A restrição que os TESTES impõem ao catálogo
vivo", e é a lição que ela virou. **A trava dos 10 slugs de nível morreu** — a
camada `jobs-pipelines` entrou sem ninguém tocar em teste nenhum.

O que causava aquilo: fixtures escritas À MÃO com a lista de slugs (e depois de
verbos) que o catálogo real podia usar. Como o usuário cria camada e verbo pelo
app **enquanto se trabalha**, toda criação derrubava a suíte. Acrescentar mais um
slug à mão só adiava o estouro — já tinha sido feito uma vez, com "processo", e
a camada seguinte nasceu com outro nome.

**O padrão adotado: a fixture é DERIVADA do próprio `catalogo.csv`.**

- `catalog-store-local.test.ts` importa o `catalogo.csv` real (`?raw`) e monta o
  `niveis.csv` da fixture a partir dos slugs que a coluna `nivel` **realmente
  usa**, mais os built-in; título, ordem e cor ficam sintéticos e
  determinísticos, imunes ao que o usuário edita. Não usa o `niveis.csv` de
  verdade de propósito: ele é dado vivo de outra natureza, e o teste quebraria a
  cada troca de COR. O `verbos.csv` da fixture segue a mesma regra, varrendo os
  prefixos das células (e só conta como prefixo aquele cujo resto é um id do
  próprio arquivo, senão um componente chamado "abc:xyz" viraria vocabulário).
- **O mesmo acoplamento existia em `scripts/niveis.test.ts` e
  `scripts/catalogo-serde.test.ts`**: eles validavam o catálogo REAL sem carregar
  o `verbos.csv`, então um verbo cadastrado pelo usuário viraria "prefixo
  desconhecido" e o teste acusaria erro no catálogo por causa da própria
  fixture. Os dois passaram a fazer o mesmo que o build: ler o `verbos.csv` se
  existir, senão os embutidos.

A regra que sobrou, e que vale para todo teste novo: **contas e listas sobre o
catálogo vivo são invariantes** (ordenação crescente, slug único, todo nó com
nível existente, zero fantasma), nunca conteúdo.

## A fusão das relações: uma coluna só (2026-08-31)

Histórico que explica o formato de hoje. Pedido do usuário: *"o que faz sentido
hoje é apontar o upstream, ou seja, quem o componente consome — isso já relaciona
e associa upstream e downstream"*. A coluna `associacoes` e a aresta "vem de"
saíram do modelo inteiro. O `catalogo.csv` tem **13 colunas** desde então.

- **Arquivo antigo não perde dado.** `associacoes` entrou em `COLUNAS_OBSOLETAS`,
  mas é caso diferente das outras três (`origem`, `fonte_sistema`,
  `fontes_secundarias`, cujo conteúdo é ignorado): o dela é **dobrado dentro de
  `consome` na leitura**, com aviso, e a próxima gravação escreve o arquivo já
  sem a coluna. É `mesclarAssociacoes` em `graph-lib.ts`, chamada tanto pelo
  `parseCatalogo` quanto pelo `parseCatalogoRows` — os dois, senão uma gravação
  descartaria o que a leitura mostrou.
- **Referência quebrada vira nó fantasma**, tratamento único: o buraco aparece
  no mapa em vez de sumir dele.
- **O toggle não sumiu, o rótulo mudou.** `assocOn` nunca foi a coluna: é a
  visibilidade das ARESTAS. Virou `ligacoesOn`, rotulado **"Mostrar ligações"**.
  Com `cb17456` ele ganhou um papel que não tinha: como vale só em REPOUSO,
  desligá-lo transforma o mapa num quadro limpo de componentes em que o rastro
  monta o subgrafo aresta por aresta.
- **A capacidade de rótulo por aresta** (`GraphLinkData.label`, `linkLabel()`, o
  `papel` do `LineageBranch`) ficou de pé para o verbo por referência — e é
  exatamente o que `0d0ae90` usou.

## Como o usuário trabalha

- **Não commite sem o aval dele.** O fluxo é: implementar → verificar →
  apresentar o que testar → ele testa no app → ele pede o commit.
- **Separe código de dados nos commits.** Ele edita o catálogo pelo app enquanto
  você trabalha; `git add -A` varre a edição dele junto com o seu código e suja
  o diff. Um commit para código, outro para `catalogo.csv` + `niveis.csv` +
  `graph.json`.
- **Commite o CONTINUAR.md junto com o trabalho que ele descreve.** Isto já
  falhou: o `0d0ae90` levou uma versão deste documento que descrevia a sessão
  ANTERIOR, e o documento passou um dia inteiro mentindo sobre o que existia.
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
- **NUNCA derrube o dev server** em `localhost:5173` — ele fica aberto com o
  usuário testando.
- **Ele edita o catálogo enquanto você trabalha.** Nunca use `git checkout` em
  `catalogo.csv`/`niveis.csv`/`verbos.csv`; faça backup por cópia e restaure por
  cópia. E **nunca fixe contagens do catálogo em teste** — use invariantes.
- **Nunca edite os CSVs à mão.** Grave pelo serializador (ou pelas APIs
  `/api/catalogo`, `/api/niveis`, `/api/verbos`, que são o caminho do próprio
  app): um teste trava o `catalogo.csv` byte a byte contra `serializarCatalogo`.
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
- **Ele escreve as queixas em `docs/ajustes.md`** (untracked). Foi de lá que
  saíram o agrupamento por verbo no balão e os chips de tipo de ligação. Vale
  olhar antes de perguntar o que fazer.
- Ele testa em português e o código/documentação seguem em pt-BR.

## Pendências registradas

Grandes:

- **Ingestão do Databricks / Unity Catalog** — especificação completa em
  [`ingestao-databricks.md`](ingestao-databricks.md), com as decisões já tomadas
  com o usuário (UC em uso; coleta começa por notebook porque o acesso hoje é só
  pela interface web; a primeira fase importa componentes a partir da linhagem,
  com ele escolhendo quais e em que nível; jobs ficam fora do `catalogo.csv` —
  **reconfira essa última**, agora que existe a camada Jobs (Pipelines) e o
  verbo `envia`, que era justamente o que faltava para representá-los).
  É o próximo trabalho grande.
- **Saber se um componente chega ao consumo.** Foi a pergunta que abriu o dia
  30/08 e continua sem resposta no app: não há indicador, filtro nem coluna para
  "este componente é consumido, transitivamente, por alguma jornada/consumidor".
  Focar num consumidor por vez responde (`buildLineageTree` devolve o fecho
  montante dele), mas é manual e por eliminação. Proposta apresentada e não
  implementada: linha "Consumido por: …" no balão, coluna na Tabela e chip de
  filtro ao lado de "sem owner" — com o nível-alvo vindo do `niveis.csv`, nunca
  com o slug cravado no código (isso reintroduziria o tratamento especial de
  nível removido em `c005a33`).
- **Débito herdado não tem eixo** (lacuna 1 acima): hoje vira "a avaliar" com a
  explicação no corpo, e fica visível com o rótulo errado.
- **O bloco `## Relações` do corpo é segunda fonte de verdade e já divergiu.**
  O `dim_cliente` lista dois "vem de" e consome três. Agora que o verbo está na
  coluna, o corpo deveria guardar só o que a coluna não guarda. Mexer nisso é
  reescrever o `observacoes` das **38 linhas** que têm bloco `## Relações` —
  decisão dele.

Arestas soltas do trabalho de hoje (todas confirmadas no código):

- **Criar camada no app antes de cadastrar o primeiro componente derruba a
  suíte.** `scripts/niveis.test.ts` exige que todo nível NÃO built-in do
  `niveis.csv` tenha ao menos um nó (*"os níveis cadastrados carregam nós de
  verdade"*). É decisão de produto se relaxa; **o usuário optou por deixar como
  está** — o invariante diz algo verdadeiro sobre o catálogo, e o contorno é
  cadastrar o componente logo em seguida.
- **Os chips de tipo de ligação não entram na URL.** Só `?alcance=` entra (mais
  `?foco=`, `?vista=`, `?prof=`, `?no=`, `?aba=`). Compartilhar um link não leva
  os chips apagados junto.
- **Nó aceso sem aresta visível**, quando o chip daquele verbo está apagado. O
  destaque de nó segue a adjacência (`neighborsById`, montado sobre TODAS as
  arestas), e o chip só fala de aresta. O vizinho fica aceso e a ligação que o
  justificava não está desenhada.
- **O contador do rastro muda antes da tela** quando se clica de novo com o
  cursor ainda sobre o nó: o clique tira o id de `pinnedIds` (o contador cai),
  mas o `hoverId` continua ancorando a mesma vizinhança, então o mapa só muda
  quando o cursor sai. É consequência direta de `ancorasDoDestaque` somar hover
  + rastro + balão.
- **Em aresta curta, a tarja do verbo cobre parte do nome do nó de origem.** É
  tradeoff assumido no código ("tapar um pedaço do nome por um instante custa
  menos que entregar o verbo ilegível"), não descuido — mas continua incomodando
  e não foi mostrado ao usuário.

Antigas, ainda válidas:

- **O pacote de demonstração ficou MAIS incompatível.** O zip em
  `entregas/mapa-dados-atacado-demo.zip` é de 29/08: traz o mapa de exemplo, um
  `catalogo.csv` de **14 colunas** (com `associacoes`) e nenhum `verbos.csv`. Um
  catálogo de hoje aberto naquele HTML perde dado na primeira gravação. O
  gerador (`scripts/empacotar.ts`) **já** está pronto para os três CSVs e trata
  o `verbos.csv` como opcional; `npm run pacote` regera. É decisão do usuário
  quando.
- **O mapa abre cortado nas pontas.** A primeira coluna some atrás da legenda e
  a última passa da borda direita; só se vê tudo dando zoom out. O `zoomToFit`
  roda (`Graph.tsx`, efeito de `fixedLayout`) mas não dá conta da largura. Já
  acontecia com o catálogo menor — não é regressão do foco —, e com **11
  colunas** piorou: a legenda esconde Consumidores, Identidade e DMO inteiras.
- **A legenda cobre o painel de filtros** quando aberta. O usuário sabe e disse
  que trataria "a legenda inteira" num passo separado, incluindo
  reposicionamento. E ela ganhou mais duas linhas hoje ("relação sem direção não
  tem ponta" e "clicar de novo tira do rastro"), então cobre um pouco mais.
- `FUTURO.md` — itens fora do MVP.
- `ligacao-por-clique.md` — criar ligações arrastando de um componente ao outro.
  Restam **duas** decisões de produto ali (direção do arraste e desfazer); a
  terceira, "qual relação o gesto cria", caiu com a fusão das colunas — mas
  **volta em outra forma** com o vocabulário de verbos: arrastar cria `consome`
  ou pergunta o verbo?
- Confirmação de exclusão por um segundo Delete foi **descartada** (a
  auto-repetição do teclado excluiria sem o usuário ler o aviso).

## Distribuição

`npm run pacote` gera `entregas/mapa-dados-atacado-demo.zip`: o HTML autocontido
mais uma **cópia** dos CSVs que existirem (`catalogo.csv`, `niveis.csv` e, se já
tiver nascido, `verbos.csv`), para a pessoa abrir por duplo clique e editar sem
tocar no catálogo do repositório. Regere sempre que o catálogo mudar — o HTML
carrega os dados embutidos no momento da geração.

Atenção ao distribuir: um `catalogo.csv` com coluna nova aberto num **pacote
antigo** perde a coluna silenciosamente na primeira gravação, porque o parse
monta a linha campo a campo. Toda mudança de coluna obriga a reemitir o pacote e
avisar quem tem cópia. O `verbos.csv` é a variante nova do mesmo risco: um
pacote antigo não conhece prefixos, então `envia:alvo` vira nome de fantasma lá
dentro.
