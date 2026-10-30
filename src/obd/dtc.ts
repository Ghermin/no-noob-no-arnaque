import type { Dtc } from '../types';
import type { EcuMessage } from './frames';

const SYSTEMS = ['P', 'C', 'B', 'U'];

export function decodeDtcBytes(a: number, b: number): string {
    const system = SYSTEMS[a >> 6];
    const digit1 = (a >> 4) & 0x03;
    const digit2 = (a & 0x0f).toString(16).toUpperCase();
    const rest = b.toString(16).toUpperCase().padStart(2, '0');
    return `${system}${digit1}${digit2}${rest}`;
}

export function decodeDtcMessages(messages: EcuMessage[], isCan: boolean): Dtc[] {
    const found: Dtc[] = [];
    for (const message of messages) {
        const payload = isCan ? message.data.slice(2) : message.data.slice(1);
        for (let i = 0; i + 1 < payload.length; i += 2) {
            if (payload[i] === 0 && payload[i + 1] === 0) continue;
            const code = decodeDtcBytes(payload[i], payload[i + 1]);
            if (!found.some((d) => d.code === code && d.ecu === message.ecu)) {
                found.push({ code, ecu: message.ecu });
            }
        }
    }
    return found;
}

const DESCRIPTIONS: Record<string, string> = {
    P0010: "Commande de l'arbre à cames d'admission (banc 1) : circuit",
    P0011: "Calage de l'arbre à cames d'admission (banc 1) : trop en avance ou performance",
    P0012: "Calage de l'arbre à cames d'admission (banc 1) : trop en retard",
    P0013: "Commande de l'arbre à cames d'échappement (banc 1) : circuit",
    P0014: "Calage de l'arbre à cames d'échappement (banc 1) : trop en avance ou performance",
    P0015: "Calage de l'arbre à cames d'échappement (banc 1) : trop en retard",
    P0016: 'Calage vilebrequin / arbre à cames incohérent (banc 1, capteur A)',
    P0071: "Capteur de température d'air extérieur : valeur hors plage / performance",
    P0045: 'Commande de pression de suralimentation (turbo) : circuit ouvert',
    P0087: 'Pression du rail / système carburant trop basse',
    P0088: 'Pression du rail / système carburant trop élevée',
    P0089: 'Régulateur de pression carburant : performance',
    P008A: 'Pression du circuit carburant basse pression trop basse',
    P008B: 'Pression du circuit carburant basse pression trop élevée',
    P0093: 'Fuite importante détectée dans le système carburant',
    P0096: "Capteur de température d'air d'admission 2 : valeur hors plage / performance",
    P0100: "Débitmètre d'air : circuit",
    P0101: "Débitmètre d'air : valeur hors plage / performance",
    P0102: "Débitmètre d'air : signal trop faible",
    P0103: "Débitmètre d'air : signal trop élevé",
    P0105: "Capteur de pression d'admission (MAP) : circuit",
    P0106: "Capteur de pression d'admission (MAP) : valeur hors plage / performance",
    P0107: "Capteur de pression d'admission (MAP) : signal trop faible",
    P0108: "Capteur de pression d'admission (MAP) : signal trop élevé",
    P0110: "Capteur de température d'air d'admission : circuit",
    P0111: "Capteur de température d'air d'admission : valeur hors plage / performance",
    P0112: "Capteur de température d'air d'admission : signal trop faible",
    P0113: "Capteur de température d'air d'admission : signal trop élevé",
    P0115: 'Capteur de température du liquide de refroidissement : circuit',
    P0116: 'Capteur de température du liquide de refroidissement : valeur hors plage / performance',
    P0117: 'Capteur de température du liquide de refroidissement : signal trop faible',
    P0118: 'Capteur de température du liquide de refroidissement : signal trop élevé',
    P0120: 'Capteur de position papillon / pédale A : circuit',
    P0121: 'Capteur de position papillon / pédale A : valeur hors plage / performance',
    P0122: 'Capteur de position papillon / pédale A : signal trop faible',
    P0123: 'Capteur de position papillon / pédale A : signal trop élevé',
    P0128: "Thermostat : le moteur n'atteint pas sa température normale",
    P0130: 'Sonde lambda amont (banc 1) : circuit',
    P0131: 'Sonde lambda amont (banc 1) : tension trop faible',
    P0132: 'Sonde lambda amont (banc 1) : tension trop élevée',
    P0133: 'Sonde lambda amont (banc 1) : réponse trop lente',
    P0134: 'Sonde lambda amont (banc 1) : aucune activité',
    P0135: 'Sonde lambda amont (banc 1) : circuit de chauffage',
    P0136: 'Sonde lambda aval (banc 1) : circuit',
    P013A: 'Sonde lambda aval (banc 1) : passage lent de riche à pauvre',
    P0137: 'Sonde lambda aval (banc 1) : tension trop faible',
    P0138: 'Sonde lambda aval (banc 1) : tension trop élevée',
    P0141: 'Sonde lambda aval (banc 1) : circuit de chauffage',
    P0171: 'Mélange trop pauvre (banc 1)',
    P0172: 'Mélange trop riche (banc 1)',
    P0180: 'Capteur de température carburant A : circuit',
    P0190: 'Capteur de pression du rail : circuit',
    P0191: 'Capteur de pression du rail : valeur hors plage / performance',
    P0192: 'Capteur de pression du rail : signal trop faible',
    P0193: 'Capteur de pression du rail : signal trop élevé',
    P0200: "Circuit d'injecteur",
    P0201: 'Injecteur cylindre 1 : circuit',
    P0202: 'Injecteur cylindre 2 : circuit',
    P0203: 'Injecteur cylindre 3 : circuit',
    P0204: 'Injecteur cylindre 4 : circuit',
    P0217: 'Surchauffe moteur',
    P0219: 'Survitesse moteur',
    P0234: 'Turbo : suralimentation excessive (overboost)',
    P0236: 'Capteur de pression de suralimentation A : valeur hors plage / performance',
    P0237: 'Capteur de pression de suralimentation A : signal trop faible',
    P0238: 'Capteur de pression de suralimentation A : signal trop élevé',
    P0298: "Température d'huile moteur trop élevée",
    P0299: 'Turbo : suralimentation insuffisante (underboost)',
    P0300: "Ratés d'allumage / de combustion aléatoires ou multiples",
    P0301: "Ratés d'allumage / de combustion : cylindre 1",
    P0302: "Ratés d'allumage / de combustion : cylindre 2",
    P0303: "Ratés d'allumage / de combustion : cylindre 3",
    P0304: "Ratés d'allumage / de combustion : cylindre 4",
    P0325: 'Capteur de cliquetis 1 (banc 1) : circuit',
    P0327: 'Capteur de cliquetis 1 (banc 1) : signal trop faible',
    P0328: 'Capteur de cliquetis 1 (banc 1) : signal trop élevé',
    P0335: 'Capteur de position vilebrequin A : circuit',
    P0336: 'Capteur de position vilebrequin A : valeur hors plage / performance',
    P0340: 'Capteur de position arbre à cames A (banc 1) : circuit',
    P0380: 'Bougies de préchauffage : circuit A',
    P0381: 'Témoin de préchauffage : circuit',
    P0400: 'Recirculation des gaz (EGR) : débit',
    P0401: 'Recirculation des gaz (EGR) : débit insuffisant',
    P0402: 'Recirculation des gaz (EGR) : débit excessif',
    P0403: 'Vanne EGR : circuit de commande',
    P0404: 'Vanne EGR : valeur hors plage / performance',
    P0405: 'Capteur de position de vanne EGR A : signal trop faible',
    P0406: 'Capteur de position de vanne EGR A : signal trop élevé',
    P0420: 'Efficacité du catalyseur insuffisante (banc 1)',
    P0440: "Système de récupération des vapeurs d'essence (EVAP) : défaut",
    P0441: 'Système EVAP : débit de purge incorrect',
    P0442: 'Système EVAP : petite fuite détectée',
    P0455: 'Système EVAP : fuite importante détectée',
    P0456: 'Système EVAP : très petite fuite détectée',
    P0470: "Capteur de pression d'échappement : circuit",
    P0471: "Capteur de pression d'échappement : valeur hors plage / performance",
    P0480: 'Ventilateur de refroidissement 1 : circuit de commande',
    P0500: 'Capteur de vitesse du véhicule A',
    P0505: 'Régulation du ralenti : défaut',
    P0506: 'Régime de ralenti plus bas que prévu',
    P0507: 'Régime de ralenti plus haut que prévu',
    P0520: "Capteur / contacteur de pression d'huile : circuit",
    P0544: "Capteur de température des gaz d'échappement (banc 1, capteur 1) : circuit",
    P0546: "Capteur de température des gaz d'échappement (banc 1, capteur 1) : signal trop élevé",
    P0560: 'Tension du système électrique : défaut',
    P0562: 'Tension du système électrique trop basse',
    P0563: 'Tension du système électrique trop élevée',
    P0571: 'Contacteur de frein A : circuit',
    P0600: 'Liaison de communication série : défaut',
    P0601: 'Calculateur moteur : erreur de mémoire (somme de contrôle)',
    P0603: 'Calculateur moteur : erreur de mémoire permanente (KAM)',
    P0604: 'Calculateur moteur : erreur de mémoire vive (RAM)',
    P0605: 'Calculateur moteur : erreur de mémoire morte (ROM)',
    P0606: 'Calculateur moteur : défaut du processeur',
    P0627: 'Pompe à carburant : circuit de commande ouvert',
    P062F: 'Calculateur : erreur de mémoire EEPROM',
    P0641: 'Tension de référence capteurs A : circuit ouvert',
    P0651: 'Tension de référence capteurs B : circuit ouvert',
    P0670: 'Boîtier de commande des bougies de préchauffage : circuit',
    P0671: 'Bougie de préchauffage cylindre 1 : circuit',
    P0672: 'Bougie de préchauffage cylindre 2 : circuit',
    P0673: 'Bougie de préchauffage cylindre 3 : circuit',
    P0674: 'Bougie de préchauffage cylindre 4 : circuit',
    P0700: 'Boîte de vitesses : défaut mémorisé dans le calculateur de boîte',
    P0705: 'Capteur de position du levier de vitesses : circuit',
    P0715: 'Capteur de vitesse de turbine (boîte auto) : circuit',
    P0812: 'Contacteur de marche arrière : circuit',
    P0A1A: "Calculateur de l'alterno-démarreur / générateur (hybride) : défaut",
    P0A7D: 'Batterie hybride : état de charge trop bas',
    P0AA1: 'Batterie hybride : contacteur positif collé fermé',
    P2002: 'Filtre à particules (FAP) : efficacité insuffisante (banc 1)',
    P2015: "Capteur de position des volets d'admission (banc 1) : valeur hors plage / performance",
    P2096: 'Correction de mélange aval : trop pauvre (banc 1)',
    P2097: 'Correction de mélange aval : trop riche (banc 1)',
    P2227: 'Capteur de pression atmosphérique : valeur hors plage / performance',
    P2263: 'Turbo : performance du système de suralimentation',
    P2270: 'Sonde lambda aval (banc 1) : signal bloqué pauvre',
    P2271: 'Sonde lambda aval (banc 1) : signal bloqué riche',
    P2279: "Fuite d'air à l'admission",
    P242F: 'Filtre à particules (FAP) : colmatage par les cendres',
    P2452: 'Capteur de pression différentielle du FAP A : circuit',
    P2453: 'Capteur de pression différentielle du FAP A : valeur hors plage / performance',
    P2454: 'Capteur de pression différentielle du FAP A : signal trop faible',
    P2455: 'Capteur de pression différentielle du FAP A : signal trop élevé',
    P2463: 'Filtre à particules (FAP) : accumulation de suies',
    P250F: "Niveau d'huile moteur trop bas",
    P2610: 'Calculateur : minuterie interne (moteur arrêté) : performance',
    U0001: 'Bus de communication CAN haute vitesse : défaut',
    U0100: 'Perte de communication avec le calculateur moteur',
    U0101: 'Perte de communication avec le calculateur de boîte de vitesses',
    U0121: "Perte de communication avec le calculateur d'ABS",
    U0140: "Perte de communication avec le boîtier d'habitacle (BCM)",
    U0155: 'Perte de communication avec le tableau de bord',
    U0423: 'Données invalides reçues du tableau de bord',
    U3000: 'Calculateur : défaut interne'
};

