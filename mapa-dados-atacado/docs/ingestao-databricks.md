# Ingestão de metadados do Databricks / Unity Catalog

## Contexto

O `catalogo.csv` é preenchido inteiramente à mão. Boa parte do que se digita já existe
descrita no Unity Catalog — nome qualificado, owner, formato, comentário, colunas, e a
linhagem real entre tabelas. O objetivo é **reduzir a digitação sem destruir o
julgamento humano**: débito técnico, produto de dados, nível e centro de custo não
existem no Databricks e são exatamente o gap de governança que o mapa existe para
tornar visível.

Ambiente confirmado: **Unity Catalog em uso**; acesso hoje **só pela interface web**
(API depois); código de notebook **pode ir a um LLM com aval formal**, então isso é a
última fase.

Duas decisões já tomadas com o usuário:
- **Jobs ficam fora do `catalogo.csv`**, em vista própria.
- **A primeira entrega é linhagem + criação de componentes a partir dela**: *"evita que
  eu crie todos os componentes/tabelas daquela linhagem; o sistema mostra uma lista da
  linhagem do Databricks onde o usuário define qual componente deve ser criado e em qual
  nível ele entra."*

## O princípio que governa tudo

`scripts/graph-lib.ts:7` declara a regra central do projeto:

> NENHUM nó é derivado de campo. Todo nó vem de uma LINHA do catálogo, e toda aresta
> vem de uma referência declarada. **Nada é inferido.**

Uma coleta automática é a maior ameaça que esse princípio já teve. O que o preserva:
**a coleta PROPÕE, o humano DISPÕE.** Nenhum byte do `catalogo.csv` muda sem alguém
aceitar. O build **nunca** deriva aresta de metadado — mesmo quando dois componentes
declaram tabelas que o UC diz se lerem. Isso precisa estar escrito em comentário no
código, porque é tentador e alguém vai tentar.

---

## Peças estruturais

### A costura: coluna `tabelas_fisicas`

