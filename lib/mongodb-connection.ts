import type { Db, MongoClient } from "mongodb";

/**
 * Un `Db` qui survit à une connexion initiale ratée.
 *
 * Quand la toute première connexion d'un client échoue — base injoignable le
 * temps d'un déploiement, bascule de cluster, hoquet réseau au démarrage — le
 * driver ferme la topologie du client mais en garde la référence
 * (`mongo_client.js`, `_connect`). Or la reconnexion automatique des
 * opérations ne se déclenche que si `client.topology` est nul
 * (`execute_operation.js`) : la topologie fermée est donc réutilisée telle
 * quelle, et **toutes** les opérations suivantes échouent sur
 * « MongoTopologyClosedError: Topology is closed », pour la vie du processus.
 * Une panne de quelques secondes coupe ainsi la base jusqu'au prochain
 * redémarrage, alors même qu'elle est revenue.
 *
 * On écoute donc `topologyClosed` pour repartir d'un client neuf au prochain
 * accès. La requête qui a essuyé la panne échoue toujours — la base était bien
 * absente ; ce sont les suivantes qui la retrouvent.
 */
export function createResilientDb(createClient: () => MongoClient): Db {
  let client: MongoClient | null = null;
  let db: Db | null = null;
  // Vrai entre la fermeture subie de la topologie et le remplacement du client.
  let topologyClosed = false;

  const current = (): Db => {
    if (client && db && !topologyClosed) return db;

    const previous = client;
    topologyClosed = false;
    const created = createClient();
    // Rien dans l'application ne ferme de client : l'événement ne signale donc
    // que la fermeture subie décrite plus haut. Le test d'identité garde le
    // drapeau honnête — un client déjà remplacé qui se ferme ne doit pas faire
    // passer son successeur pour mort.
    created.on("topologyClosed", () => {
      if (client === created) topologyClosed = true;
    });
    client = created;
    db = client.db();
    // Le client remplacé n'a plus de topologie, mais garde des ressources
    // (sessions, moniteurs) qu'il vaut mieux rendre. L'échec de cette
    // fermeture n'a rien à apprendre à personne : le client est déjà mort.
    if (previous) void Promise.resolve(previous.close()).catch(() => {});
    return db;
  };

  // Les appels sont écrits `db.collection(...)` dans tout le code : on garde
  // cette forme, et c'est l'accès qui résout le `Db` du moment.
  return new Proxy({} as Db, {
    get(_target, property) {
      const live = current();
      const value = Reflect.get(live, property, live);
      return typeof value === "function" ? value.bind(live) : value;
    },
  });
}
