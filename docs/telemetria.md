# Telemetria do jogo — v0.19

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

## Instalação (uma vez)
1. **Baixar a DLL**: no GitHub, aba **Actions** › workflow **telemetria** › última execução com ✅ › em *Artifacts*, baixe **carreira-telemetria-dll** e descompacte. (Se não houver execução, clique em **Run workflow**.)
2. **Copiar para o jogo**: na Steam, clique com o direito em American Truck Simulator › *Gerenciar* › *Ver arquivos locais*. Abra `bin\win_x64`, crie a pasta `plugins` (se não existir) e copie `carreira-telemetria.dll` para dentro dela.
3. **Abrir o jogo**: ao carregar um plugin, o ATS pode mostrar um aviso sobre recursos avançados do SDK. Confirme com OK.
4. **Rodar o programa companheiro**: na pasta do projeto, `npm run telemetria`. Na primeira vez, ele pede o e-mail e a senha da sua conta (os mesmos do app). Deixe a janela aberta enquanto joga.

Requisitos: Windows 64 bits, ATS atualizado (os eventos de entrega existem desde a versão 1.01 da telemetria; o programa avisa se o jogo não enviar) e Node.js 18+ para o programa companheiro.

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
- O log do jogo (`Documentos\American Truck Simulator\game.log.txt`) mostra `[carreira-telemetria] ativo, gravando em ...` quando o plugin carregou.

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
- O plugin não interpreta nada: grava todos os atributos de cada evento. A interpretação fica em `telemetry/companion/core.mjs` (funções puras, testadas em `tests/telemetry.test.cjs`). Se o SDK mudar algum nome, ajuste lá, sem recompilar a DLL.
- A DLL é compilada pelo GitHub (`.github/workflows/telemetria.yml`) com o SDK oficial 1.16 da SCS. Para os testes fora do Windows, `tests/telemetry/` tem cabeçalhos de simulação do SDK e um programa que imita o jogo (`harness.cpp` + `sessao-exemplo.txt`).
