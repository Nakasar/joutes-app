# Notifications push

Comment une notification Joutes atteint un téléphone.

## Le principe

Une notification n'est pas adressée à quelqu'un : elle **cible une audience**,
résolue à la lecture par le `$match` d'autorisation de `getUserNotifications`.
Le site n'a jamais eu besoin d'autre chose — chaque visiteur demande ce qui le
concerne. Un envoi sortant pose la question dans l'autre sens, et c'est tout ce
qui a dû être écrit : **à qui faut-il écrire ?**

```
createNotification  →  schedulePushFanout  →  audience  →  appareils  →  APNs / FCM
   (un document)         (après la réponse)     (ou file, si trop gros)
```

## Les règles

- **L'envoi ne fait jamais échouer l'action métier.** Une notification
  enregistrée sans push vaut infiniment mieux qu'une demande d'ami annulée parce
  qu'Apple était indisponible. `schedulePushFanout` est synchrone, sans retour,
  et incapable de lever.
- **On ne pousse pas vers un compte qui n'a rien accepté.** Enregistrer un
  appareil pose `notifications.app.push.enabled` à `true` : accepter l'invite du
  système *est* l'activation. L'interrupteur du compte sert à couper.
- **Un jeton mort est supprimé, pas marqué.** Il ne ressuscitera pas, et sa
  ligne occuperait l'index unique le jour où l'OS réattribue le même jeton.
- **Le jeton ne sort jamais de la base.** L'API et l'interface n'en montrent que
  les huit derniers caractères.

## Le seuil

| Appareils touchés | Chemin | Latence |
| --- | --- | --- |
| ≤ 200 | envoi immédiat, via `after()` | ~2 s |
| > 200 | file `push_jobs`, dépilée par `/api/cron/push-dispatch` | ≤ 1 min |

La quasi-totalité des notifications Joutes touchent une poignée de destinataires
— appariement, demande d'ami, match de ligue — et ce sont justement celles qui
doivent arriver tout de suite. Même une annonce diffusée aux joueurs d'un
tournoi de cent personnes reste sous le seuil, la plupart n'ayant pas
l'application : elle part donc immédiatement, sans passer par la file. Imposer la file à tout le monde ajouterait une
minute d'attente à 99 % du trafic pour borner les annonces d'un lair très suivi,
qui se comptent en quelques documents par semaine.

La transition `pending → sending` de la file est un `findOneAndUpdate` atomique :
un dépilage qui déborde sur l'exécution suivante n'envoie pas deux fois. La
pagination s'appuie sur l'identifiant du dernier appareil traité, pas sur un
`skip`.

## Modules

| Fichier | Rôle |
| --- | --- |
| `lib/notifications/audience.ts` | qui reçoit — miroir du `$match` de lecture. **Pur, testé.** |
| `lib/notifications/deeplink.ts` | où mène la notification. **Pur, testé.** |
| `lib/notifications/preferences.ts` | la matrice des réglages. **Pur, testé.** |
| `lib/notifications/weekly-digest.ts` | le récapitulatif hebdomadaire. **Pur, testé.** |
| `lib/tournaments/notification-messages.ts` | les messages de tournoi. **Pur, testé.** |
| `lib/tournaments/notifications.ts` | les envois de tournoi. |
| `lib/push/payload.ts` | les enveloppes d'Apple et de Google. **Pur, testé.** |
| `lib/push/apns-jwt.ts`, `gcp-jwt.ts` | les jetons fournisseur. **Purs, testés.** |
| `lib/push/errors.ts` | ce qu'il faut conclure d'une réponse. **Pur, testé.** |
| `lib/push/apns.ts` | l'envoi à Apple, en `node:http2`. |
| `lib/push/fcm.ts` | l'envoi à Google, en `fetch`. |
| `lib/push/send.ts` | l'orchestration et le ménage des jetons morts. |
| `lib/push/dispatch.ts` | le seuil, la file, le dépilage. |
| `lib/db/push-devices.ts`, `push-jobs.ts` | le stockage. |

