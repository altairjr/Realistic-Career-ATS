# Telemetria do jogo — v0.21

A telemetria lê o jogo enquanto você joga e leva para o app:
- **o dia atual do jogo**, que o app pode seguir sozinho;
- **o trabalho em andamento** (carga, origem, destino, distância planejada, frete e prazo), no cartão "No jogo agora" do Painel;
- **cada entrega concluída**, como rascunho de viagem para você lançar: milhas, frete, pedágios e balsas, multas, horas dirigidas, dano da carga e experiência.

## Como funciona
```
ATS ── plugin (DLL dentro do jogo) ──> telemetria.jsonl ──> programa companheiro (PC) ──> sua conta ──> app (PC e celular)
```
1. **Plugin** (`telemetry/plugin/carreira_telemetria.cpp`): o jogo carrega a DLL ao abrir. Ela grava num arquivo tudo o que o SDK de telemetria da SCS informa sobre o trabalho, as entregas, as multas, os pedágios e o dia do jogo. Não acessa a internet.
2. **Programa companheiro** (`telemetry/companion/companion.mjs`): lê esse arquivo, monta as entregas e a situação do jogo e envia para a sua conta, com o mesmo login do app.
3. **App**: mostra o cartão "No jogo agora", segue o dia do jogo (se você ligar) e lista as entregas em "Viagens do jogo para revisar".

Nada entra na carreira sem você confirmar: cada entrega abre o formulário de viagem já preenchido.

## Instalação (uma vez) — app de PC
1. **Baixar**: no app, *Ajustes › Telemetria do jogo › Baixar o Carreira Realista para PC*, ou o link fixo
   `https://github.com/altairjr/Realistic-Career-ATS/releases/latest/download/CarreiraRealista-Setup.exe`.
2. **Instalar**: abra o arquivo. Como o programa não tem assinatura digital paga, o Windows mostra "O Windows protegeu o computador": clique em *Mais informações › Executar assim mesmo*.
3. **Primeira vez**: o programa acha o ATS pela Steam e oferece instalar o plugin na pasta certa (`bin\win_x64\plugins`), avisando se houver cópia numa pasta que o jogo não lê. O jogo precisa estar fechado.
4. **Entrar na conta**: no painel do programa, com o mesmo e-mail e senha do app.

Depois disso é só jogar: com a opção **Abrir este programa junto com o jogo** (ligada por padrão), o plugin abre o programa quando o ATS inicia. Ele fica como ícone na bandeja, perto do relógio.

### Ícone na bandeja
- **Verde**: tudo funcionando. **Amarelo**: coleta pausada, perfil não ligado, sem internet ou esperando o jogo. **Vermelho**: falta login ou plugin.
- Clique para abrir o painel, que mostra cada item (jogo encontrado, plugin instalado e atualizado, plugin carregado pelo jogo segundo o `game.log.txt`, jogo aberto, conta) e o botão para resolver o que faltar.
- Menu: mostrar o app por cima do jogo, ligar ou pausar a coleta, ver o perfil ligado, sair.
- A cada entrega enviada aparece um aviso do Windows.

### Coleta e perfis
- **Coleta ligada/pausada** (bandeja, painel ou app em *Ajustes › Telemetria do jogo*): pausada, o plugin não grava nada e nada é enviado. A pausa feita no app chega ao PC em poucos segundos.
- **Perfil ligado à carreira**: o programa lê no `game.log.txt` qual perfil o jogo carregou. O primeiro perfil em que você joga fica ligado sozinho; em outro perfil, nada vai para o app (nem entrega, nem dia, nem trabalho) e o aviso "perfil não ligado" aparece. Troque o perfil ligado no painel do PC ou no app.
- **Remover plugin do jogo**: no painel do PC, com o jogo fechado.

### App por cima do jogo (overlay)
- Atalho **Ctrl+Shift+Espaço** (pode trocar no painel): abre o app numa janela sempre por cima do jogo, em modo compacto, para lançar e revisar viagens sem Alt+Tab. O × ou o mesmo atalho escondem.
- Arraste pelo cabeçalho verde; o tamanho e a posição ficam guardados. Na primeira vez, entre na conta dentro da janela.
- Funciona com o jogo **em janela ou em tela cheia sem borda**. Em tela cheia exclusiva, o Windows não deixa outra janela ficar por cima.

- Ao esconder (× ou atalho), o jogo volta a receber o teclado sem precisar clicar nele (v0.21: a janela minimiza antes de sumir, e o Windows devolve o foco ao jogo).

