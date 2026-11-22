"""Piano d'esempio, inventato: mostra il formato del file di piano (descritto in PIANO.md).

Rigenera il JSON dell'app con:
    python scripts/build_dieta.py piano/esempio.py piano.html piano/esempio.json
"""

TITOLO = "Piano d'esempio"
SOTTOTITOLO = "Persona inventata · 34 anni, 165 cm, 60 kg · pesi a crudo"

# Fasce di ogni giornata, con qualunque alternativa: kcal e grammi di proteine (minimo, massimo). Vanno scelte con
# un professionista: il motore le controlla, non le calcola.
OBIETTIVI = {"kcal": (1600, 2100), "proteine": (80, 130)}

# Primo giorno del piano, un lunedì: prima non partono notifiche e la prima settimana propone i piatti del PDF.
INIZIO = "2026-01-05"
FUSO = "Europe/Rome"

# Solo i pasti che fai, con l'orario: qui niente dopocena, e la merenda c'è solo nei giorni feriali (SETTIMANA).
PASTI = {"colazione": "07:30", "pranzo": "13:00", "merenda": "16:30", "cena": "20:00"}

# Facoltativo: senza ALLENAMENTO l'app non mostra pagina e avvisi delle sedute.
ALLENAMENTO = {
    "giorni": [1, 4],  # martedì e venerdì
    "ora": "19:00",
    "descrizione": "20 minuti, a casa, con un tappetino",
    "riscaldamento": {"nome": "Riscaldamento", "dettaglio": "Marcia sul posto e rotazioni delle spalle.",
                      "secondi": 180},
    "circuito": [
        {"nome": "Squat", "dettaglio": "Schiena dritta, scendi finché le cosce sono parallele al pavimento."},
        {"nome": "Piegamenti sulle ginocchia", "dettaglio": "Corpo dritto dalle ginocchia alle spalle."},
        {"nome": "Ponte per i glutei", "dettaglio": "Sdraiati sulla schiena, piedi a terra: solleva il bacino e scendi piano."},
        {"nome": "Plank", "dettaglio": "Sui gomiti, pancia stretta.", "secondi": 30},
    ],
    "ripetizioni": "10-12 ripetizioni",
    "giri": 3,
    "pausa": 30,
    "progressione": [
        "Quando 12 ripetizioni sono facili, aggiungi un giro.",
        "Plank: 5 secondi in più ogni settimana.",
    ],
}

# Ogni ingrediente delle ricette: kcal e proteine per 100 g a crudo (o per pezzo se a_pezzo=True) e, se si compra
# con la spesa, il prodotto di PRODOTTI. Valori indicativi dalle tabelle CREA: per i tuoi, leggi le etichette.
ALIMENTI = {
    "Fiocchi d'avena": dict(kcal=372, prot=13.5, prodotto="avena"),
    "Yogurt greco 0%": dict(kcal=57, prot=10, prodotto="yogurt"),
    "Banana": dict(kcal=89, prot=1.1, prodotto="banane"),
    "Mela": dict(kcal=52, prot=0.3, prodotto="mele"),
    "Pane integrale": dict(kcal=240, prot=8, prodotto="pane"),
    "Uova": dict(kcal=75, prot=6.5, a_pezzo=True, prodotto="uova"),
    "Uovo sodo": dict(come="Uova"),  # stessi valori e prodotto, nome diverso
    "Pasta": dict(kcal=356, prot=12, prodotto="pasta"),
    "Lenticchie secche": dict(kcal=291, prot=23, prodotto="lenticchie"),
    "Ceci in scatola": dict(kcal=120, prot=7, prodotto="ceci"),
    "Petto di pollo": dict(kcal=110, prot=23, prodotto="pollo"),
    "Merluzzo surgelato": dict(kcal=75, prot=17, prodotto="merluzzo"),
    "Mozzarella": dict(kcal=253, prot=18.7, prodotto="mozzarella"),
    "Pomodori": dict(kcal=18, prot=1, prodotto="pomodori"),
    "Insalata": dict(kcal=15, prot=1.5, prodotto="insalata"),
    "Patate": dict(kcal=80, prot=2, prodotto="patate"),
    "Grana Padano": dict(kcal=392, prot=33, prodotto="grana"),
    # Senza prodotto: si conta nelle kcal ma non va nella lista della spesa (sta in SPESA_EXTRA).
    "Olio EVO": dict(kcal=899, prot=0),
    "Pizza margherita": dict(kcal=800, prot=30, a_pezzo=True),
    "Mandarino": dict(kcal=53, prot=0.8),  # fuori dalla lista: si segna fuori dai pasti
    # Non contano: nelle ricette si scrivono col solo nome, o con la quantità a testo.
    "Caffè": None, "Limone": None, "Basilico": None, "Sale e pepe": None,
}

