# Comment ca marche le scheduler (les maths)

## 1. Blocs de temp

- **Config:** `competitionStartTime`, `competitionEndTime`, `blockDurationMinutes` (ex: 08:00, 20:30, 30).
- **Conversion:** debut/fin en minutes depuis minuit: `startMin = 8*60 = 480`, `endMin = 1230`.
- **Blocs:** tous les 30 min un nouveau bloc. Block 0: 08:00–08:30, Block 1: 08:30–09:00, etc. On arrete quand le prochain depasse end.
- **Formule:** pour l’index `i`, debut = `startMin + i * blockDurationMinutes`. Exemple 08:00–20:30 → 25 blocs (0–24).

---

## 2. Gens et “disponnible”

- Chaque personne a un **schedule**: un slot par bloc, au debut tout `"Open"`.
- **Dispo pour un role (dans un bloc):** le slot est `"Open"`, pas drive team, et pas exclu par `unavailableTimes`.

Drive team est jamais dispo pour les autres roles; que Drive ou Open.

---

## 3. Ordre d’assignation (par bloc)

Pour chaque bloc on remplit dans cet ordre. Les etapes suivantes peuvent pas ecraser.

1. **Drive** (max 5)
2. **Mech Pit** (3), **Ctrls Pit** (1), **SW Pit** (1)
3. **Journalist** (que dans 4 blocs: milieu + fin)
4. **Strategy** (2–4, avec reserve)
5. **Media** (1, que blocs pairs → ~50% du jour)
6. **Scouting!** (apres avoir traité tous les blocs une fois)

---

## 4. Drive (max 5 par bloc)

- Que les gens avec `driveTeam === true`.
- **Cap:** 5 par bloc.
- **Qui:** round-robin par bloc: `driveTeamPeople[(timeIdx + k) % length]` jusqu’a 5 assignés. Donc rotation, max 5 Drive par bloc.

---

## 5. Pits (Mech / Ctrls / SW)

- **Mech Pit:** 3 par bloc. Audrey (pit manager) a toujours un slot Mech Pit si elle est Open. Les 2 autres: que `wantsPits && wantsMechPit`.
- **Ctrls Pit:** 1 par bloc. Que `wantsPits && wantsCtrlsPit`.
- **SW Pit:** 1 par bloc. Que `wantsPits && wantsSwPit`.

Les pits sont remplis que avec les gens qui ont coché ce type.

---

## 6. Journalist (2h, milieu + fin)

- Pas tous les blocs. Seulement 4 blocs par jour: **milieu** `mid-1` et `mid` (mid = floor(numBlocks/2)), **fin** `numBlocks-2` et `numBlocks-1`.
- Exemple 25 blocs: mid=12 → blocs 11, 12, 23, 24. 4×30 min = **2h**.
- Que `wantsJournalism`.

---

## 7. Strategy (2–4 par bloc, reserve)

- Min 2, max 4 par bloc. **Reserve:** 7 personnes gardées pour Media + Scouting, donc Strategy prend pas tout le monde: `strategyCap = min(max, max(min, dispo - 7))`.
- Nombre assigné entre 2 et 4, jamais plus que (dispo - 7). Que `wantsStrategy`.

---

## 8. Media (~50% des blocs)

- Assigné que quand `timeIdx % 2 === 0` (blocs pairs). Donc environ la moitié des blocs ont 1 Media.
- Que `wantsMedia`.

---

## 9. Ordre d’assignation dans un role (étendre run 1h + repartir)

Quand on assigne jusqu’a `maxN` personnes a un role dans un bloc, on **trie** les dispo:

1. **Preférer etendre un run 1h:** si la personne avait ce role au bloc **precedent** et que son run actuel (en arriere) fait **&lt; 2** blocs, on la prefere. Donc on etend les runs de 1 a 2 blocs (1h), puis on fait tourner.
2. **Ensuite repartir:** tri par nombre de fois qu’ils ont eu ce role (ascendant). Equilibrage.

En bref: **preferer runs de 2 blocs (1h), puis ceux qui ont le moins eu ce role.**

---

## 10. Scouting (7 par bloc, equilibré)

- Rempli **apres** les autres roles. Seuls les encore **Open** dans ce bloc peuvent scout.
- **Qui peut scout:** Open dans ce bloc + pas drive + pas dans CANNOT_SCOUT_NAMES / cannotScout du form (plus de groupes A/B).
- **Cible (equilibré):** `consistentScoutTarget = min(MAX_SCOUTS, max(MIN_SCOUTS, min(scoutAvailablePerBlock)))` → 6 scouts par bloc quand possible.
- **Qui a Scouting!:** parmi les eligibles, tri: (1) preferer etendre un run scout &lt; 2 blocs, (2) puis ceux qui ont le moins scouté. On assigne jusqu’a la cible (ou moins si pas assez de dispo).

---

## 11. Cap Open (max 1h d’Open d’affilé)

- Apres tout, pour chaque personne (pas drive, pas cannotScout): pour chaque **run de blocs Open consecutifs**, si longueur **&gt; 2** (plus d’1h), on **insere Scouting!** au milieu (tous les 2 blocs dans le run) pour que personne ait plus de 2 Open d’affilé, sauf si le bloc est deja a MAX_SCOUTS.

Donc personne (qui peut scout) a plus de **2 Open de suite** (= 1h).

---

## 12. Requirements (min/max par bloc)

Dans `requirements.js`:

| Role      | Min | Max |
|-----------|-----|-----|
| Drive     | 5   | 5   |
| Mech Pit  | 3   | 3   |
| Ctrls Pit | 1   | 1   |
| SW Pit    | 1   | 1   |
| Journalist| 0   | 1   |
| Strategy  | 2   | 4   |
| Media     | 0   | 1   |

Scouting c’est pas dans requirements; c’est fixe MIN_SCOUTS = MAX_SCOUTS = 7 par bloc (quand y’a assez de monde).

---

## 13. Deux jours (Vendredi / Samedi)

- **buildSchedule** genere les memes **time blocks** pour les deux jours.
- **Submissions** filtrées par jour: Vendredi `s.friday`, Samedi `s.saturday`.
- **runScheduling** est appelé **une fois par jour** avec les subs du jour. Chaque jour a son schedule et sa liste de gens.

---

## Resumé

- **Temps:** blocs de 30 min de start a end.
- **Roles:** ordre fixe; min/max + “que si inscrit” + “preferer runs 1h + repartir”.
- **Drive:** max 5 par bloc, round-robin.
- **Pits:** 3 Mech (Audrey toujours une si la), 1 Ctrls, 1 SW; que ceux qui veulent ce type.
- **Journalist:** que 4 blocs (milieu 2 + fin 2) → 2h.
- **Strategy:** 2–4 par bloc, reserve 7 pour Media + Scouting.
- **Media:** 1 par bloc dans ~50% des blocs (indices pairs).
- **Scouting:** 7 par bloc quand possible; meme cible partout; preferer runs 1h; puis cap Open pour que personne ait &gt; 1h d’Open d’affilé.
