"""Motore del piano: dal file di piano genera l'HTML del PDF e il JSON dell'app, e controlla kcal, proteine e spesa.

Uso: python scripts/build_dieta.py <piano.py> <piano.html> [<piano.json>]

Il formato del file di piano è descritto in PIANO.md. Un errore nel piano esce come "Errore nel piano: ..." e dice
cosa manca e dove; i file si scrivono solo se tutti i controlli passano.
"""
import datetime
import json
import math
import re
import sys
from html import escape
from types import ModuleType, SimpleNamespace

GIORNI = ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"]
# Nell'ordine della giornata: leggi_pasti controlla gli orari su quest'ordine.
NOMI_PASTI = {"colazione": "Colazione", "pranzo": "Pranzo", "merenda": "Merenda", "cena": "Cena",
              "dopocena": "Dopo cena"}
OBBLIGATORI = ["OBIETTIVI", "INIZIO", "PASTI", "ALIMENTI", "REPARTI", "PRODOTTI", "RICETTE", "SETTIMANA"]
FACOLTATIVI = {"TITOLO": "Piano alimentare", "SOTTOTITOLO": "", "FUSO": "Europe/Rome", "ALLENAMENTO": None,
               "FUORI_PASTO": [], "SPESA_EXTRA": [], "NOTE": [], "TESTO_SPESA": "", "SCONTRINO": [],
               "PROVE_SCONTRINO": [], "ARTICOLI": {}}
CAMPI_ALIMENTO = {"kcal", "prot", "a_pezzo", "prodotto", "come"}
CAMPI_PRODOTTO = {"reparto", "nome", "conf", "conf_nome", "pezzo", "fresco", "sgocciolato", "tieni", "congela",
                  "scongela", "una_confezione", "sostituti"}
CAMPI_RICETTA = {"nome", "minuti", "ingredienti", "passi", "nota", "fuori", "ripiego", "toglie", "pdf", "titolo_pdf",
                 "sostituti"}


class ErrorePiano(Exception):
    """Errore nel file di piano: il messaggio dice cosa manca e dove."""


def controlla(condizione, messaggio):
    if not condizione:
        raise ErrorePiano(messaggio)


def numero(x):
    return isinstance(x, (int, float)) and not isinstance(x, bool)


def slug(text):
    text = text.lower()
    for a, b in (("à", "a"), ("è", "e"), ("é", "e"), ("ì", "i"), ("ò", "o"), ("ù", "u"), ("'", " ")):
        text = text.replace(a, b)
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-")


# --- Lettura e controllo del file di piano ---

