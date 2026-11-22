# Il file di piano

Questa guida è scritta per un agente AI (Claude, ChatGPT, Codex…) che compila il piano alimentare di una persona,
e si legge anche a mano. Il file di piano è un modulo Python, `piano/<nome>.py`: contiene alimenti, ricette,
settimana e spesa. Il motore `scripts/build_dieta.py` lo legge, controlla calorie, proteine e spesa, e genera il
JSON che l'app usa e l'HTML del PDF da stampare. Un esempio completo e inventato è `piano/esempio.py`.

## Il ciclo di lavoro

1. La persona compila `piano/questionario.html` (si apre con doppio clic) e ti dà il testo copiato.
2. Leggi le risposte. Quello che manca e serve, chiedilo in chat prima di scrivere: soprattutto le fasce di
   calorie e proteine (vedi sotto), i pasti con gli orari e il giorno d'inizio.
3. Scrivi `piano/<nome>.py` partendo da `piano/esempio.py`.
4. Lancia il motore:

   ```powershell
   python scripts/build_dieta.py piano/<nome>.py piano.html src/data/piano.json
   ```

5. Se esce `Errore nel piano: ...`, il messaggio dice cosa manca e dove: correggi e rilancia, finché passa.
   Una giornata fuori dalle fasce si sistema cambiando le quantità o le ricette, non allargando le fasce.
6. Mostra alla persona le ricette e la lista della spesa (l'HTML, o l'app con `npm run dev`) e correggi con lei.

Serve Python 3.9 o successivo, senza librerie.

**Le fasce non le inventi.** `OBIETTIVI` contiene le calorie e le proteine di ogni giornata. Se la persona non le
ha da un medico o da un nutrizionista, chiedile di farsele dare: non calcolarle tu da peso e altezza. Il motore
le controlla, non le sceglie. Allergie, intolleranze e celiachia: ogni ricetta le deve rispettare; nel dubbio
chiedi.

## Dalle risposte del questionario al file

| Sezione del questionario | Dove finisce |
|---|---|
| Tu | `SOTTOTITOLO` (età, altezza, peso), `OBIETTIVI` (solo le fasce date da un professionista), `NOTE` |
| Salute e alimentazione | quali alimenti e ricette usare: niente di quello che è vietato o dà fastidio |
| Giornata tipo | `PASTI` (quali e a che ora), `INIZIO`, le ricette fuori casa per i pranzi fuori |
| Fame e abitudini | quantità, colazioni leggere o no, dolci o salate, `NOTE` (acqua, caffè) |
| Alcol e pasti liberi | ricette con `fuori=True` (pizza, pasto libero) e le loro kcal |
| Spesa | `PRODOTTI` (confezioni, freschi, freezer), `SPESA_EXTRA`, quante verdure diverse |
| Cucina | `minuti` e `passi` delle ricette, attrezzi da usare, quante ricette diverse |
| Movimento | `ALLENAMENTO` (giorni, ora, esercizi con gli attrezzi che ha), oppure niente |
| Cibi | `ALIMENTI` e `RICETTE`: usa quello che piace, evita quello che non piace |
| Altro | dove serve |

## Le parti del file

Le costanti si scrivono in maiuscolo. Quelle segnate "facoltativa" si possono omettere.

### Intestazione

```python
TITOLO = "Piano alimentare"                      # facoltativa: titolo del PDF
SOTTOTITOLO = "34 anni, 165 cm, 60 kg · pesi a crudo"  # facoltativa
OBIETTIVI = {"kcal": (1600, 2100), "proteine": (80, 130)}   # (minimo, massimo) di ogni giornata
INIZIO = "2026-01-05"                            # un lunedì, AAAA-MM-GG
FUSO = "Europe/Rome"                             # facoltativa, è il valore normale
PASTI = {"colazione": "07:30", "pranzo": "13:00", "cena": "20:00"}
```

- `INIZIO`: primo giorno del piano, un lunedì. Prima non partono notifiche; la settimana di `INIZIO` propone il
  primo piatto di ogni pasto (quello del PDF), poi le alternative girano una settimana dopo l'altra.
- `PASTI`: solo i pasti che la persona fa, fra `colazione`, `pranzo`, `merenda`, `cena`, `dopocena`, con l'ora
  in ordine. Il primo è quello del risveglio: il suo avviso arriva all'ora del pasto; per gli altri arriva quando
  bisogna iniziare a cucinare.