// Type de panne (3e octet des codes UDS, SAE J2012) : précise la nature du défaut.
const FAILURE_TYPES: Record<number, string> = {
    0x01: 'défaut électrique',
    0x02: 'défaut de signal',
    0x04: 'défaut interne',
    0x06: 'défaut détecté par calcul',
    0x07: 'défaut mécanique',
    0x08: 'message ou signal du réseau incorrect',
    0x11: 'court-circuit à la masse',
    0x12: 'court-circuit au plus (batterie)',
    0x13: 'circuit ouvert (coupé)',
    0x14: 'court-circuit à la masse ou circuit ouvert',
    0x15: 'court-circuit au plus ou circuit ouvert',
    0x16: 'tension trop basse',
    0x17: 'tension trop haute',
    0x18: 'courant trop faible',
    0x19: 'courant trop fort',
    0x1a: 'résistance trop faible',
    0x1b: 'résistance trop haute',
    0x1c: 'tension hors plage',
    0x1d: 'courant hors plage',
    0x1e: 'résistance hors plage',
    0x1f: 'faux contact (intermittent)',
    0x21: 'signal trop faible',
    0x22: 'signal trop fort',
    0x23: 'signal bloqué bas',
    0x24: 'signal bloqué haut',
    0x26: 'signal qui varie trop lentement',
    0x27: 'signal qui varie trop vite',
    0x28: 'signal décalé',
    0x29: 'signal invalide',
    0x31: 'aucun signal',
    0x41: 'erreur de contrôle de la mémoire',
    0x42: 'défaut de mémoire',
    0x43: 'défaut de mémoire',
    0x44: 'défaut de mémoire de données',
    0x45: 'défaut de mémoire programme',
    0x46: 'défaut de mémoire de réglages',
    0x47: 'défaut du circuit de sécurité interne',
    0x48: 'défaut de surveillance interne',
    0x49: 'défaut électronique interne',
    0x4a: 'mauvais composant monté',
    0x4b: 'surchauffe',
    0x51: 'non programmé',
    0x52: 'non activé',
    0x53: 'désactivé',
    0x54: 'réglage (calibration) manquant',
    0x55: 'non configuré',
    0x62: 'signaux incohérents entre eux',
    0x63: 'délai de protection dépassé',
    0x64: 'signal non plausible',
    0x68: 'événement enregistré',
    0x71: 'actionneur bloqué',
    0x81: 'données reçues invalides',
    0x86: 'signal reçu invalide',
    0x87: 'message manquant',
    0x88: 'réseau coupé (bus off)',
    0x92: 'fonctionnement incorrect ou performance insuffisante',
    0x94: 'fonctionnement inattendu',
    0x96: 'défaut interne du composant',
    0x97: 'fonctionnement bloqué ou entravé',
    0x98: 'surchauffe du composant'
};