def leggi_piano(path):
    # Dal sorgente ogni volta: il bytecode in cache può restare vecchio dopo una modifica nello stesso secondo.
    modulo = ModuleType("piano")
    modulo.__file__ = path
    with open(path, encoding="utf-8") as f:
        exec(compile(f.read(), path, "exec"), modulo.__dict__)
    for nome in OBBLIGATORI:
        controlla(hasattr(modulo, nome), f"manca {nome}")
    p = SimpleNamespace(**{k.lower(): getattr(modulo, k, v) for k, v in FACOLTATIVI.items()},
                        **{k.lower(): getattr(modulo, k) for k in OBBLIGATORI})

    controlla(isinstance(p.inizio, str) and re.fullmatch(r"\d{4}-\d\d-\d\d", p.inizio),
              f"INIZIO ({p.inizio!r}): serve una data AAAA-MM-GG")
    controlla(datetime.date.fromisoformat(p.inizio).weekday() == 0, f"INIZIO ({p.inizio}) deve essere un lunedì")
    for chiave in ("kcal", "proteine"):
        fascia = p.obiettivi.get(chiave) if isinstance(p.obiettivi, dict) else None
        controlla(isinstance(fascia, (tuple, list)) and len(fascia) == 2 and all(map(numero, fascia))
                  and fascia[0] <= fascia[1], f"OBIETTIVI: serve \"{chiave}\": (minimo, massimo)")
    leggi_pasti(p)
    if p.allenamento:
        a = p.allenamento
        controlla(all(0 <= g <= 6 for g in a["giorni"]), "ALLENAMENTO: i giorni vanno da 0 (lunedì) a 6 (domenica)")
        controlla(re.fullmatch(r"\d\d:\d\d", a["ora"]), f"ALLENAMENTO: ora {a['ora']!r}, serve HH:MM")
    leggi_prodotti(p)
    p.alimenti = leggi_alimenti(p.alimenti, p.prodotti)
    unita_prodotti(p)
    p.ricette = leggi_ricette(p)
    leggi_settimana(p)
    for nome, q, porzione in p.fuori_pasto:
        controlla(p.alimenti.get(nome) is not None, f"FUORI_PASTO: '{nome}' non è in ALIMENTI (o non conta)")
    for reparto, nome in p.spesa_extra:
        controlla(reparto in p.reparti, f"SPESA_EXTRA, '{nome}': il reparto '{reparto}' non è in REPARTI")
    for pattern, chiave in p.scontrino:
        controlla(chiave in p.prodotti, f"SCONTRINO: '{pattern}' punta a '{chiave}', che non è in PRODOTTI")
    for riga, atteso in p.prove_scontrino:
        trovato = prodotto_scontrino(p, riga)
        controlla(trovato == atteso, f"PROVE_SCONTRINO, '{riga}': trovo {trovato} invece di {atteso}")
    return p


def leggi_pasti(p):
    controlla(isinstance(p.pasti, dict) and p.pasti, "PASTI: serve {\"pranzo\": \"13:00\", ...}")
    for pasto, ora in p.pasti.items():
        controlla(pasto in NOMI_PASTI, f"PASTI: '{pasto}' non è un pasto ({', '.join(NOMI_PASTI)})")
        controlla(isinstance(ora, str) and re.fullmatch(r"\d\d:\d\d", ora), f"PASTI, {pasto}: ora {ora!r}, serve HH:MM")
    ordine = [p.pasti[k] for k in NOMI_PASTI if k in p.pasti]
    controlla(ordine == sorted(ordine), f"PASTI: gli orari vanno in ordine ({', '.join(NOMI_PASTI)})")
    p.pasti = {k: p.pasti[k] for k in NOMI_PASTI if k in p.pasti}


def leggi_prodotti(p):
    controlla(isinstance(p.reparti, (list, tuple)), "REPARTI: serve l'elenco dei reparti della spesa")
    for chiave, v in p.prodotti.items():
        controlla(isinstance(v, dict), f"PRODOTTI, '{chiave}': serve dict(reparto=..., nome=..., conf=..., ...)")
        extra = set(v) - CAMPI_PRODOTTO
        controlla(not extra, f"PRODOTTI, '{chiave}': campi sconosciuti {sorted(extra)}")
        for campo in ("reparto", "nome", "conf", "conf_nome"):
            controlla(campo in v, f"PRODOTTI, '{chiave}': manca {campo}")
        controlla(v["reparto"] in p.reparti, f"PRODOTTI, '{chiave}': il reparto '{v['reparto']}' non è in REPARTI")
        controlla(numero(v["conf"]) and v["conf"] > 0, f"PRODOTTI, '{chiave}': conf deve essere un numero")