### `ALIMENTI`

Ogni ingrediente che compare nelle ricette, con il nome che l'app mostra.

```python
ALIMENTI = {
    "Pasta": dict(kcal=356, prot=12, prodotto="pasta"),
    "Uova": dict(kcal=75, prot=6.5, a_pezzo=True, prodotto="uova"),
    "Uovo sodo": dict(come="Uova"),
    "Olio EVO": dict(kcal=899, prot=0),
    "Caffè": None,
}
```

- `kcal` e `prot`: per 100 g **a crudo**, o per pezzo se `a_pezzo=True`. Da dove prenderli: l'etichetta del
  prodotto (tabella "per 100 g"), oppure le tabelle di composizione degli alimenti del CREA. Legumi e tonno in
  scatola si pesano sgocciolati; la carne con l'osso si pesa con l'osso, con i valori di quella con l'osso.
- `prodotto`: la chiave in `PRODOTTI` se si compra con la spesa; senza, l'alimento conta nelle calorie ma non
  nella lista (l'olio che c'è sempre, un panino comprato fuori).
- `come="Altro nome"`: stessi valori e prodotto di un altro alimento, con un nome diverso nelle ricette. I campi
  scritti accanto vincono: `dict(come="Pane", prodotto=None)`.
- `None`: non conta (caffè, sale, spezie, limone).

### `REPARTI` e `PRODOTTI`

Cosa si compra, diviso per reparto, nell'ordine della lista della spesa.

```python
FRUTTA, FRIGO, CARNE, DISPENSA = ("Frutta e verdura", "Frigo", "Carne", "Dispensa")
REPARTI = (FRUTTA, FRIGO, CARNE, DISPENSA)
PRODOTTI = {
    "pasta": dict(reparto=DISPENSA, nome="Pasta", conf=500, conf_nome="pacco da 500 g"),
    "banane": dict(reparto=FRUTTA, nome="Banane", conf=720, conf_nome="casco da 6", pezzo=120, fresco=True),
    "pollo": dict(reparto=CARNE, nome="Petto di pollo", conf=500, conf_nome="vaschetta da 500 g",
                  tieni="in frigo", scongela="pollo"),
}
```

| Campo | Significato |
|---|---|
| `reparto`, `nome` | dove sta nella lista e come si chiama |
| `conf`, `conf_nome` | quanto c'è in una confezione, in grammi (o in pezzi se gli alimenti del prodotto sono a pezzo), e come si chiama |
| `pezzo` | grammi di un pezzo, per contare a pezzi un prodotto che le ricette pesano (banane, mele, mozzarelle) |
| `fresco=True` | dura pochi giorni: l'avanzo non vale per la spesa dopo, e dopo una settimana l'app lo considera finito |
| `sgocciolato=True` | `conf` è il peso sgocciolato (legumi, tonno) |
| `tieni`, `congela` | all'arrivo si porziona e si congela: dove resta quello di oggi e domani, e come congelarlo se non a porzioni dei pasti ("a fette") |
| `scongela` | sta in freezer: la sera prima l'app avvisa di spostarlo in frigo, con questo nome breve |
| `sostituti=["cetrioli", "pomodori"]` | prodotti simili, in ordine: se questo manca e ne hai uno, l'app propone lo stesso la ricetta e dice di usare quello, nella stessa quantità (quindi stessa unità: grammi con grammi, pezzi con pezzi) |
| `una_confezione=True` | in freezer ne entra una a settimana: le alternative che ne usano di più non fanno comprare di più (il motore dice quanto manca) |

Ogni prodotto deve essere usato da almeno una ricetta della settimana.

### `RICETTE`

Ricette complete: le calorie sono la somma degli ingredienti, non si scrivono.

```python
RICETTE = [
    dict(nome="Pasta al pomodoro", minuti=20,
         ingredienti=[("Pasta", 110), ("Pomodori", 200), ("Olio EVO", 10), "Basilico"],
         passi=["Cuoci i pomodori con l'olio per 10 minuti.", "Cuoci la pasta per 10 minuti e saltala nel sugo."]),
]
```