FRUTTA, PANE, FRIGO, CARNE, SURGELATI, DISPENSA = (
    "Frutta e verdura", "Pane", "Frigo", "Carne: porzionala e congelala all'arrivo", "Surgelati", "Dispensa")
REPARTI = (FRUTTA, PANE, FRIGO, CARNE, SURGELATI, DISPENSA)

# Cosa si compra. conf: quanto c'è in una confezione, in grammi (o in pezzi se gli alimenti del prodotto sono a
# pezzo). pezzo: grammi di un pezzo, per contare a pezzi un prodotto che le ricette pesano. fresco: l'avanzo non vale
# per la spesa dopo. sgocciolato: conf è il peso sgocciolato. tieni/congela: all'arrivo si porziona e si congela.
# scongela: sta in freezer, l'avviso della sera prima lo nomina così. una_confezione: in freezer ne entra una.
# sostituti: prodotti simili, in ordine: se questo manca e ne hai uno, la ricetta resta proposta con quello.
# Una ricetta può dire i suoi: sostituti={"mele": ["banane"]}.
PRODOTTI = {
    "banane": dict(reparto=FRUTTA, nome="Banane", conf=720, conf_nome="casco da 6", pezzo=120, fresco=True),
    "mele": dict(reparto=FRUTTA, nome="Mele", conf=900, conf_nome="sacchetto da 6", pezzo=150),
    "pomodori": dict(reparto=FRUTTA, nome="Pomodori", conf=500, conf_nome="vaschetta da 500 g", fresco=True),
    "insalata": dict(reparto=FRUTTA, nome="Insalata", conf=250, conf_nome="busta da 250 g", fresco=True,
                     sostituti=["pomodori"]),
    "patate": dict(reparto=FRUTTA, nome="Patate", conf=1000, conf_nome="sacchetto da 1 kg"),
    "pane": dict(reparto=PANE, nome="Pane integrale", conf=500, conf_nome="pagnotta da 500 g",
                 tieni="fuori, nel sacchetto", congela="a fette", scongela="pane", una_confezione=True),
    "yogurt": dict(reparto=FRIGO, nome="Yogurt greco 0%", conf=500, conf_nome="vasetto da 500 g", fresco=True),
    "uova": dict(reparto=FRIGO, nome="Uova", conf=6, conf_nome="confezione da 6"),
    "mozzarella": dict(reparto=FRIGO, nome="Mozzarelle", conf=125, conf_nome="mozzarella da 125 g", pezzo=125,
                       fresco=True),
    "grana": dict(reparto=FRIGO, nome="Grana Padano", conf=200, conf_nome="pezzo da 200 g"),
    "pollo": dict(reparto=CARNE, nome="Petto di pollo", conf=500, conf_nome="vaschetta da 500 g", tieni="in frigo",
                  scongela="pollo"),
    "merluzzo": dict(reparto=SURGELATI, nome="Merluzzo", conf=400, conf_nome="confezione da 400 g", scongela="pesce"),
    "avena": dict(reparto=DISPENSA, nome="Fiocchi d'avena", conf=500, conf_nome="pacco da 500 g"),
    "pasta": dict(reparto=DISPENSA, nome="Pasta", conf=500, conf_nome="pacco da 500 g"),
    "lenticchie": dict(reparto=DISPENSA, nome="Lenticchie secche", conf=500, conf_nome="pacco da 500 g"),
    "ceci": dict(reparto=DISPENSA, nome="Ceci in scatola", conf=240, conf_nome="lattina da 400 g (240 g sgocciolati)",
                 sgocciolato=True),
}

