# RobotRun slot-tabs + Merge/Combo — design

Datum: 2026-08-26  
Status: **geïmplementeerd**  
Scope: `multi-game/robotrun` (UI + engine + P2P intent)  
Aanpak: **tabs + receptentabel in config**

---

## 1. Probleem & doel

Spelers hebben alleen 5 programma-registers. Er is geen manier om zwakke moves te combineren tot sterkere (of speciale) moves, en upgrades zoals Crab Walk / Fourth Gear zitten alleen in de trek-pool.

**Doel:**

1. **Tab-systeem** boven de slot-rij: meerdere slot-views.
2. Tab **Program**: bestaande 5 registers (schade-locks ongewijzigd).
3. Tab **Merge** (combo): tot 3 input-slots + 1 output-preview; merge meerdere move-kaarten tot één andere kaart die **terug in de hand** komt.
4. Onbeperkt mergen tijdens programmeren.
5. Standaard-recepten + recepten die een **upgrade unlockt**.

**Buiten v1:** drag-and-drop tussen tabs, merge tijdens executing, recept-editor in de UI, balance-pass buiten de vastgelegde recepten.

---

## 2. UI

### Tabs

Boven de slot-rij:

| Tab | Inhoud |
|-----|--------|
| **Program** | 5 register-slots (huidig gedrag, incl. vastgezette schade-locks) |
| **Merge** | 3 input-slots + 1 output-slot (preview, niet programmeerbaar) |

- Hand blijft onder de slots.
- Tik op een handkaart vult het eerste lege slot van de **actieve tab** (register óf merge-input).
- Tik op een gevulde input/register haalt de kaart terug (zoals nu).
- Op Merge: output toont preview bij geldig recept; bevestigen via knop **Merge** of tik op output → inputs verdwijnen uit hand, 1 nieuwe kaart in hand.
- Tijdens `executing` / `ready` / match-gates: Program-tab read-only of panel collapsed zoals nu; Merge niet bruikbaar buiten `programming`.
- Na bevestigen programma: open Program-slots verborgen; schade-locks blijven zichtbaar (bestaand gedrag).

---

## 3. Recepten & regels

### Matching

- 2 of 3 inputs; lege merge-slots mogen. Merge met **2 of 3** kaarten (niet met 1).
- Match op **multiset van card types** (volgorde in slots telt niet).
- Geen match → output leeg, Merge disabled.
- Alleen kaarten die **nog in de hand** staan (niet al in een Program-register).
- Output: **nieuw card-id**, `priority` = afgerond gemiddelde van de input-priorities.
- Onbeperkt merges per programmeerfase.

### Standaard (geen upgrade)

| Inputs | Output |
|--------|--------|
| 3× `move1` | `move2` |
| 3× `move2` | `move3` |
| 3× `backup` | `backup2` |
| 3× `turnL` | `uturn` |
| 3× `turnR` | `uturn` |
| 3× `uturn` | `wait` (**STIL** — rondje / geen verplaatsing) |

Nieuwe kaart in `CONFIG.CARD_TYPES`: `{ type: 'wait', label: 'STIL', icon: '⏸', priorityBase: … }`.  
`executeCardAction`: `wait` doet niets (alleen log).

`wait` zit **niet** in de normale trek-pool; alleen via merge (tenzij later anders bepaald).

### Crab Walk (`requiresUpgrade: 'crabWalk'`)

| Inputs | Output |
|--------|--------|
| `move1` + `turnL` | `strafeL` (KRAB L) |
| `move1` + `turnR` | `strafeR` (KRAB R) |

### Fourth Gear (`requiresUpgrade: 'fourthGear'`)

| Inputs | Output |
|--------|--------|
| `move3` + `move1` | `move4` |
| `move2` + `move2` | `move4` |
| `move1` + `move1` + `move2` | `move4` |
| `move3` + `move2` | `move4` |

Upgrade-recepten zijn alleen beschikbaar als de robot die upgrade heeft. Zonder upgrade: geen match (ook al zouden de types kloppen).

Standaard levert **geen** MOVE 4 meer via 3× MOVE 3; MOVE 4 alleen via Fourth Gear-recepten (of bestaande Fourth Gear hand-kaarten).

---

## 4. Engine, data & P2P

### Config

```js
CONFIG.MERGE_RECIPES = [
  { inputs: ['move1', 'move1', 'move1'], output: 'move2' },
  // …
  { inputs: ['move1', 'turnL'], output: 'strafeL', requiresUpgrade: 'crabWalk' },
  { inputs: ['move3', 'move1'], output: 'move4', requiresUpgrade: 'fourthGear' },
];
```

`inputs` length 2 of 3. Lookup: sorteer types, vergelijk met gesorteerde recept-inputs.

### UI-state (lokaal, niet canoniek tot merge-commit)

- `slotTab: 'program' | 'merge'`
- `mergeInputs: [null, null, null]`
- Preview: `resolveMergeRecipe(mergeInputs, robot)` → output type of null

### Engine API

- `resolveMergeRecipe(cards, robot)` → recipe | null  
- `mergeHandCards(robotId, cardIds)` →  
  - fase `programming`  
  - kaarten in hand, niet in registers  
  - recept match + upgrade ok  
  - verwijder inputs uit hand  
  - push nieuwe kaart (type uit recept, nieuwe id, avg priority)  
  - emit state  

### P2P

- Hotseat: directe engine-call.  
- Room: gast stuurt intent `rr_intent_merge` `{ robotId, cardIds }` → host valideert seat-bound (bestaande intent-bind) → `mergeHandCards` → snapshot.  
- Merge-UI slots zelf niet in snapshot; alleen handwijziging is canoniek.

### Ongewijzigd

- Schade-locks / `lockedRegisterMemory`  
- Register commit / Play / stepped execution  

---

## 5. Testchecklist (handmatig)

1. Tabs wisselen Program ↔ Merge; hand vult juiste slots.  
2. 3× MOVE 1 → MERGE → MOVE 2 in hand; inputs weg.  
3. 2× MERGE: MOVE 1 + TURN L zonder Crab → geen output; mét Crab Walk → KRAB L.  
4. Fourth Gear-recepten → MOVE 4; zonder upgrade geen match.  
5. 3× U-TURN → STIL; STIL doet bij Play niets.  
6. Kaart in register mag niet in merge-inputs.  
7. P2P: gast merge → host hand sync voor beide.  
8. Onbeperkt meerdere merges in één ronde.

---

## 6. Beslissingen (vast)

| Keuze | Besluit |
|-------|---------|
| Aanpak | Tabs + `MERGE_RECIPES` config |
| Output bestemming | Terug in hand |
| Aantal merges | Onbeperkt |
| Input count | 2 of 3 (niet alle slots verplicht) |
| Upgrade-recepten | Crab Walk, Fourth Gear (v1) |
| STIL | Nieuw type `wait`, alleen via 3× U-TURN |
| Priority output | Afgerond gemiddelde inputs |