def leggi_alimenti(grezzi, prodotti):
    """Nome dell'ingrediente -> None (non conta) o dict(kcal, prot, a_pezzo, prodotto), con i "come" risolti."""
    out = {}

    def uno(nome, catena=()):
        if nome in out:
            return out[nome]
        v = grezzi[nome]
        if v is None:
            out[nome] = None
            return None
        controlla(isinstance(v, dict), f"ALIMENTI, '{nome}': serve dict(kcal=..., prot=...) oppure None")
        extra = set(v) - CAMPI_ALIMENTO
        controlla(not extra, f"ALIMENTI, '{nome}': campi sconosciuti {sorted(extra)}")
        v = dict(v)
        if "come" in v:
            altro = v.pop("come")
            controlla(altro in grezzi, f"ALIMENTI, '{nome}': come='{altro}', che non è in ALIMENTI")
            controlla(altro not in catena + (nome,), f"ALIMENTI, '{nome}': i 'come' girano in tondo")
            base = uno(altro, catena + (nome,))
            controlla(base is not None, f"ALIMENTI, '{nome}': come='{altro}', che non conta (None)")
            v = {**base, **v}
        controlla(numero(v.get("kcal")) and numero(v.get("prot")), f"ALIMENTI, '{nome}': servono kcal e prot")
        v.setdefault("a_pezzo", False)
        v.setdefault("prodotto", None)
        controlla(v["prodotto"] is None or v["prodotto"] in prodotti,
                  f"ALIMENTI, '{nome}': il prodotto '{v['prodotto']}' non è in PRODOTTI")
        out[nome] = v
        return v

    for nome in grezzi:
        uno(nome)
    return out


def unita_prodotti(p):
    """Un prodotto si conta a pezzi se i suoi alimenti sono a pezzo: tutti, o nessuno."""
    for chiave, v in p.prodotti.items():
        a_pezzo = {a["a_pezzo"] for a in p.alimenti.values() if a and a["prodotto"] == chiave}
        controlla(len(a_pezzo) <= 1, f"PRODOTTI, '{chiave}': alcuni alimenti lo contano a pezzi, altri a grammi")
        v["a_pezzo"] = a_pezzo == {True}
        controlla(not (v["a_pezzo"] and v.get("pezzo")),
                  f"PRODOTTI, '{chiave}': 'pezzo' (grammi di un pezzo) vale solo per i prodotti pesati a grammi")
    # Dopo il giro sopra: serve l'unità di tutti.
    for chiave, v in p.prodotti.items():
        controlla_sostituti(p, "PRODOTTI", chiave, v.get("sostituti", ()))


def controlla_sostituti(p, dove, chiave, sostituti):
    """Il sostituto prende la stessa quantità, quindi serve la stessa unità."""
    for s in sostituti:
        controlla(s in p.prodotti and s != chiave, f"{dove}, '{chiave}': il sostituto '{s}' non è un altro prodotto")
        controlla(p.prodotti[s]["a_pezzo"] == p.prodotti[chiave]["a_pezzo"],
                  f"{dove}, '{chiave}': il sostituto '{s}' si conta in un'altra unità (pezzi e grammi)")


def leggi_ingredienti(p, voci, dove, campo):
    """[(nome, quantità, come mostrarla)] da voci "Caffè", ("Spaghetti", 120) o ("Birra", 1, "33 cl")."""
    out = []
    for voce in voci:
        if isinstance(voce, str):
            voce = (voce, "")
        controlla(isinstance(voce, (tuple, list)) and len(voce) in (2, 3),
                  f"{dove}, {campo}: voce {voce!r}, serve \"nome\", (nome, quantità) o (nome, quantità, testo)")
        nome, q, *testo = voce
        controlla(nome in p.alimenti, f"{dove}: l'ingrediente '{nome}' non è in ALIMENTI")
        a = p.alimenti[nome]
        if a is None:
            controlla(isinstance(q, str) and not testo,
                      f"{dove}: '{nome}' non conta (None in ALIMENTI): scrivi solo il nome o (nome, \"quanto\")")
            out.append((nome, None, q))
            continue
        controlla(numero(q) and q > 0,
                  f"{dove}: '{nome}' vuole una quantità in {'pezzi' if a['a_pezzo'] else 'grammi'}, non {q!r}")
        out.append((nome, q, testo[0] if testo else (str(q) if a["a_pezzo"] else f"{q} g")))
    return out


