# Multiplayer — spelerhandleiding

**Voor:** vrienden die samen willen spelen op [d-game.nl](https://www.d-game.nl)  
**Laatst bijgewerkt:** 2026-08-24  
**Technische details:** [p2p-multiplayer.md](./p2p-multiplayer.md)

---

## In het kort

1. **Iemand start een room** (host).
2. **Iedereen opent dezelfde link** of vult de roomcode in.
3. **Iedereen stemt op een spel**; de host start het winnende spel.
4. **Speelen** — chat en spelerlijst blijven zichtbaar; daarna terug stemmen.
5. **Host houdt een tab open** zolang jullie samen spelen.

Geen account nodig. Alles werkt in de browser (P2P).

---

## Stap voor stap

### 1. Room starten (host)

1. Open [d-game.nl](https://www.d-game.nl/#index.html).
2. Tik op **Start / join room** (of ga naar `#room/`).
3. Tik **Start room**.
4. Deel de **QR** of **link** met je groep (één link voor de hele avond).

Je ziet een **roomcode** (6 tekens, bijv. `AB7K2M`).

### 2. Meedoen (gast)

**Optie A — link:** open de link die de host stuurde (WhatsApp, etc.).

**Optie B — code:** ga naar `#room/`, vul de code in, tik **Join**.

Vul desnoods je **naam** in vóór je joint (via Geheugen-tab of in het spel).

### 3. Spel kiezen (stemmen)

Als iedereen verbonden is, zie je **stemkaarten** voor spellen:

| Spelers | Typisch beschikbaar |
|---------|---------------------|
| 2 | Tic-tac-toe, Ganzenbord, RobotRun |
| 3–5 | Ganzenbord, RobotRun |
| 6 | Alleen Ganzenbord |

Grijze spellen passen **niet** bij jullie groepsgrootte. **Iedereen stemt**; de **host** start het spel met de meeste stemmen.

### 4. Chat

Onder de spelerlijst staat **Chat**:

- In de lobby: chat staat **open** — typ berichten voor je groep.
- **Tijdens een spel:** chat is **ingeklapt**. Zie je een **badge** met een getal? Tik op Chat om nieuwe berichten te lezen.
- Chat blijft staan als je teruggaat naar stemmen; berichten gaan niet verloren tussen spelrondes.

### 5. Spelen en terug

- Tijdens het spel blijft de **room-verbinding** open.
- Na afloop ga je automatisch (of via **Terug naar stemmen**) terug naar het stemmenu.
- **Room verlaten** sluit je verbinding; de room blijft bestaan zolang de host online is.

### 6. Later verder spelen

Op de **homepagina** verschijnt “Ga verder in room” als je recent in een room zat. Of: tab **Lobby** → **Mijn rooms** → **Open** of **Host opnieuw** (als jij host was).

---

## Belangrijk om te weten

| Vraag | Antwoord |
|-------|----------|
| Wie is de host? | Wie de room start. Die start het winnende spel na stemmen. |
| Moet de host online blijven? | **Ja.** Sluit de host-tab, dan valt de verbinding weg. |
| Host weg — wat nu? | Iemand opent de room opnieuw met **Host opnieuw** (`?as=host` in de link). Zelfde code, voortgang uit opgeslagen log (zelfde browser). |
| Verkeerd spel in oude link? | Gebruik de **room-link** (`#room/?room=CODE`), niet een oud spel-specifieke link. |
| Solo / zonder internet? | Open een spel → **Op dit apparaat** (hotseat). Geen room nodig. |

---

## Oude links (legacy)

Links zoals `#tic-tac-toe/?room=CODE` openen **alleen dat spel** met eigen P2P-lobby.  
Voor een avond met meerdere spellen: gebruik altijd **`#room/?room=CODE`**.

---

## Problemen?

| Symptoom | Probeer |
|----------|---------|
| “Verbinding verbroken” | Host-tab open? Opnieuw verbinden / room opnieuw openen via Lobby. |
| “Room vol” | Max 6 spelers in één room. |
| Spel start niet | Alleen host kan starten; minimaal 2 spelers voor de meeste spellen. |
| QR werkt niet | Deel de tekstlink; code handmatig invoeren op `#room/`. |

Meer technisch: tab **Netwerk** test pure P2P (ping/pong) zonder spel.