# Le ricette, complete: le kcal sono la somma degli ingredienti. Un "N minuti" nei passi diventa un timer nell'app.
RICETTE = [
    dict(nome="Yogurt, avena e banana", minuti=3,
         ingredienti=["Caffè", ("Yogurt greco 0%", 150), ("Fiocchi d'avena", 60), ("Banana", 120)],
         passi=["Mescola yogurt e avena, poi aggiungi la banana a rondelle."]),
    dict(nome="Uova strapazzate e pane", minuti=8,
         ingredienti=["Caffè", ("Uova", 2), ("Pane integrale", 80), ("Olio EVO", 5), "Sale e pepe"],
         passi=["Scalda l'olio in padella a fuoco medio.",
                "Versa le uova sbattute con un pizzico di sale e mescola per 2 minuti, finché si rapprendono.",
                "Servile sul pane tostato."]),
    dict(nome="Pasta al pomodoro", minuti=20,
         ingredienti=[("Pasta", 110), ("Pomodori", 200), ("Olio EVO", 10), ("Grana Padano", 15), "Basilico"],
         passi=["Metti a bollire l'acqua salata.",
                "In padella scalda l'olio e cuoci i pomodori a pezzi per 10 minuti.",
                "Cuoci la pasta per 10 minuti, scolala e saltala nel sugo.",
                "Finisci con il grana e il basilico."]),
    dict(nome="Pasta, pomodoro e ceci", minuti=20,
         ingredienti=[("Pasta", 80), ("Ceci in scatola", 120, "120 g, mezza lattina"), ("Pomodori", 150),
                      ("Olio EVO", 10), ("Grana Padano", 10)],
         pdf="Lunedì e giovedì a pranzo, al posto della pasta al pomodoro",
         passi=["Cuoci i pomodori a pezzi con l'olio per 5 minuti, poi aggiungi i ceci sciacquati.",
                "Cuoci la pasta per 10 minuti e saltala nel sugo con un mestolo d'acqua di cottura.",
                "Finisci con il grana."]),
    dict(nome="Pasta al forno con mozzarella", minuti=35,
         ingredienti=[("Pasta", 100), ("Pomodori", 200), ("Mozzarella", 125), ("Olio EVO", 5)],
         # La merenda di quel giorno, che con questo piatto salti.
         toglie=[("Mela", 150)],
         passi=["Accendi il forno a 200 gradi e cuoci la pasta per 6 minuti, a metà cottura.",
                "Mescolala con i pomodori a pezzi, l'olio e metà della mozzarella, in una teglia.",
                "Copri con il resto della mozzarella e cuoci in forno per 15 minuti.",
                "Quel giorno salta la mela della merenda."]),
    dict(nome="Pasta e lenticchie", minuti=40,
         ingredienti=[("Pasta", 80), ("Lenticchie secche", 60), ("Olio EVO", 10), ("Grana Padano", 10)],
         passi=["Lessa le lenticchie in acqua salata per 25 minuti.",
                "Aggiungi la pasta e un po' d'acqua calda e cuoci per 10 minuti, mescolando.",
                "Condisci con l'olio a crudo e il grana."]),
    dict(nome="Insalata di ceci, pomodori e mozzarella", minuti=10,
         ingredienti=[("Ceci in scatola", 240, "una lattina, 240 g sgocciolati"), ("Pomodori", 150),
                      ("Mozzarella", 125), ("Olio EVO", 10), ("Pane integrale", 40)],
         passi=["Sciacqua e sgocciola i ceci.",
                "Mescolali con i pomodori a pezzi e la mozzarella a cubetti.",
                "Condisci con olio e sale; pane a parte."]),
    dict(nome="Pollo alla piastra con insalata", minuti=15,
         ingredienti=[("Petto di pollo", 180), ("Insalata", 100), ("Olio EVO", 10), ("Pane integrale", 80),
                      ("Limone", "mezzo")],
         passi=["Scalda bene la piastra e cuoci il pollo per 4 minuti per lato.",
                "Insalata con l'olio e il succo di limone; pane a parte."]),
    dict(nome="Merluzzo al forno con patate", minuti=40,
         ingredienti=[("Merluzzo surgelato", 200), ("Patate", 300), ("Olio EVO", 15), ("Limone", "mezzo")],
         passi=["Il merluzzo va scongelato in frigo dalla sera prima.",
                "Accendi il forno a 200 gradi e cuoci le patate a spicchi con metà dell'olio per 20 minuti.",
                "Aggiungi il merluzzo con sale e limone e cuoci altri 15 minuti."]),
    dict(nome="Lenticchie in umido con pane", minuti=35, ripiego=True,
         ingredienti=[("Lenticchie secche", 80), ("Pomodori", 100), ("Olio EVO", 10), ("Pane integrale", 80)],
         passi=["Cuoci le lenticchie con i pomodori a pezzi e un bicchiere d'acqua per 30 minuti.",
                "Condisci con l'olio a crudo; pane a parte."]),
    dict(nome="Frittata con pomodori e insalata", minuti=15,
         ingredienti=[("Uova", 3), ("Grana Padano", 10), ("Pomodori", 100), ("Insalata", 80), ("Olio EVO", 10),
                      ("Pane integrale", 60)],
         passi=["Sbatti le uova con il grana e versale in padella con 5 g di olio.",
                "Cuoci a fuoco basso con il coperchio per 5 minuti, gira e cuoci altri 3 minuti.",
                "Insalata e pomodori con il resto dell'olio; pane a parte."]),
    dict(nome="Pizza", minuti=0, fuori=True,
         ingredienti=[("Pizza margherita", 1)],
         nota="Fuori casa, niente da cucinare: goditela."),
    dict(nome="Yogurt e mela", minuti=0, sostituti={"mele": ["banane"]},
         ingredienti=[("Yogurt greco 0%", 150), ("Mela", 150)]),
    dict(nome="Pane e grana", minuti=0,
         ingredienti=[("Pane integrale", 40), ("Grana Padano", 20)]),
]

