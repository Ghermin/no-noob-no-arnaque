# No Noob No Arnaque

Diagnostic OBD-II directement dans le navigateur, pour vérifier ce que dit le garagiste.

**➡ [Ouvrir l'app](https://ghermin.github.io/no-noob-no-arnaque/)** (Chrome ou Edge, Android ou ordinateur)

## Ce que fait l'app

- **Lit les codes défaut** du calculateur moteur (confirmés, en attente, permanents), avec leur explication en français.
- **Détecte un effacement récent des codes** : distance et nombre de démarrages depuis le dernier effacement, autotests non terminés.
  C'est le signe classique d'un défaut masqué au lieu d'être réparé.
- **Compare deux scans**, par exemple avant et après le garage. Elle dit si la réparation est confirmée par la voiture, si le défaut
  est toujours là, ou si les codes ont seulement été effacés.
- **Scan complet** :
  - lit aussi les **autres calculateurs** (ABS, airbag, tableau de bord…) : recherche automatique en UDS / KWP2000 sur CAN, tous
    constructeurs ;
  - pour les VAG d'avant 2013 (Seat, VW, Škoda, Audi), protocole **TP2.0**, *expérimental* ;
  - lit les **autotests détaillés** (mode 06) : une valeur hors limites annonce un défaut avant que le voyant ne s'allume ;
  - lit le **kilométrage** : OBD (voitures récentes) ou tableau de bord VAG (expérimental). L'app signale un kilométrage incohérent ou
    qui recule entre deux scans.
- **Gère plusieurs voitures**, reconnues automatiquement par leur VIN, chacune avec son historique.
- **Affiche les données en direct**, filtrées selon le moteur (diesel, essence…) et ce que la voiture prend en charge.
- **Mode démo** avec deux voitures simulées (Ibiza diesel en TP2.0, citadine essence en UDS), dont des scénarios garage et compteur
  trafiqué.
- **Journal technique** exportable pour signaler un problème avec une voiture ou un adaptateur.

Tout reste dans le navigateur : pas de compte, pas de serveur, aucune donnée envoyée.

## Matériel

Un adaptateur **ELM327 en Bluetooth Low Energy (BLE, Bluetooth 4.0)**, par exemple OBDLink CX ou Vgate iCar Pro BLE.
Les adaptateurs en Bluetooth « classique » ne sont pas accessibles depuis un navigateur.

Compatible avec toute voiture équipée de l'OBD-II / EOBD : en Europe, les essences depuis 2001 et les diesels depuis 2004.

## Limites

- **Lecture seule** : l'app n'efface aucun code et n'écrit rien dans la voiture.
- Les descriptions des codes des autres calculateurs sont partielles, car beaucoup de codes sont propres à chaque constructeur.
- Le scan complet nécessite un bus CAN avec des identifiants 11 bits, ce qui couvre la plupart des voitures depuis environ 2008. Les
  adaptateurs clones bon marché gèrent souvent mal les commandes avancées : un OBDLink est recommandé.
- La partie VAG TP2.0 n'a pas encore été validée sur une vraie voiture. Le journal technique est le bienvenu.
- Ne voit pas l'usure mécanique : freins, pneus, courroie, amortisseurs…
- Ne fonctionne pas sur iPhone ni dans Firefox, qui ne gèrent pas Web Bluetooth.
- Outil indicatif, qui ne remplace pas un diagnostic professionnel.

## Développement

```bash
npm install
npm run dev     # serveur local (utilisez le bouton « Démo » sans adaptateur)
npm test        # tests unitaires du décodage OBD
npm run build
```

Le déploiement sur GitHub Pages est automatique à chaque push sur `main` (`.github/workflows/deploy.yml`).

### Structure

| Dossier | Rôle |
|---|---|
| `src/obd/transport.ts` | Connexion Web Bluetooth (détection automatique du canal série BLE) |
| `src/obd/elm327.ts` | Protocole ELM327 : file de commandes, initialisation, détection du protocole |
| `src/obd/frames.ts` | Décodage des trames (CAN ISO-TP multi-trames et anciens protocoles) |
| `src/obd/dtc.ts` | Codes défaut et descriptions |
| `src/obd/readiness.ts` | Autotests (moniteurs), essence et diesel |
| `src/obd/mode06.ts` | Autotests détaillés (mode 06, SAE J1979) |
| `src/obd/modules.ts` | Recherche des calculateurs et lecture des codes (UDS 0x19, KWP 0x18) |
| `src/obd/vag.ts` | Canal VAG TP2.0, codes VAG, blocs de mesure (kilométrage du tableau de bord) |
| `src/obd/log.ts` | Journal technique des échanges avec l'adaptateur |
| `src/obd/simulator.ts` | Voitures simulées pour le mode démo (OBD, UDS, TP2.0) |
| `src/analysis.ts` | Analyse « anti-arnaque » d'un scan et comparaison de deux scans |

## Feuille de route

- [x] Mode 06 (résultats détaillés des autotests)
- [x] Calculateurs VAG (KWP2000 / TP2.0) : ABS, airbag, kilométrage du tableau de bord (expérimental)
- [x] Autres constructeurs : recherche générique UDS / KWP2000 sur CAN, noms connus pour VAG et Renault
- [ ] Valider TP2.0 et UDS sur de vraies voitures (journaux bienvenus)
- [ ] Bus CAN 29 bits
- [ ] Davantage de descriptions de codes constructeur

## Licence

MIT