def leggi_ricette(p):
    ricette, ids = {}, {}
    for r in p.ricette:
        controlla(isinstance(r, dict) and isinstance(r.get("nome"), str), f"RICETTE: voce senza nome ({str(r)[:60]})")
        nome = r["nome"]
        extra = set(r) - CAMPI_RICETTA
        controlla(not extra, f"{nome}: campi sconosciuti {sorted(extra)}")
        controlla(nome not in ricette, f"RICETTE: '{nome}' c'è due volte")
        controlla(slug(nome) not in ids, f"RICETTE: '{nome}' e '{ids.get(slug(nome))}' danno lo stesso id")
        ids[slug(nome)] = nome
        controlla(r.get("ingredienti"), f"{nome}: mancano gli ingredienti")
        ricette[nome] = {
            "nome": nome, "minuti": r.get("minuti", 0), "passi": list(r.get("passi", [])), "nota": r.get("nota"),
            "fuori": bool(r.get("fuori")), "ripiego": bool(r.get("ripiego")),
            "ingredienti": leggi_ingredienti(p, r["ingredienti"], nome, "ingredienti"),
            "toglie": leggi_ingredienti(p, r.get("toglie", []), nome, "toglie"),
            "pdf": r.get("pdf"), "titolo_pdf": r.get("titolo_pdf"),
        }
        controlla(numero(ricette[nome]["minuti"]), f"{nome}: minuti deve essere un numero")
        sostituti = r.get("sostituti", {})
        controlla(isinstance(sostituti, dict), f"{nome}: sostituti deve essere {{prodotto: [prodotti]}}")
        for chiave, lista in sostituti.items():
            controlla(chiave in prodotti_di(p, ricette[nome]), f"{nome}: sostituti, la ricetta non usa '{chiave}'")
            controlla_sostituti(p, nome, chiave, lista)
        ricette[nome]["sostituti"] = {chiave: list(lista) for chiave, lista in sostituti.items()}
    return ricette


def leggi_settimana(p):
    controlla(isinstance(p.settimana, dict) and set(p.settimana) == set(GIORNI),
              f"SETTIMANA: servono i sette giorni ({', '.join(GIORNI)})")
    settimana = []
    for giorno in GIORNI:
        pasti = p.settimana[giorno]
        controlla(isinstance(pasti, dict) and pasti, f"SETTIMANA, {giorno}: serve {{\"pranzo\": [ricette], ...}}")
        for pasto, nomi in pasti.items():
            controlla(pasto in p.pasti, f"SETTIMANA, {giorno}: il pasto '{pasto}' non è in PASTI")
            controlla(isinstance(nomi, (list, tuple)) and nomi, f"SETTIMANA, {giorno} {pasto}: serve almeno una ricetta")
            for n in nomi:
                controlla(n in p.ricette, f"SETTIMANA, {giorno} {pasto}: la ricetta '{n}' non è in RICETTE")
            controlla(len(set(nomi)) == len(nomi), f"SETTIMANA, {giorno} {pasto}: una ricetta ripetuta")
        settimana.append((giorno, {k: list(pasti[k]) for k in p.pasti if k in pasti}))
    p.settimana = settimana
    usate = {n for _, pasti in settimana for nomi in pasti.values() for n in nomi}
    for n in p.ricette:
        if n not in usate:
            print(f"Attenzione: la ricetta '{n}' non è in SETTIMANA, l'app non la vede")


# --- Conti ---

def valori(a, q):
    if a is None:
        return 0, 0
    if a["a_pezzo"]:
        return a["kcal"] * q, a["prot"] * q
    return a["kcal"] * q / 100, a["prot"] * q / 100


def totali(p, r):
    """Sottrae gli ingredienti di "toglie", un altro pasto che salti."""
    kcal = prot = 0
    for segno, voci in ((1, r["ingredienti"]), (-1, r["toglie"])):
        for nome, q, _ in voci:
            k, pr = valori(p.alimenti[nome], q)
            kcal += segno * k
            prot += segno * pr
    return kcal, prot


