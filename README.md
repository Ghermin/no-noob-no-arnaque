# No Noob No Arnaque

Diagnostic OBD-II directement dans le navigateur, pour vérifier ce que dit le garagiste.

**➡ [Ouvrir l'app](https://ghermin.github.io/no-noob-no-arnaque/)** (Chrome ou Edge, sur Android ou sur ordinateur)

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
  - pour les GM (Chevrolet, Daewoo, Opel), calculateurs **GMLAN**, *expérimental* ;
  - noms des calculateurs connus pour VAG, Renault, Ford et GM ;
  - lit les **autotests détaillés** (mode 06) : une valeur hors limites annonce un défaut avant que le voyant ne s'allume ;
  - lit le **kilométrage** : OBD (voitures récentes) ou tableau de bord VAG (expérimental). L'app signale un kilométrage incohérent ou
    qui recule entre deux scans.
- **Gère plusieurs voitures**, reconnues automatiquement par leur VIN, chacune avec son historique.
- **Affiche les données en direct**, filtrées selon le moteur (diesel, essence, éthanol E85…) et ce que la voiture prend en charge.
  Le taux d'éthanol est affiché pour les flexifuel.
- **Efface les codes moteur** à la demande, après un scan de sauvegarde automatique, pour vérifier si un défaut revient.
- **Mode démo** avec quatre voitures simulées, dont des scénarios garage et compteur trafiqué :
  - Ibiza diesel (VAG TP2.0) ;
  - citadine essence (UDS) ;
  - Ford Puma E85 (UDS) ;
  - Chevrolet Captiva (GMLAN / KWP).
- **Journal technique** exportable pour signaler un problème avec une voiture ou un adaptateur.

Tout reste dans le navigateur : pas de compte, pas de serveur, aucune donnée envoyée.

## Matériel

- **Téléphone Android ou ordinateur** : un adaptateur **ELM327 en Bluetooth Low Energy (BLE, Bluetooth 4.0)**, par exemple OBDLink
  CX, vLinker MC+ ou Vgate iCar Pro BLE. Les adaptateurs en Bluetooth « classique » ne sont pas accessibles depuis un navigateur.
- **Câble OBD USB** (ELM327 USB, OBDLink SX / EX) : la vitesse du câble est détectée automatiquement (38 400, 115 200, 9 600,
  230 400 ou 500 000 bauds).
  - **Ordinateur** : via Web Serial dans Chrome ou Edge, avec les pilotes du système.
  - **Téléphone Android** : via WebUSB dans Chrome, avec un adaptateur USB-C OTG. Puces prises en charge : FTDI, CH340, CP2102 et
    USB standard (CDC). Prolific PL2303 : ordinateur uniquement.

Compatible avec toute voiture équipée de l'OBD-II / EOBD : en Europe, les essences depuis 2001 et les diesels depuis 2004.

## Limites

- Seule écriture possible : l'**effacement des codes du calculateur moteur** (mode 04), sur demande explicite. Rien d'autre n'est
  modifié dans la voiture.
- Les descriptions des codes des autres calculateurs sont partielles, car beaucoup de codes sont propres à chaque constructeur.
- Le scan complet nécessite un bus CAN avec des identifiants 11 bits, ce qui couvre la plupart des voitures depuis environ 2008. Les
  adaptateurs clones bon marché gèrent souvent mal les commandes avancées : un OBDLink est recommandé.
- Les parties VAG TP2.0 et GMLAN n'ont pas encore été validées sur une vraie voiture. Le journal technique est le bienvenu.
- Les réseaux secondaires (MS-CAN Ford, SW-CAN GM) ne sont pas lus.
- Ne voit pas l'usure mécanique : freins, pneus, courroie, amortisseurs…
- Ne fonctionne pas sur iPhone ni dans Firefox, qui ne gèrent ni Web Bluetooth ni WebUSB.
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
| `src/obd/serial.ts` | Connexion câble USB via Web Serial sur ordinateur (détection automatique de la vitesse) |
| `src/obd/usb.ts` | Connexion câble USB via WebUSB sur téléphone : pilotes FTDI, CH340, CP210x et CDC |
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
- [x] Autres constructeurs : recherche générique UDS / KWP2000 sur CAN, noms connus pour VAG, Renault et Ford
- [x] GM : adresses et lecture des codes GMLAN (expérimental)
- [x] Carburant éthanol (E85) et taux d'éthanol
- [x] Effacement des codes moteur avec suivi « revenu / pas revenu »
- [x] Câble OBD USB sur ordinateur (Web Serial) et sur téléphone Android (WebUSB)
- [ ] Valider TP2.0, GMLAN et UDS sur de vraies voitures (journaux bienvenus)
- [ ] Réseaux secondaires Ford MS-CAN / GM SW-CAN (adaptateurs compatibles)
- [ ] Bus CAN 29 bits
- [ ] Davantage de descriptions de codes constructeur

## Licence

MIT