/** Pour un code UDS « P0420-11 », la nature du défaut indiquée par le suffixe, si elle est connue. */
export function describeFailureType(code: string): string | null {
    const suffix = /-([0-9A-F]{2})$/i.exec(code);
    if (!suffix) return null;
    const ftb = parseInt(suffix[1], 16);
    if (ftb === 0) return null;
    if (ftb >= 0xf0) return 'type de panne propre au constructeur';
    return FAILURE_TYPES[ftb] ?? null;
}

const SYSTEM_NAMES: Record<string, string> = {
    P: 'Moteur / boîte de vitesses',
    C: 'Châssis (freins, ABS, direction…)',
    B: 'Carrosserie (airbag, confort, éclairage…)',
    U: 'Réseau de communication entre calculateurs'
};

const POWERTRAIN_AREAS: Record<string, string> = {
    '0': 'dosage air / carburant et émissions',
    '1': 'dosage air / carburant',
    '2': 'dosage air / carburant (injecteurs)',
    '3': "système d'allumage ou ratés de combustion",
    '4': 'dispositifs antipollution auxiliaires',
    '5': 'vitesse véhicule, ralenti et entrées auxiliaires',
    '6': 'calculateur et circuits de sortie',
    '7': 'boîte de vitesses',
    '8': 'boîte de vitesses',
    '9': 'boîte de vitesses',
    A: 'système hybride',
    B: 'système hybride',
    C: 'système hybride'
};

export interface DtcInfo {
    code: string;
    description: string;
    system: string;
    manufacturerSpecific: boolean;
    known: boolean;
}

export function describeDtc(code: string): DtcInfo {
    const system = SYSTEM_NAMES[code[0]] ?? 'Inconnu';
    const manufacturerSpecific = code[1] === '1' || (code[0] !== 'P' && code[1] === '2') || (code[0] === 'P' && code[1] === '3' && code[2] < '4');
    const known = code in DESCRIPTIONS;
    let description = DESCRIPTIONS[code];
    if (!description) {
        const area = code[0] === 'P' ? POWERTRAIN_AREAS[code[2]] : undefined;
        description = manufacturerSpecific
            ? `Code propre à la marque${area ? `, côté ${area}` : ''} : sa signification exacte est dans la documentation du constructeur.`
            : `Code standard${area ? `, côté ${area}` : ''} : pas encore décrit dans l'app.`;
    }
    return { code, description, system, manufacturerSpecific, known };
}