def prodotti_di(p, r):
    """Grammi, o pezzi per i prodotti a pezzo."""
    qta = {}
    for nome, q, _ in r["ingredienti"]:
        a = p.alimenti[nome]
        if a and a["prodotto"]:
            qta[a["prodotto"]] = qta.get(a["prodotto"], 0) + q
    return qta


def pasti_del_giorno(p):
    """(giorno, pasto, ricetta del piano, alternative) per ogni pasto della settimana."""
    for giorno, pasti in p.settimana:
        for pasto, nomi in pasti.items():
            yield giorno, pasto, p.ricette[nomi[0]], [p.ricette[n] for n in nomi[1:]]


def prodotto_scontrino(p, descrizione):
    return next((chiave for pattern, chiave in p.scontrino if re.search(pattern, descrizione)), None)


def fabbisogno(p):
    """Piatto del piano più, per prodotto, l'alternativa che ne usa di più; ripieghi e fuori casa esclusi."""
    need, oltre = {}, {}  # oltre: extra delle alternative per i prodotti una_confezione
    for _, _, base, alternative in pasti_del_giorno(p):
        usa = prodotti_di(p, base)
        for chiave, q in usa.items():
            need[chiave] = need.get(chiave, 0) + q
        extra = {}
        for alt in alternative:
            if alt["ripiego"] or alt["fuori"]:
                continue
            altro = prodotti_di(p, alt)
            for chiave in set(altro) | set(usa):
                extra[chiave] = max(extra.get(chiave, 0), altro.get(chiave, 0) - usa.get(chiave, 0))
        for chiave, q in extra.items():
            dove = oltre if p.prodotti[chiave].get("una_confezione") else need
            if q:
                dove[chiave] = dove.get(chiave, 0) + q
    inutili = [k for k in p.prodotti if k not in need]
    controlla(not inutili, f"PRODOTTI: {', '.join(inutili)} non li usa nessuna ricetta della settimana")
    return need, oltre


def righe_spesa(p):
    need, _ = fabbisogno(p)
    rows = []
    for chiave, v in p.prodotti.items():
        pezzo = 1 if v["a_pezzo"] else v.get("pezzo")
        qty = need[chiave] if pezzo is None else math.ceil(need[chiave] / pezzo)
        row = {"id": chiave, "reparto": v["reparto"], "nome": v["nome"],
               "serve": f"{qty} g" if pezzo is None else str(qty),
               "formato": f"{math.ceil(need[chiave] / v['conf'])} × {v['conf_nome']}",
               # Per l'app, nell'unità delle ricette; "pezzo" = grammi di un pezzo, per mostrarli.
               "q": need[chiave], "conf": v["conf"], "confNome": v["conf_nome"]}
        if pezzo:
            row["pezzo"] = pezzo
        for campo in ("sgocciolato", "fresco"):
            if v.get(campo):
                row[campo] = True
        for campo in ("tieni", "congela", "scongela"):
            if v.get(campo):
                row[campo] = v[campo]
        if v.get("sostituti"):
            row["sostituti"] = list(v["sostituti"])
        rows.append(row)
    return rows