La logique testable ne touche pas `lib/db/*` : `lib/mongodb.ts` ouvre une
connexion à l'import, et rien qui l'importe n'est exécutable par `node:test`.

## Configuration

```
PUSH_ENABLED=1              # l'arrêt d'urgence : sans lui, rien ne part
APNS_KEY_ID, APNS_TEAM_ID, APNS_PRIVATE_KEY, APNS_BUNDLE_ID
FCM_PROJECT_ID, FCM_CLIENT_EMAIL, FCM_PRIVATE_KEY
```

Sans ces variables, l'envoi ne fait rien et journalise une fois : le
développement local et les aperçus ne doivent pas échouer faute de secrets.

**Index à créer** (il n'y a pas de mécanisme de migration dans le dépôt) :

```js
db.push_devices.createIndex({ token: 1 }, { unique: true })
db.push_devices.createIndex({ userId: 1, state: 1 })
db.push_devices.createIndex({ installationId: 1, userId: 1 })
db.user.createIndex({ lairs: 1 })   // sans lui, chaque annonce de lair balaie la base des comptes
```

### Hors dépôt, une seule fois

1. Un projet Firebase, une app Android `app.joutes.mobile`, un compte de service
   (`FCM_*`) et le `google-services.json` (secret `GOOGLE_SERVICES_JSON` du
   dépôt mobile).
2. Une clé APNs `.p8` sur le portail Apple Developer — **distincte** de la clé
   App Store Connect qu'utilise déjà la CI mobile, ce sont deux `.p8` de nature
   différente.
3. La capacité **Push Notifications** activée sur l'App ID `app.joutes.mobile`.
   Sans elle, `-allowProvisioningUpdates` régénère un profil sans
   `aps-environment` : au mieux la signature échoue, au pire elle passe et rien
   n'arrive jamais.

## Dépannage

| Symptôme | Cause |
| --- | --- |
| `403 InvalidProviderToken` | la signature ES256 est en DER et non en R‖S brut — le test `apns-jwt.test.ts` vérifie qu'elle fait 64 octets |
| `429 TooManyProviderTokenUpdates` | trop de jetons fournisseur régénérés ; l'`iat` est arrondi à la demi-heure pour que toutes les instances Vercel annoncent la même émission |
| `ERR_OSSL_UNSUPPORTED` | une clé privée dont les `\n` n'ont pas été rétablis — c'est le rôle de `lib/push/config.ts` |
| `400 BadDeviceToken` sur un jeton pourtant valide | jeton de développement présenté à la production, ou l'inverse ; l'envoi rejoue une fois sur l'autre point d'entrée et retient celui qui marche |
| Tous les appareils disparaissent d'un coup | un `INVALID_ARGUMENT` de FCM pris pour un jeton mort. Il ne l'est que lorsqu'il porte un `FcmError` ; avec un `BadRequest`, c'est notre charge utile qui est fautive |
| Android n'affiche jamais l'invite | `POST_NOTIFICATIONS` absente du manifeste généré — `requestPermission()` rend « denied » sans rien demander |

Vérifier un jeton sans passer par le fan-out complet :

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  "https://joutes.app/api/cron/push-test?platform=ios&token=…&environment=production"
```

## Crons

| Chemin | Cadence | Rôle |
| --- | --- | --- |
| `/api/cron/push-dispatch` | `* * * * *` | dépile les fan-outs mis en file |
| `/api/cron/push-user-weekly` | `0 8 * * 1` | le récapitulatif hebdomadaire en push |
| `/api/cron/push-test` | — | à la main, diagnostic |

Le récapitulatif push est un cron distinct de `emails-user-weekly` : le public
est un autre filtre et la mémoire d'envoi un autre champ. Il ne passe pas par
`createNotification`, qui écrirait des milliers de documents dans l'inbox chaque
lundi matin.

## Tests

```bash
npm run test
```

Le test qui compte le plus est `lib/push/errors.test.ts` : il travaille sur des
corps de réponse réels, et c'est lui qui empêche de confondre une charge utile
fautive — qui échoue pour tous les appareils à la fois — avec un téléphone
désinstallé.
