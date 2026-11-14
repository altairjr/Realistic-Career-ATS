# Esquema de dados (versão 3)

O app guarda dois tipos de documento. No Claude ficam na conta do usuário (`data/users/<id>/app` e `data/users/<id>/app/weeks/<id>`); fora do Claude, no `localStorage` (chave `carreira-ats-v1`, com `{ state, history }`). O backup em JSON tem o mesmo conteúdo.

Limite a respeitar: cada documento pode ter no máximo 256 KiB. Por isso as semanas fechadas ficam em documentos separados e o documento principal é compactado.

## Documento principal (`state`)
| Campo | Conteúdo |
|---|---|
| `v` | Versão do esquema (3). `normalize()` atualiza dados de versões anteriores. |
| `gameDay` | Dia atual do jogo. |
| `profile` | `name`, `nationality`, `level`, `experience`, `visa`. |
| `settings` | Regras gerais: `day1Weekday`, `costs`, `tripBonus`, `market`, `taxes`, `hos`, `borrowed`, `payroll`, `loan`, `bills`, `cities`, `lists.operation`. Não guarda condições de contrato. |
| `companies[]` | `id`, `name`, `hq`, `dot`, `notes`. |
| `contracts[]` | `id`, `companyId`, `classification`, `operation`, `startDay`, `endDay`, `endReason`, `truck`, `trailer`, `renomeLevel`, `terms`. |
| `contracts[].terms` | Condições do contrato: `contract` (forma de pagamento e valores), `expenses`, `benefits`, `perDiem`, `opCosts`, `safety`, `renome`. |
| `currentContractId` | Contrato ativo. |
| `week` | Semana em aberto: `start` e `trips[]`. |
| `payroll[]` | Holerites ou acertos: `weekStart`, `payday`, `amount`, `status`, `paidDay`, `breakdown` (`gross`, `ded`, `takeHome`, `living`, `net`, `tax`, `safety`). |
| `ledger[]` | Extrato: `day`, `desc`, `amount`, `ref`, `locked`. |
| `bank` | `opening` (saldo inicial), `archived` (soma dos lançamentos compactados), `loanTotal`. |
| `career` | `startDay`, `billedThrough`, `loanNext`, `safetyStreak`, `k401`, `violations[]`. |
| `_rev`, `_by` | Controle de sincronização (carimbo de tempo e aparelho que gravou). |

Saldo bancário = `bank.opening + bank.archived + soma(ledger.amount)`.

### Viagem (`week.trips[]` e `trips[]` das semanas fechadas)
- Dados lançados: `id`, `day`, `type` (`company` = caminhão, `borrowed` = carro), `origin`, `dest`, `status`, `miles`, `freight`, `bonus`, `fuel`, `tolls`, `fines`, `damage`, `breakfast`, `lunch`, `dinner`, `hotel`, `hours`, `drive`, `brk`, `away`, `detention`, `stops`, `layover`, `breakdown`, `tarp`.
- Regras gravadas no lançamento:
  - Caminhão: `contractId`, `contract` (cópia das condições de pagamento) e `rules` (`exp` = quem paga cada despesa, `market` = frete de mercado).
  - Carro: `car` (`mode` = `borrowed` ou `owned`, `pct`, `factor`, `bonusOn`, `bonusFactor`, `personal`, `costPerMile`).

### Referências do extrato (`ledger[].ref`)
`trip:<id>` (viagem de carro), `pay:<id>` (holerite), `living:<id>` (despesas no fechamento), `bill:<início da semana>` (contas fixas), `loan:<dia>` (parcela), `fine:<início da semana>` (multa de fiscalização), `adj` (ajuste manual).

## Semana fechada (`history[]`, um documento por semana)
`id`, `start`, `end`, `closedDay`, `contractId`, `trips[]`, `dre` (resultado calculado no fechamento), `settings` (regras efetivas no fechamento), `violations[]`.

## Compactação
No fechamento de cada semana, `compact()` tira do documento principal o que tem mais de 84 dias (12 semanas): lançamentos do extrato (somados em `bank.archived`), holerites pagos e infrações. O saldo não muda. As semanas fechadas continuam completas no Histórico.

## Atualização de versões antigas (`normalize`)
- Nomes de operação antigos viram o padrão americano (ex.: `Local/Dedicated` → `Local (Day Cab)`).
- Condições de contrato que ficavam em `settings` são removidas; valem as do contrato.
- Campos extintos são apagados (`ruleset`, `taxType`, `market` dentro do contrato, `payroll.deposit`, `lists.classification`).
- Dados sem empresa ou contrato recebem um contrato padrão.
- Viagens da semana em aberto sem regras gravadas recebem as regras atuais.