def controlla_fasce(p):
    """Ogni giornata, con il piatto del piano e con ogni alternativa da sola, resta nelle fasce di OBIETTIVI."""
    (kmin, kmax), (pmin, pmax) = p.obiettivi["kcal"], p.obiettivi["proteine"]
    giorni, effetti = {}, {}
    for giorno, pasti in p.settimana:
        kcal = prot = 0
        for nomi in pasti.values():
            k, pr = totali(p, p.ricette[nomi[0]])
            kcal += k
            prot += pr
        controlla(kmin <= kcal <= kmax, f"{giorno}: {kcal:.0f} kcal, fuori dalla fascia {kmin}-{kmax}")
        controlla(pmin <= prot <= pmax, f"{giorno}: {prot:.0f} g di proteine, fuori dalla fascia {pmin}-{pmax}")
        print(f"{giorno.upper():10} {kcal:5.0f} kcal  {prot:4.0f} g proteine")
        giorni[giorno] = kcal, prot
    for giorno, _, base, alternative in pasti_del_giorno(p):
        bk, bp = totali(p, base)
        for alt in alternative:
            if alt["fuori"]:
                continue  # fuori casa: non sai cosa mangi
            ak, ap = totali(p, alt)
            kcal, prot = giorni[giorno][0] - bk + ak, giorni[giorno][1] - bp + ap
            controlla(kmin <= kcal <= kmax, f"{alt['nome']}, {giorno}: la giornata va a {kcal:.0f} kcal")
            controlla(pmin <= prot <= pmax, f"{alt['nome']}, {giorno}: la giornata va a {prot:.0f} g di proteine")
            effetti.setdefault(alt["nome"], (ak - bk, ap - bp))
    for nome, (k, pr) in effetti.items():
        print(f"  {nome:48} {k:+5.0f} kcal {pr:+5.1f} g proteine")
    for chiave, q in fabbisogno(p)[1].items():
        v = p.prodotti[chiave]
        print(f"Attenzione: con le alternative una settimana può usare fino a {q}{'' if v['a_pezzo'] else ' g'} di "
              f"{v['nome'].lower()} in più della spesa (una_confezione): quei giorni toglilo da un altro pasto.")
    return effetti


# --- JSON dell'app ---

def ricetta_json(p, r):
    kcal, prot = totali(p, r)
    out = {"nome": r["nome"], "ingredienti": [[nome, testo] for nome, _, testo in r["ingredienti"]],
           "passi": r["passi"], "minuti": r["minuti"], "kcal": round(kcal), "prot": round(prot),
           "prodotti": prodotti_di(p, r), "fuori": r["fuori"]}
    if r["ripiego"]:
        out["ripiego"] = True
    if r["nota"]:
        out["nota"] = r["nota"]
    if r["sostituti"]:
        out["sostituti"] = r["sostituti"]
    # L'app li sottrae quando segni un ingrediente come non mangiato.
    out["valori"] = []
    for nome, q, _ in r["ingredienti"]:
        a = p.alimenti[nome]
        k, pr = valori(a, q)
        v = {"kcal": round(k), "prot": round(pr, 1)} if a else {"kcal": 0, "prot": 0}
        if a and a["prodotto"]:
            v["prodotto"], v["q"] = a["prodotto"], q
        out["valori"].append(v)
    return out


def esporta(p):
    ricette, settimana = {}, []
    for giorno, pasti in p.settimana:
        for nomi in pasti.values():
            for n in nomi:
                ricette.setdefault(slug(n), ricetta_json(p, p.ricette[n]))
        settimana.append({"giorno": giorno.capitalize(),
                          "pasti": {pasto: [slug(n) for n in nomi] for pasto, nomi in pasti.items()}})
    cibi = []
    for nome, q, porzione in p.fuori_pasto:
        a = p.alimenti[nome]
        kcal, prot = valori(a, q)
        cibi.append({"id": slug(nome), "nome": nome, "porzione": porzione, "kcal": round(kcal), "prot": round(prot),
                     "prodotti": {a["prodotto"]: q} if a["prodotto"] else {}})
    print(f"JSON: {len(ricette)} ricette")
    return {
        "obiettivi": p.obiettivi,
        "inizio": p.inizio,
        "fuso": p.fuso,
        "allenamento": p.allenamento,
        "pasti": [{"id": k, "nome": NOMI_PASTI[k], "ora": ora} for k, ora in p.pasti.items()],
        "settimana": settimana,
        "ricette": ricette,
        "cibi": cibi,
        "spesa": righe_spesa(p),
        "spesaExtra": [{"reparto": s, "nome": n} for s, n in p.spesa_extra],
        "reparti": list(p.reparti),
        "scontrino": [list(s) for s in p.scontrino],
        "articoli": p.articoli,
        "note": [{"titolo": t, "testo": x} for t, x in p.note],
    }