| Campo | Significato |
|---|---|
| `nome` | il nome nell'app; diventa anche l'id della ricetta |
| `minuti` | dall'inizio della preparazione al piatto pronto (0 per quello che non si cucina) |
| `ingredienti` | `(nome, grammi)`, o `(nome, pezzi)` per gli alimenti a pezzo; `"Nome"` da solo o `("Limone", "mezzo")` per quelli che non contano; `(nome, quantità, "come mostrarla")` se "120 g" non basta: `("Ceci in scatola", 240, "una lattina, 240 g sgocciolati")` |
| `passi` | facoltativo: un passaggio per voce; ogni "N minuti" diventa un timer nella guida dell'app |
| `nota` | facoltativa: una frase nella pagina del pasto |
| `fuori=True` | si mangia fuori casa (pizza, pasto libero, pranzo al bar): niente da cucinare, la rotazione non lo propone al posto di un piatto di casa |
| `ripiego=True` | per quando manca un prodotto: l'app lo propone solo allora, e non conta nella spesa |
| `sostituti` | in questo piatto, al posto dei `sostituti` del prodotto: `sostituti={"finocchi": ["insalata"]}`; `[]` = qui non si sostituisce (è cotto dentro il piatto) |
| `toglie` | ingredienti di un altro pasto dello stesso giorno che con questa ricetta si saltano: `toglie=[("Mela", 150)]` |
| `pdf`, `titolo_pdf` | facoltativi: la ricetta va nella pagina "Varianti sfiziose" del PDF; `pdf` dice al posto di cosa |

**Non rinominare una ricetta o un prodotto quando l'app è già in uso**: i pasti segnati e le scorte salvate
puntano al nome (della ricetta) e alla chiave (del prodotto). Con un nome nuovo quelle righe si perdono.

### `SETTIMANA`

Per ogni giorno, da `lunedì` a `domenica`, e per ogni pasto, le ricette fra cui scegliere.

```python
SETTIMANA = {
    "lunedì": {
        "colazione": ["Yogurt, avena e banana"],
        "pranzo": ["Pasta al pomodoro", "Pasta, pomodoro e ceci"],
        "cena": ["Pollo alla piastra con insalata"],
    },
    # ... fino a "domenica"
}
```

- La prima ricetta di ogni pasto è il **piatto del piano**: va nel PDF, nella settimana di `INIZIO` e nel
  controllo delle fasce. Le altre sono le **alternative**: la rotazione ne propone una diversa ogni settimana, e
  la persona può sempre sceglierne un'altra dall'app.
- Un giorno può non avere tutti i pasti di `PASTI` (niente merenda nel fine settimana).
- Un piatto fuori casa che si può scegliere ogni giorno (il pranzo al bar) va messo in fondo a ogni pasto in cui
  vale.

### Facoltative

| Costante | Cosa fa |
|---|---|
| `ALLENAMENTO` | giorni (0 = lunedì), ora, `descrizione`, `riscaldamento`, `circuito` di esercizi (`nome`, `dettaglio`, `secondi` se a tempo), `ripetizioni` (per quelli senza `secondi`), `giri`, `pausa` in secondi, `progressione`. Senza, l'app non mostra pagina e avvisi delle sedute. |
| `FUORI_PASTO` | cibi da segnare fuori dai pasti, una porzione per tocco: `("Banana", 120, "1 banana")` |
| `SPESA_EXTRA` | cose da ricomprare quando finiscono, senza quantità: `(reparto, "Caffè")` |
| `TESTO_SPESA` | introduzione alla lista della spesa nel PDF (HTML ammesso) |
| `NOTE` | `(titolo, testo)`: le regole del piano, nel PDF e nella pagina Tu dell'app |
| `SCONTRINO`, `ARTICOLI`, `PROVE_SCONTRINO` | solo per chi riceve il "Documento di consegna" PDF di Esselunga: espressioni regolari sulla descrizione della riga → prodotto, peso delle confezioni per codice articolo, righe di prova che il motore controlla. Senza, la spesa arrivata si segna a mano. |

## Cosa controlla il motore

- Ogni giornata, con il piatto del piano, resta dentro `OBIETTIVI`; e ci resta anche sostituendo un pasto alla
  volta con ciascuna alternativa (i piatti fuori casa scelti al posto di uno di casa non contano).
- La lista della spesa basta per qualunque alternativa: per ogni pasto conta il piatto del piano più, per ogni
  prodotto, l'alternativa che ne usa di più. I ripieghi non contano.
- Nomi, prodotti, reparti, giorni, pasti e orari esistono e sono scritti come serve.

Il JSON generato va in `src/data/piano.json` e si committa: il deploy non esegue Python.