### Simulação no jogo (v0.21)
Ajuste em *Ajustes › Telemetria do jogo › Simulação no jogo*; o programa do PC aplica no jogo digitando no console por você.
- **Warp ao abrir o jogo** (padrão 0,9 quando ligado): aplicado uma vez em cada sessão do jogo, no perfil ligado. Desligar volta ao `warp 1`.
- **Tempo de carga** (padrão 1 h quando ligado): depois de cada entrega, o relógio do jogo avança esse tempo (`g_set_time`).
- **Overlay › Tempo no jogo**: relógio do jogo e botões +1 h, +2 h, +4 h, +8 h e "Ir para" uma hora. `g_set_time` só anda para frente; uma hora menor que a atual é a do dia seguinte.
- **Quando o comando é digitado**: o pedido fica na fila (`comando.txt`) até o jogo estar em foco, sem pausa, com o caminhão parado há 1,5 s. O plugin abre o console, digita, aperta Enter e fecha. O resultado aparece num aviso do Windows, no painel do PC e no app ("Último aplicado no jogo").
- **Precisa do console ligado**: em `Documentos\American Truck Simulator\config.cfg`, com o jogo fechado, `uset g_console "1"` e `uset g_developer "1"`. Sem isso o programa não manda nada (as letras virariam comandos de direção).
- A tecla do console usada é a que fica abaixo do Esc (\` no teclado americano, ' no ABNT2).
- Nada é aplicado com a coleta pausada, em perfil não ligado ou com o jogo fechado.

### Sem o app de PC (alternativa)
A DLL também é publicada na Release e no workflow `telemetria`; copie para `bin\win_x64\plugins` (exatamente `plugins`, minúsculo, com "s"; uma pasta `Plugin` criada por outros mods é ignorada). Depois rode `npm run telemetria` na pasta do projeto (Node.js 18+). Opções: `-- --diagnostico`, `-- --pausar`, `-- --retomar`, `-- --sair`.

## No app
- **Cartão "No jogo agora"** (Painel): dia do jogo, caminhão e trabalho em andamento. Aparece quando há dados dos últimos 3 dias.
- **Ligar o dia do app ao jogo**: guarda a diferença entre os calendários (ex.: dia 40 no jogo = dia 18 no app). Depois disso, quando o jogo vira o dia, o app vira junto, cobrando contas e pagando holerites pelo calendário do app. Nunca volta dias. A primeira entrega lançada também liga o dia, pelo dia que você confirmar no formulário.
- **Viagens do jogo para revisar**: cada entrega chega com origem, destino, milhas, frete, pedágios, multas e horas dirigidas, no dia certo do app. Confira refeições, noites em hotel e o status da entrega e salve.

## O que é lido e como vira viagem
| No app | Vem de |
|---|---|
| Origem, destino, carga | trabalho atual (`source.city`, `destination.city`, `cargo`) |
| Milhas | `distance.km` da entrega × 0,621371 (sem ele: odômetro; sem odômetro: distância planejada) |
| Frete | `revenue` da entrega (sem ele: `income` do trabalho) |
| Pedágios | pedágios, balsas e trens pagos desde a última entrega |
| Multas | multas desde a última entrega |
| Horas de direção | minutos de jogo com o caminhão em movimento durante o trabalho |
| Dia | dia do jogo + diferença ligada no app |
| Dano da carga, XP, prazo | informativos |

Combustível: o SDK informa os litros abastecidos, não o valor pago. Por enquanto o valor do combustível continua manual.

## Diagnóstico
- `npm run telemetria -- --diagnostico` mostra cada registro do jogo como veio do plugin. Use na primeira sessão para conferir os nomes e valores.
- Arquivos em `%LOCALAPPDATA%\CarreiraRealistaATS`: `telemetria.jsonl` (plugin), `companheiro.json` (posição de leitura e fila de envio), `sessao.json` (login deste PC; a senha não é gravada). Para sair da conta neste PC: `npm run telemetria -- --sair`.
- Sem internet, as entregas ficam guardadas e são enviadas quando a conexão voltar. Rodar de novo nunca duplica entregas.
- O log do jogo (`Documentos\American Truck Simulator\game.log.txt`) mostra `loading 'carreira-telemetria'` e `[carreira-telemetria] ativo, gravando em ...` quando o plugin carregou. Se essas linhas não aparecem, a DLL não está em `bin\win_x64\plugins`.

## Primeiro teste no jogo (14/11/2026, ATS 1.62.2.2s)
- Plugin carregado ao lado do TruckyTelemetry, sem conflito.
- Entrega rápida (quick job) ADM → XPO Logistics, Carson City: frete $351, 3 km (1,9 mi), 18 XP, 10 min de jogo, 0% de dano; dia 19 do jogo; caminhão Kenworth W900. O rascunho chegou à conta com esses valores.
- Nomes confirmados no jogo: `job.delivered` com `revenue`, `earned.xp`, `cargo.damage`, `distance.km`, `delivery.time`, `auto.park.used`, `auto.load.used`; trabalho com `source.city`, `destination.city`, `cargo`, `income`, `planned_distance.km`, `delivery.time`, `job.market`, `is.special.job`.
- Corrigido na versão 0.1.1 do plugin: odômetro e relógio do jogo passam a ser lidos a cada quadro (antes só chegavam quando mudavam, e o início do trabalho ficava sem odômetro).
- Ainda não testados no jogo: multa, pedágio, balsa, trem, abastecimento e trabalho cancelado.

## Limites conhecidos
- Feito para o modo um jogador. Em comboio (Convoy), o dia do jogo pode diferir.
- Horas de serviço (on-duty) saem iguais às de direção; acrescente carga e descarga se quiser.
- O SDK não informa a avaliação da entrega (Excelente, Bom trabalho...); escolha no formulário.

## Contrato do rascunho
O leitor envia uma linha por entrega, com a sessão da mesma conta do app:

```http
POST /rest/v1/trip_drafts?on_conflict=user_id,event_id
apikey: <chave publicável>
Authorization: Bearer <token da sessão>
Prefer: resolution=ignore-duplicates,return=minimal

{ "user_id": "<id do usuário>", "event_id": "<id único da entrega>", "source": "telemetria", "game": "ats",
  "data": { ... } }
```

| Campo de `data` | Tipo | Significado |
|---|---|---|
| `vehicle` | `"truck"` ou `"car"` | Caminhão (contrato) ou carro (fora do contrato). Padrão: truck |
| `origin`, `dest` | texto | Cidades de origem e destino |
| `cargo` | texto | Carga (só informativo) |
| `miles` | número | Distância em milhas |
| `freight` | número | Frete pago pelo jogo (USD) |
| `bonus` | número | Bônus do jogo (USD) |
| `fuel`, `tolls` | número | Combustível e pedágios pagos na viagem (USD) |
| `fines`, `damage` | número | Multas e danos (USD) |
| `drive`, `hours` | número | Horas de direção e de serviço |
| `status` | texto | Avaliação da entrega, se o leitor souber (uma das 8 do app) |
| `gameDay`, `gameTime` | número | Dia do jogo (1, 2, ...) e minutos do jogo na entrega |
| `cargoDamagePct`, `xp`, `truck`, `fuelLiters` | | Informativos |

- `event_id` evita duplicatas: a mesma entrega enviada duas vezes vira um rascunho só.
- O dia do jogo, as refeições e as noites em hotel são conferidos por você ao lançar.
- Limites (no `schema.sql`): `data` com até ~20 KB; `game` = `ats` ou `ets2`; `status` = `new`, `accepted` ou `discarded`.

## Ciclo de vida
1. O leitor cria o rascunho com `status = new`.
2. O app busca os novos a cada sincronização (15 s, ou ao voltar para a tela).
3. **Lançar**: abre o formulário preenchido; ao salvar, a viagem guarda `draftId` e o rascunho vira `accepted`.
4. **Descartar**: o rascunho vira `discarded`.
5. Sem internet, a decisão fica numa fila no navegador e é enviada depois. Um rascunho já lançado em outro aparelho some da lista pela própria viagem sincronizada (`draftId`).

## Testar sem o jogo
```bash
node tools/enviar-rascunho.mjs
```
Pergunta e-mail, senha e os dados de uma entrega, entra na sua conta e cria o rascunho. Em até 15 segundos o aviso aparece no Painel do app.


## Situação do jogo (`game_status`)
Uma linha por usuário, gravada pelo programa companheiro: `game` (`ats`/`ets2`), `online`, `game_time` (minutos desde o início do perfil), `truck` e `job` (`cargo`, `origin`, `dest`, `plannedMiles`, `income`, `deadline`).

## Para quem for mexer no código
- `telemetry/companion/runner.mjs` é o núcleo do programa do PC (leitura, filtro de perfil, pausa, envio); `gamelog.mjs` lê o perfil no `game.log.txt`; `install.mjs` acha o jogo pela Steam e instala a DLL. Usados pelo `companion.mjs` (terminal) e pelo app de PC (`desktop/`, Electron).
- O instalador e a Release são gerados pelo workflow `desktop` (compila a DLL, roda `desktop/preparar.mjs`, empacota com o electron-builder e publica).
- Controle pela pasta de dados: `pausado.flag` (plugin não grava), `abrir-com-jogo.txt` (caminho do programa que o plugin abre), `app.vivo` (o programa está aberto), `controle.json` (coleta e perfil ligado, cópia local).
- O plugin não interpreta nada: grava todos os atributos de cada evento. A interpretação fica em `telemetry/companion/core.mjs` (funções puras, testadas em `tests/telemetry.test.cjs`). Se o SDK mudar algum nome, ajuste lá, sem recompilar a DLL.
- A DLL é compilada pelo GitHub (`.github/workflows/telemetria.yml`) com o SDK oficial 1.16 da SCS. Para os testes fora do Windows, `tests/telemetry/` tem cabeçalhos de simulação do SDK e um programa que imita o jogo (`harness.cpp` + `sessao-exemplo.txt`).