# --- HTML del PDF ---

def shopping_html(p):
    rows = {s: [] for s in p.reparti}
    for r in righe_spesa(p):
        print(f"  {r['nome']:32} {r['serve']:>6}  {r['formato']}")
        rows[r["reparto"]].append((r["nome"], r["serve"], r["formato"]))
    for section, name in p.spesa_extra:
        rows[section].append((name, "", "quando finisce"))
    blocks = "".join(
        f'<div class="sez"><h2>{escape(section)}</h2><table>'
        '<tr><th></th><th>Prodotto</th><th>Serve</th><th>Da comprare</th></tr>'
        + "".join(f'<tr><td><span class="box"></span></td><td>{escape(n)}</td>'
                  f'<td class="q">{escape(a)}</td><td>{escape(b)}</td></tr>' for n, a, b in items)
        + "</table></div>"
        for section, items in rows.items()
    )
    return f"""<div class="spesa"><h1>Lista della spesa settimanale</h1>
<p class="sub">{p.testo_spesa}</p>
<div class="cols">{blocks}</div></div>"""


def ingredient_text(nome, qta):
    if not qta:
        return nome
    if qta == "mezzo":
        return f"Mezzo {nome.lower()}"
    return f"{nome} {qta}" if not qta[0].isdigit() or " " in qta else f"{qta} {nome.lower()}"


def varianti_html(p, effetti):
    cards = []
    for v in (r for r in p.ricette.values() if r["pdf"] and r["nome"] in effetti):
        kcal = effetti[v["nome"]][0]
        effetto = ("come il piatto originale" if abs(kcal) < 50
                   else f"circa {round(kcal, -1):+.0f} kcal sulla giornata, che resta in fascia")
        cards.append(
            f'<div class="ric"><h2>{escape(v["titolo_pdf"] or v["nome"])}</h2>'
            f'<div class="dish">{escape(v["pdf"])}</div>'
            "<h3>Ingredienti</h3><ul>"
            + "".join(f"<li>{escape(ingredient_text(n, t))}</li>" for n, _, t in v["ingredienti"]) + "</ul>"
            "<h3>Come si fa</h3><ol>" + "".join(f"<li>{escape(x)}</li>" for x in v["passi"]) + "</ol>"
            f'<div class="eff">Calorie: {effetto}.</div></div>'
        )
    if not cards:
        return ""
    return f"""<div class="varianti"><h1>Varianti sfiziose</h1>
<p class="sub">Facoltative: sostituiscono il piatto indicato quando ne hai voglia. Usano ingredienti già in
lista, e le quantità della spesa le coprono già. Nell'app trovi anche altre alternative.</p>
<div class="rcols">{"".join(cards)}</div></div>"""