# Per ogni giorno e pasto le ricette fra cui scegliere: la prima è il piatto del piano (la settimana di INIZIO, il PDF
# e il controllo delle fasce), le altre sono le alternative, nell'ordine della rotazione.
SETTIMANA = {
    "lunedì": {
        "colazione": ["Yogurt, avena e banana"],
        "pranzo": ["Pasta al pomodoro", "Pasta, pomodoro e ceci"],
        "merenda": ["Yogurt e mela", "Pane e grana"],
        "cena": ["Pollo alla piastra con insalata", "Frittata con pomodori e insalata"],
    },
    "martedì": {
        "colazione": ["Uova strapazzate e pane"],
        "pranzo": ["Pasta e lenticchie"],
        "merenda": ["Yogurt e mela"],
        "cena": ["Merluzzo al forno con patate", "Lenticchie in umido con pane"],
    },
    "mercoledì": {
        "colazione": ["Yogurt, avena e banana"],
        "pranzo": ["Insalata di ceci, pomodori e mozzarella"],
        "merenda": ["Pane e grana"],
        "cena": ["Frittata con pomodori e insalata"],
    },
    "giovedì": {
        "colazione": ["Uova strapazzate e pane"],
        "pranzo": ["Pasta al pomodoro", "Pasta, pomodoro e ceci", "Pasta al forno con mozzarella"],
        "merenda": ["Yogurt e mela"],
        "cena": ["Pollo alla piastra con insalata"],
    },
    "venerdì": {
        "colazione": ["Yogurt, avena e banana"],
        "pranzo": ["Pasta e lenticchie"],
        "merenda": ["Yogurt e mela", "Pane e grana"],
        "cena": ["Merluzzo al forno con patate", "Lenticchie in umido con pane"],
    },
    "sabato": {
        "colazione": ["Uova strapazzate e pane"],
        "pranzo": ["Insalata di ceci, pomodori e mozzarella"],
        "cena": ["Pizza"],
    },
    "domenica": {
        "colazione": ["Uova strapazzate e pane"],
        "pranzo": ["Insalata di ceci, pomodori e mozzarella"],
        "cena": ["Frittata con pomodori e insalata"],
    },
}

# Cibi da segnare fuori dai pasti, una porzione per tocco: (nome in ALIMENTI, quantità, porzione mostrata).
FUORI_PASTO = [
    ("Banana", 120, "1 banana"),
    ("Mela", 150, "1 mela"),
    ("Yogurt greco 0%", 150, "1 vasetto"),
    ("Uovo sodo", 1, "1 uovo"),
    ("Grana Padano", 20, "20 g"),
    ("Mandarino", 80, "1 mandarino"),
]

# Senza quantità nel piano: si ricomprano quando finiscono.
SPESA_EXTRA = [(DISPENSA, "Caffè"), (DISPENSA, "Olio, sale, pepe, limone")]

TESTO_SPESA = """"Serve" è quanto usa una settimana del piano, comprese le alternative. Pesi a crudo, ceci sgocciolati.
La pizza del sabato è fuori casa e non c'è. Prima di ordinare guarda cosa hai già."""

NOTE = [
    ("Pesi", "Tutti i pesi sono a crudo; i ceci in scatola si pesano sgocciolati."),
    ("Scongelare", "Pollo e merluzzo vanno in frigo dalla sera prima: l'app te lo ricorda alle 22:30."),
    ("Avvertenza", "Piano d'esempio inventato: non è un consiglio medico né nutrizionale."),
]
