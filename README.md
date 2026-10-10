# Carteira (versão online)

Acompanha os teus investimentos por divisões (ETFs, REITS, Dividendos…), em euros, com preços que se atualizam sozinhos (com 15 a 20 minutos de atraso nas bolsas europeias). Cada pessoa tem conta própria e só vê os seus dados.

## Como funciona

- **Página** (`web/`): ficheiros estáticos, sem servidor. Faz login e mostra os teus dados.
- **Base de dados** (`supabase/`): Supabase (PostgreSQL + login). A privacidade entre utilizadores é garantida pela própria base de dados (row level security), não pela página.
- **Tarefa de preços** (`job/` + `.github/workflows/prices.yml`): corre a cada 15 minutos nos dias úteis no GitHub Actions, vai buscar os preços ao Yahoo Finance e grava-os na base de dados.

Custo: 0 € nos planos gratuitos (Supabase, GitHub, Cloudflare Pages).

## Pôr online (cerca de 30 minutos)

### 1. Criar o projeto Supabase
1. Em supabase.com cria conta e um projeto novo (região UE, por exemplo Frankfurt). Guarda a palavra-passe da base de dados.
2. Em **SQL Editor**, cola o conteúdo de `supabase/schema.sql` e carrega em Run.
3. Em **Authentication > Providers > Email**, deixa o email ativo. Se quiseres entrar logo sem confirmar o email (só para ti), desliga «Confirm email».
4. Em **Project Settings > API** copia: o **Project URL**, a chave **anon / publishable** (pública) e a chave **service_role** (secreta, nunca vai para a página nem para o código).

### 2. Ligar a página à base de dados
Edita `web/config.js` e coloca o URL e a chave pública. Não coloques a service_role aqui.

### 3. Publicar a página
Cloudflare Pages (ou Netlify / GitHub Pages): cria um projeto, escolhe a pasta `web/` como pasta de publicação, sem comando de build. Fica com um endereço do tipo `carteira.pages.dev`.
Depois, em Supabase **Authentication > URL Configuration**, coloca esse endereço em «Site URL».

### 4. Criar a tua conta e carregar a tua carteira
1. Abre a página, preenche email e palavra-passe e carrega em «Criar conta» (confirma o email se pedir). Entra.
2. No **SQL Editor** do Supabase, cola e corre `supabase/seed.sql`. Carrega as tuas 8 divisões e as 57 posições da XTB (a primeira conta criada é a dona). Só funciona se ainda não tiveres posições.
3. Recarrega a página: deves ver 6 895,26 € de valor e 6 469,38 € investido.

### 5. Ligar a atualização automática de preços
1. Cria um repositório no GitHub com esta pasta. Tem de ser **público** para as execuções serem gratuitas e ilimitadas (não há nenhum segredo no código; as chaves ficam em Secrets).
2. Em **Settings > Secrets and variables > Actions** cria `SUPABASE_URL` (o Project URL) e `SUPABASE_SERVICE_KEY` (a chave service_role).
3. No separador **Actions**, corre «Atualizar preços» manualmente (Run workflow). Deve acabar a verde, com a linha «ok N, falhados M».
4. A partir daí corre sozinho a cada 15 minutos, dias úteis, entre as 07h e as 21h UTC.

## Notas e limites

- Posições manuais (PPR, obrigações fora da corretora): «Adicionar posição», marca «Preço manual» e atualiza o preço quando quiseres (Editar).
- Se um ativo aparecer «sem preço»: o símbolo do Yahoo é diferente. Em Editar, preenche «Símbolo para o preço» (por exemplo `SXR8.DE`). No teu caso, vale a pena rever `ESIH.DE` e `XAD6.DE`, que ficaram sem divisão.
- O gratuito do Supabase **pausa o projeto após 1 semana sem atividade**; entra de vez em quando ou retoma no painel. O GitHub pode desativar execuções agendadas em repositórios inativos durante 60 dias; basta voltar a ativar.
- Se o Yahoo bloquear os servidores do GitHub (a tarefa falha com «Nenhum preço obtido»), corre a tarefa no teu computador: `pip install -r job/requirements.txt`, define as duas variáveis de ambiente e corre `python job/update_prices.py`.
- Fora do horário de mercado o preço é o do último fecho.

## Antes de abrir a outras pessoas (importante)

- **Dados de mercado**: o Yahoo Finance é para uso pessoal. Para uma aplicação com outros utilizadores é preciso uma fonte licenciada (por exemplo planos comerciais de Twelve Data, a partir de cerca de 149 $/mês). Só o ficheiro `job/update_prices.py` muda.
- **Alojamento**: o plano gratuito do Supabase não tem cópias de segurança diárias nem evita a pausa; para utilizadores reais usa o plano Pro (25 $/mês). A Vercel Hobby não permite uso comercial; Cloudflare Pages permite.
- **Legal**: política de privacidade e termos (RGPD: guardas dados financeiros de terceiros), aviso de que não é aconselhamento financeiro (já está no rodapé), e processo de apagar conta e dados.
- Limites já aplicados por conta: 500 posições e 30 divisões.

## Testado

Esquema, regras de acesso e totais testados em PostgreSQL 16 local; tarefa de preços testada com servidor e Yahoo simulados; página testada em jsdom com a base de dados simulada. **Não foi testado de ponta a ponta contra um projeto Supabase real nem contra o Yahoo a sério**; o passo 5.3 é o primeiro teste a sério.