def build(p):
    effetti = controlla_fasce(p)
    cols = []
    for giorno, pasti in p.settimana:
        kcal = prot = 0
        body = ""
        for pasto, nomi in pasti.items():
            r = p.ricette[nomi[0]]
            k, pr = totali(p, r)
            kcal += k
            prot += pr
            body += (f"<h3>{NOMI_PASTI[pasto]} · {p.pasti[pasto]}</h3>"
                     f'<div class="dish">{escape(r["nome"])}</div>'
                     + "".join(f"<div>{escape(f'{n}: {t}' if t else n)}</div>" for n, _, t in r["ingredienti"]))
        cols.append(
            f"<td><h2>{giorno.upper()}</h2>{body}"
            f'<div class="tot">circa {round(kcal, -1):.0f} kcal<br>{prot:.0f} g proteine</div></td>'
        )
    notes = "".join(f"<p><b>{escape(t)}.</b> {escape(x)}</p>" for t, x in p.note)
    return f"""<!doctype html>
<html lang="it"><head><meta charset="utf-8">
<title>{escape(p.titolo)}</title>
<style>
@page {{ size: A4 landscape; margin: 10mm; }}
body {{ font: 8.5pt/1.25 Verdana, Arial, sans-serif; color: #111; margin: 0; }}
h1 {{ font-size: 13pt; margin: 0 0 2mm; }}
.sub {{ color: #555; margin-bottom: 4mm; }}
table {{ width: 100%; border-collapse: collapse; }}
.piano {{ table-layout: fixed; }}
.piano td {{ vertical-align: top; padding: 0 2.5mm; border-left: 1px solid #999; }}
.piano td:first-child {{ border-left: 0; padding-left: 0; }}
.spesa {{ break-before: page; }}
.cols {{ columns: 3; column-gap: 8mm; }}
.sez {{ margin-bottom: 3mm; }}
.sez:last-child {{ break-before: column; }}
.sez h2 {{ font-size: 9.5pt; margin: 0 0 1mm; break-after: avoid; }}
.sez tr {{ break-inside: avoid; }}
.sez table {{ table-layout: fixed; font-size: 8pt; }}
.sez th {{ text-align: left; font-weight: normal; color: #555; font-size: 7.5pt; }}
.sez th:nth-child(1) {{ width: 4mm; }}
.sez th:nth-child(2) {{ width: 36%; }}
.sez th:nth-child(3) {{ width: 13%; text-align: right; padding-right: 3mm; }}
.sez td, .sez th {{ vertical-align: top; padding: 0.7mm 1.5mm 0.7mm 0; border-bottom: 1px solid #ddd; }}
.sez td.q {{ white-space: nowrap; text-align: right; padding-right: 3mm; }}
.box {{ display: inline-block; width: 2.6mm; height: 2.6mm; border: 1px solid #333; }}
h2 {{ font-size: 11pt; margin: 0 0 2mm; }}
h3 {{ font-size: 8.5pt; margin: 3mm 0 0.5mm; }}
.dish {{ font-style: italic; color: #444; }}
.tot {{ margin-top: 4mm; padding-top: 1.5mm; border-top: 1px solid #999; font-weight: bold; }}
.notes {{ break-before: page; columns: 2; column-gap: 10mm; font-size: 9.5pt; line-height: 1.4; }}
.notes h1 {{ column-span: all; margin-bottom: 4mm; }}
.notes p {{ margin: 0 0 3mm; break-inside: avoid; }}
.varianti {{ break-before: page; }}
.rcols {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 2mm 8mm; font-size: 7.5pt; line-height: 1.2; }}
.ric {{ break-inside: avoid; padding-bottom: 1.5mm; border-bottom: 1px solid #ccc; }}
.ric h2 {{ margin-bottom: 0.5mm; }}
.ric h3 {{ margin-top: 1.5mm; }}
.ric ul {{ columns: 2; column-gap: 4mm; }}
.ric ul, .ric ol {{ margin: 0.5mm 0 1mm; padding-left: 5mm; }}
.ric li {{ margin-bottom: 0.2mm; }}
.eff {{ font-weight: bold; margin-top: 1mm; }}
</style></head><body>
<h1>{escape(p.titolo)}</h1>
<div class="sub">{escape(p.sottotitolo)}</div>
<table class="piano"><tr>{"".join(cols)}</tr></table>
{f'<div class="notes"><h1>Come usare il piano</h1>{notes}</div>' if notes else ""}
{shopping_html(p)}
{varianti_html(p, effetti)}
</body></html>"""


if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    try:
        piano = leggi_piano(sys.argv[1])
        html = build(piano)
        dati = esporta(piano) if len(sys.argv) > 3 else None
    except ErrorePiano as e:
        sys.exit(f"Errore nel piano: {e}")
    with open(sys.argv[2], "w", encoding="utf-8") as f:
        f.write(html)
    if dati:
        with open(sys.argv[3], "w", encoding="utf-8") as f:
            json.dump(dati, f, ensure_ascii=False, indent=1)
