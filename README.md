# No Noob No Arnaque

Diagnostic OBD-II directement dans le navigateur, pour vérifier ce que dit le garagiste.

**➡ [Ouvrir l'app](https://ghermin.github.io/no-noob-no-arnaque/)** (Chrome ou Edge, Android ou ordinateur)

## Ce que fait l'app

- **Lit les codes défaut** du calculateur moteur (confirmés, en attente, permanents), avec leur explication en français.
- **Détecte un effacement récent des codes** : distance et nombre de démarrages depuis le dernier effacement, autotests non terminés.
  C'est le signe classique d'un défaut masqué au lieu d'être réparé.
- **Compare deux scans**, par exemple avant et après le garage. Elle dit si la réparation est confirmée par la voiture, si le défaut
  est toujours là, ou si les codes ont seulement été effacés.
- **Gère plusieurs voitures**, reconnues automatiquement par leur VIN, chacune avec son historique.
- **Affiche les données en direct**, filtrées selon le moteur (diesel, essence…) et ce que la voiture prend en charge.
- **Mode démo** avec une voiture simulée, pour essayer sans adaptateur.

Tout reste dans le navigateur : pas de compte, pas de serveur, aucune donnée envoyée.

## Matériel

Un adaptateur **ELM327 en Bluetooth Low Energy (BLE, Bluetooth 4.0)**, par exemple OBDLink CX ou Vgate iCar Pro BLE.
Les adaptateurs en Bluetooth « classique » ne sont pas accessibles depuis un navigateur.

Compatible avec toute voiture équipée de l'OBD-II / EOBD : en Europe, les essences depuis 2001 et les diesels depuis 2004.

## Limites

- Lit uniquement les données **standard** du calculateur moteur. ABS, airbag, carrosserie et kilométrage du tableau de bord nécessitent
  des protocoles propres à chaque constructeur (prévu pour VAG).
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
| `src/obd/simulator.ts` | Voiture simulée pour le mode démo |
| `src/analysis.ts` | Analyse « anti-arnaque » d'un scan et comparaison de deux scans |

## Feuille de route

- [ ] Mode 06 (résultats détaillés des autotests)
- [ ] Calculateurs VAG (KWP2000 / TP2.0) : ABS, airbag, kilométrage du tableau de bord
- [ ] Autres constructeurs (Renault, PSA…)

## Licence

MIT