Lista de nomes plenamente qualificados (`catalogo.esquema.tabela`), separados por ` | `
como `consome` e `associacoes` já fazem — a cardinalidade real é 1:N (o "BACEN
3040/45/46/47" é visivelmente mais de uma tabela; um componente `Processos` é zero).
Nome em pt-BR e neutro de fornecedor, como o resto do arquivo.

**É um endereço, não uma relação.** Duas linhas declarando a mesma tabela viram
**warning** em `validarCatalogo` — não é erro, é um sinal de governança de primeira
qualidade ("duas pessoas descrevem a mesma tabela com nomes diferentes").

**Migração:** o precedente exato é o commit de `produto_de_dados`. Quatro asserções
travam o formato e migram junto: `catalogo-serde.test.ts` linhas 40 (round-trip byte a
byte contra o arquivo real), 127 e 161 (`;produto_de_dados` como última coluna) e 129
(uma linha serializada literal, que ganha mais um `;`). Depois disso, **regravar o
`catalogo.csv` uma vez pelo app** — `npm run data` não regrava.

**Compatibilidade para trás é segura** (`COLUNAS_OPCIONAIS` já tolera a coluna
ausente). **Para frente não é, e é risco de perda de dado:** um CSV de 15 colunas
aberto num pacote HTML antigo perde a coluna silenciosamente na primeira gravação —
`parseCatalogoRows` monta o objeto campo a campo, então nada desconhecido sobrevive ao
parse. Não há mitigação técnica que valha o custo; a mitigação é operacional:
**reemitir o pacote e avisar quem tem cópia antiga**, registrado no
`scripts/pacote-leia-me.txt`.

### O artefato de coleta

`metadados.json` ao lado dos CSVs, com envelope versionado e seções **opcionais e
independentes**: `{ versao, coletado_em, origem, escopo, tabelas[], linhagem[], jobs[],
notebooks[] }`. É isso que deixa uma fase consumir só `tabelas` e a seguinte acrescentar
`jobs` sem quebrar nada.

**Quem produz é intercambiável:** hoje um notebook colado no Databricks, que o usuário
roda e baixa; amanhã um script Node. O contrato do JSON é o que fica.

**Não entra no `graph.json`.** Além do tamanho (o `graph.json` tem 8,4 KB para 15 nós e
é inlinado nos 521 KB do HTML standalone), o motivo forte é que o grafo é derivado *só*
do CSV — é essa invariante que faz o grafo montado no navegador ser idêntico ao montado
pelo dev server.

**Módulo próprio, puro:** `scripts/metadados-lib.ts`, com a mesma disciplina de zero
`import` do `graph-lib.ts`, e ponte de re-export espelhando `graph-build.ts`. O
`graph-lib.ts` já tem 1467 linhas e é o ativo mais valioso do projeto; parse do
artefato e cálculo de diff são outro assunto. Só a coluna nova pertence a ele.

**Duas invariantes:** o artefato **nunca impede o mapa de renderizar** (versão
desconhecida, JSON corrompido, seção faltando → degrada para "sem metadados" e reporta
pelo canal de `warnings` que já existe); e **`coletado_em` aparece em toda tela que ele
alimenta** — uma lista de colunas de três meses atrás exibida sem data é um bug de
confiança.

**Onde vive, por modo:**

| Modo | De onde vêm os metadados |
| --- | --- |
| dev server | `fetch('./metadados.json')` de `public/` — zero código novo no servidor |
| arquivo local | da pasta já aberta, opcional como o `niveis.csv` já é |
| somente leitura | **não há** — `file://` bloqueia `fetch`, e o `useFonteCatalogo.ts` já documenta isso |

O `empacotar.ts` copia o artefato para `catalogo/` no zip, junto dos CSVs.

### Escrita: operações, não snapshots

**Risco grave e não óbvio:** o `CatalogStore` grava sempre o conjunto **completo** de
linhas, sem trava de concorrência. Um painel de reconciliação fica aberto por minutos;
se o usuário editar um componente no formulário nesse meio-tempo, aplicar sobre o
snapshot antigo **reverte a edição em silêncio**.

O padrão já existe e é copiável do `CatalogForm`: `const atuais = (await
store.lerCatalogo()) ?? rows` **imediatamente antes de gravar**. Consequência de
desenho: o que o humano aceita é uma **lista de operações por id** ("acrescentar
`bacen-3040` ao `consome` de `gdad`"), reaplicável sobre linhas frescas — não um
snapshot de substituição. Se a linha alvo mudou desde a leitura, abortar com mensagem
clara em vez de gravar por cima.

### O livro de decisões: `decisoes.csv`

Sem isso a reconciliação morre na segunda coleta, repetindo 40 perguntas já
respondidas. Terceiro arquivo ao lado dos outros dois, legível em planilha pela mesma
regra, copiado pelo `empacotar.ts`:
`chave_divergencia; veredito; valor_coletado; decidido_por; decidido_em; motivo`.

Três nuances que decidem se funciona:
1. **A chave inclui o fato proposto, não só o alvo.** Rejeitar "`gdad` consome
   `bacen-3040`" não pode calar um futuro "`gdad` consome `restritivos`".
2. **A rejeição expira quando o fato muda.** Guardar o `valor_coletado` contra o qual
   ela foi feita; valor diferente na coleta seguinte = outra pergunta, e ela volta.
3. **Só rejeições são guardadas.** Aceite vira linha do catálogo e a divergência
   desaparece sozinha.

Sem poda automática: uma coleta parcial não pode apagar decisões e fazer o painel
perguntar tudo de novo.

**Custo honesto:** o terceiro arquivo se paga caro em encanamento — `ArquivosCatalogo`,
`NOME_DO_ARQUIVO` em `fs-access.ts`, o roteamento de importação em `useFonteCatalogo`,
o `empacotar.ts`. É mecânico, mas é largo. Por isso ele entra na Fase 2, não na 1.

---

## Fases

### Fase 1 — Importar da linhagem *(a que o usuário pediu primeiro)*

**Entrega:** o notebook coleta tabelas e linhagem de um escopo que o usuário declara
(catálogos/schemas que interessam). O app abre uma **tela de importação em lote**: a
lista de tabelas do Databricks com a linhagem entre elas, cada linha com uma caixa de
seleção e um select de **nível**. O usuário marca o que vira componente e em que camada
entra; ao confirmar, tudo é criado numa gravação — nome, `tabelas_fisicas`, nível, e as
arestas `consome` **entre as tabelas que ele escolheu**.

Isso é o que evita cadastrar 30 tabelas à mão, e resolve de quebra a adoção da coluna
nova: ela nasce preenchida em vez de exigir preenchimento retroativo.

**Por que não vira dump do Unity Catalog:** nada é criado sem marcação explícita, e o
`nivel` — que a coleta não sabe e nunca saberá — é escolhido linha a linha. Tabela não
marcada continua listada como **gap visível**, que é o objetivo declarado do produto.

**Toca:** a coluna em `graph-lib.ts` e a migração dos quatro testes; `metadados-lib.ts`
novo; leitura do artefato nos dois modos que a suportam; a tela de importação (superfície
ampla, como a do `CatalogForm` — não cabe no balão de 340px); `empacotar.ts`; `README.md`.

**Reaproveita:** o pipeline de escrita inteiro (`canonizarCatalogo` → `validarCatalogo`
→ `serializarCatalogo` → `store.salvarCatalogo`); `criarIndiceAlvos` (`graph-lib.ts:1202`)
para casar tabela com componente existente por id e por nome; o canal de `warnings`; o
`splitLista`/` | `.

**Risco da fase:** nomes físicos são `snake_case` (`recta_fedrl`), nomes de negócio não
(`BACEN 3040/45/46/47`). O matching vai errar. Toda sugestão precisa mostrar **por que**
casou, e "não casou" tem que ser resultado normal e silencioso.

**Em aberto:** o nome sugerido para o componente vem do nome da tabela ou do comentário
do UC? A tela oferece editar o nome antes de criar (recomendo que sim)?

### Fase 2 — Reconciliação contínua + livro de decisões

**Entrega:** a partir da segunda coleta, o que mudou. Tabela nova que ninguém cadastrou,
componente cuja tabela sumiu, owner/comentário divergentes, e **aresta de linhagem que o
catálogo não tem** — item a item, com rejeição lembrada.

**Escopo do primeiro corte:** propor apenas `consome` entre componentes que **ambos** já
têm `tabelas_fisicas`. Aresta que o humano declarou e a linhagem não vê **nunca** é
proposta para remoção — vira alerta informativo, sem ação. É bem mais perigoso acrescentar
um "remover" do que um "acrescentar".

**Duas ressalvas que precisam aparecer na tela**, senão a ferramenta engana: a linhagem do
UC só enxerga o que passou pelo Databricks (Salesforce por ETL externo, servidor de
arquivos e Excel não aparecem), e tem janela de retenção — ausência de aresta não é prova
de ausência de dependência.

**Reaproveita:** `removerComponente`/`DeleteConfirm` como precedente de "computa o impacto
inteiro e mostra antes de gravar"; `validarNiveisContraCatalogo` (`graph-lib.ts:540`) como
modelo de mensagem agregada com contagem e amostra.

### Fase 3 — Colunas da tabela no balão

**Entrega:** o pedido 1 — as colunas da tabela, com tipo e comentário, no balão do
componente, datadas. Seção **recolhida por padrão** mostrando a contagem ("38 colunas"):
o balão tem 340px fixos e o `place()` remede a caixa a cada quadro. Ver todas usa a aba
Tabela, que já tem ordenação e filtro prontos.

**Em aberto:** no pacote de duplo clique, sem pasta aberta, não há metadados — a feature
fica invisível na demonstração executiva. A alternativa é inlinar no build um extrato
**reduzido** (só nomes de coluna), com teto de tamanho e data carimbada. É decisão de
produto, e cabe decidir aqui.

### Fase 4 — Jobs e a vista de processos

**Entrega:** o pedido 3 — "que processos tocam esta base" e "quantas bases este processo
envolve" —, como leitura nova dos mesmos dados, **sem uma linha nova no CSV**, conforme
você decidiu.

**Sobre onde a vista mora:** a recomendação técnica é que seja um **modo dentro da aba
Tabela**, não uma terceira aba. `type Aba = 'mapa' | 'tabela'` tem **13 pontos de
ramificação** no `App.tsx` (URL, `popstate`, Esc, atalho de Delete, render das camadas,
nav) que um terceiro valor multiplica; a `TableView` já traz ordenação, filtro e
clique-para-o-mapa. Se você preferir a aba própria de qualquer forma, é trabalho
conhecido — o inventário está levantado.

**Promoção manual** de um job específico a componente (`tipo_componente: Processos`,
nível escolhido pelo humano) continua disponível, mas rara e sempre manual.

### Fase 5 — Notebooks, extração estática

**Entrega:** o pedido 4 sem código saindo do ambiente. O coletor extrai o que é objetivo
— tabelas lidas e escritas, filtros `WHERE`, joins — e apresenta como rascunho ao lado do
componente; o humano escreve a regra em linguagem de negócio e promove para `observacoes`
pelo `CatalogForm` pré-preenchido. É o caso do rating atacado filtrado por segmento.

Também alimenta a Fase 2 com dependências que a linhagem do UC não pegou.

**Item pequeno e necessário:** `Markdown.tsx` não suporta bloco de código cercado —
código multilinha hoje vira `<p>` com as linhas juntadas por espaço. É a diferença entre
um balão legível e um ilegível.

### Fase 6 — Resumo por LLM *(opt-in, com aval formal)*

Produtor separado: artefato entra, artefato sai — roda offline e pode ser refeito sem
recoletar. Procedência registrada e **exibida junto do texto**: modelo, data, notebook de
origem, quem aprovou. Nunca escreve no `catalogo.csv`.

Fica por último de propósito: quando chegar aqui, as cinco fases anteriores já entregam
valor e a conversa com a segurança da informação acontece sem bloquear nada.

---

## Verificação

- **Round-trip:** `npm test` — o teste byte a byte (`catalogo-serde.test.ts:40`) é o
  guarda-costas da coluna nova; as quatro asserções listadas acima migram junto.
- **Build e tipos:** `npm run data`, `npx tsc -b --noEmit`.
- **Os três modos:** dev server, arquivo local (pacote + "Abrir catálogo" no Chrome) e
  somente-leitura (HTML por duplo clique). O terceiro precisa degradar com mensagem, não
  com seção vazia.
- **Concorrência:** abrir a tela de importação, editar um componente pelo formulário em
  outra aba, e confirmar a importação — a edição não pode sumir.
- **Compatibilidade retroativa:** abrir um `catalogo.csv` anterior à coluna nova e
  confirmar que carrega, edita e grava.
- **Artefato hostil:** JSON corrompido, versão desconhecida, seção faltando — o mapa
  precisa renderizar mesmo assim.
- **Navegador:** Chrome headless via CDP, como no resto do projeto.
- **Documentação:** `README.md:201` (tabela de colunas — já desatualizada, diz 4 tipos de
  componente quando são 15), `FUTURO.md:6` (o item já está registrado), `docs/CONTINUAR.md`
  e `scripts/pacote-leia-me.txt` (o aviso de reemitir o pacote).
