-- Schema dell'app CosaMangio. Da eseguire una volta nel SQL Editor del progetto Supabase.

-- Un pasto di un giorno: quale ricetta hai scelto (null = quella proposta dalla rotazione), se l'hai mangiato e
-- quali ingredienti non hai mangiato (escono da kcal, proteine e consumo delle scorte).
create table public.pasti (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  giorno date not null,
  pasto text not null,
  ricetta text,
  fatto boolean not null default false,
  saltati text[] not null default '{}',
  primary key (user_id, giorno, pasto)
);

-- Sedute di allenamento fatte (una riga per giorno).
create table public.allenamenti (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  giorno date not null,
  primary key (user_id, giorno)
);

-- I giorni delle sedute di una settimana (lunedi = il suo lunedì), se li hai spostati: senza riga valgono quelli
-- soliti di ALLENAMENTO nel file di piano.
create table public.sedute_spostate (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  lunedi date not null,
  giorni date[] not null,
  primary key (user_id, lunedi)
);

-- Lista della spesa in corso: 'da_congelare' = arrivato ma ancora da porzionare e mettere in freezer, 'manca' =
-- ordinato ma non consegnato. 'preso' e 'in_casa' sono delle versioni prima delle scorte e non si usano più.
create table public.spesa (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  prodotto text not null,
  stato text not null check (stato in ('preso', 'in_casa', 'da_congelare', 'manca')),
  primary key (user_id, prodotto)
);

-- Quanto hai in casa di un prodotto (grammi, o pezzi per i prodotti a pezzo) al momento "dal": l'app toglie quello
-- che i pasti del piano usano da allora.
create table public.scorte (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  prodotto text not null,
  quantita real not null check (quantita >= 0),
  dal timestamptz not null default now(),
  primary key (user_id, prodotto)
);

-- Cibi mangiati fuori dai pasti del piano: una riga per porzione. Contano nelle kcal del giorno e nelle scorte.
create table public.fuori_pasto (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  giorno date not null,
  cibo text not null,
  quando timestamptz not null default now()
);
create index fuori_pasto_giorno on public.fuori_pasto (user_id, giorno);

-- Codice articolo Esselunga -> prodotto della lista, scelto dall'utente ('' = non è nella lista), e quanto c'è in
-- una confezione se l'ha scritto (il documento di consegna non lo dice per tutto).
create table public.nomi_scontrino (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  codice text not null,
  prodotto text not null,
  grammi real,
  primary key (user_id, codice)
);

-- Iscrizioni alle notifiche push, una per dispositivo.
create table public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  subscription jsonb not null,
  created_at timestamptz not null default now()
);

-- Notifiche già mandate: evita i doppioni se il cron gira due volte. Solo il server (service role) la usa.
create table public.push_log (
  chiave text primary key,
  sent_at timestamptz not null default now()
);

alter table public.pasti enable row level security;
alter table public.allenamenti enable row level security;
alter table public.sedute_spostate enable row level security;
alter table public.spesa enable row level security;
alter table public.scorte enable row level security;
alter table public.nomi_scontrino enable row level security;
alter table public.fuori_pasto enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.push_log enable row level security;

create policy "solo i propri pasti" on public.pasti
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "solo i propri allenamenti" on public.allenamenti
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "solo le proprie sedute" on public.sedute_spostate
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "solo la propria spesa" on public.spesa
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "solo le proprie scorte" on public.scorte
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "solo i propri cibi" on public.fuori_pasto
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "solo i propri nomi" on public.nomi_scontrino
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "solo le proprie iscrizioni" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- push_log: nessuna policy, quindi chiusa a tutti tranne la service role.

-- Il server invia le notifiche all'endpoint salvato dal browser: solo servizi push veri, in https.
alter table public.push_subscriptions add constraint endpoint_servizio_push check (
  endpoint ~ '^https://([a-z0-9-]+\.)*(web\.push\.apple\.com|fcm\.googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com)/'
  and subscription->>'endpoint' = endpoint
);
