import { Link } from "@/i18n/navigation";
import {
  LEGAL_CONTACT,
  LegalDocumentContent,
  LegalLink,
  LegalList,
} from "@/components/legal/LegalDocument";

export const cguEn: LegalDocumentContent = {
  meta: {
    title: "Terms of Use",
    description:
      "Terms of use of the Joutes platform: account, content, events, trades, API and liability.",
    keywords: ["terms of use", "terms and conditions", "legal", "joutes"],
  },
  documentLabel: "Legal document",
  title: "Terms of Use",
  description:
    "The rules governing your use of Joutes, your account and the content you publish on it.",
  lastUpdated: (date) => `Last updated: ${date}`,
  crossLinks: (
    <>
      See also the{" "}
      <Link href="/privacy" className="text-primary hover:underline">
        privacy policy
      </Link>{" "}
      and the{" "}
      <Link href="/about" className="text-primary hover:underline">
        about page
      </Link>
      .
    </>
  ),
  translationNotice: (
    <p>
      This English version is a courtesy translation. The{" "}
      <strong>French version is the legally binding one</strong>: in the event of any discrepancy,
      the French text prevails.
    </p>
  ),
  highlightTitle: "In short",
  highlight: (
    <>
      <p>
        Joutes is an independent service. Events, tournaments, trades and content are created by
        users, who remain responsible for them.
      </p>
      <p>
        This summary is provided for convenience only: solely the detailed clauses below are
        contractually binding.
      </p>
    </>
  ),
  summaryTitle: "Contents",
  articles: [
    {
      id: "objet",
      title: "Purpose and publisher of the Platform",
      content: (
        <>
          <p>
            These Terms of Use (hereinafter the &quot;Terms&quot;) set out the rules for accessing
            and using the Joutes platform (hereinafter the &quot;Platform&quot;), available at{" "}
            <a href="https://joutes.app" className="text-primary hover:underline">
              https://joutes.app
            </a>
            , together with its associated services (web interfaces, API, MCP server and Discord
            bot).
          </p>
          <p>
            The Platform allows players of trading card games and board games to discover events
            near them, organise meet-ups and tournaments, manage their collections and browse
            community content (rules, rulings, errata).
          </p>
          <p>
            Joutes is an independent project published by Nakasar and developed partly in the open
            (see the{" "}
            <Link href="/open-source" className="text-primary hover:underline">
              Open Source
            </Link>{" "}
            page). The Platform is hosted by Vercel Inc.
          </p>
          <p>
            Using the features currently offered involves no payment. Optional paid services may be
            offered in the future: their scope, price and subscription terms would then be set out
            before any subscription.
          </p>
        </>
      ),
    },
    {
      id: "acceptation",
      title: "Acceptance and amendment of the Terms",
      content: (
        <>
          <p>
            Using the Platform, with or without an account, implies full acceptance of these Terms.
            If you do not accept them, you must not use the Platform.
          </p>
          <p>
            These Terms may be amended at any time, in particular to reflect changes in the
            features or in the applicable law. The applicable version is the one published on this
            page; the date of the latest update appears at the top of the document. Where a change
            is substantial, notice will be given on the Platform or through the community channels.
            Continuing to use the Platform after a change constitutes acceptance of the new
            version.
          </p>
        </>
      ),
    },
    {
      id: "compte",
      title: "Access to the Platform and user account",
      content: (
        <>
          <p>
            Part of the content (events, venues, rules, cards) can be browsed without an account.
            Personal features (collection, decks, registrations, event organisation, trades)
            require creating an account.
          </p>
          <p>You can sign in:</p>
          <LegalList>
            <li>with a one-time code sent to your email address;</li>
            <li>with a Discord account;</li>
            <li>with a passkey (WebAuthn) registered from your security settings.</li>
          </LegalList>
          <p>By creating an account, you undertake to:</p>
          <LegalList>
            <li>provide accurate information and keep it up to date;</li>
            <li>
              not impersonate another person, a shop or an event organiser;
            </li>
            <li>
              keep your sign-in credentials confidential (email address, codes received, passkeys,
              API keys);
            </li>
            <li>
              take responsibility for every action carried out from your account, including by the
              applications you have connected to it;
            </li>
            <li>
              report any unauthorised use or suspected compromise to us without delay.
            </li>
          </LegalList>
          <p>
            The Platform is intended for people aged 15 or over. Below that age, creating an
            account requires the prior consent of the holder of parental authority, who remains
            responsible for how it is used.
          </p>
        </>
      ),
    },
    {
      id: "services",
      title: "Services offered",
      content: (
        <>
          <p>
            The Platform brings together several services, which may evolve, be extended or be
            withdrawn:
          </p>
          <LegalList>
            <li>
              <strong>Events and calendar:</strong> publishing, searching (including nearby) and
              registering for events organised by players or shops.
            </li>
            <li>
              <strong>Tournaments and leagues:</strong> creating and running tournaments, pairings,
              result entry, standings and tournament portals.
            </li>
            <li>
              <strong>Venues and communities:</strong> venue pages (shops, clubs, private venues),
              following venues, play groups, friends and matches.
            </li>
            <li>
              <strong>Collection and play:</strong> card collections, wishlists, decks, cubes, card
              scanning, trades and sell lists between users.
            </li>
            <li>
              <strong>Game content:</strong> card databases, rules, rulings, tournament policies,
              community errata put to a vote, quizzes and news.
            </li>
            <li>
              <strong>Integrations:</strong> public API, API keys, MCP server, third-party
              applications via OAuth and Discord bot.
            </li>
          </LegalList>
          <p>
            Game-related content (cards, rules, rulings) is provided for information only. It may
            contain errors, outdated entries or machine translations: only the publishers&apos;
            official documents and on-site judge calls are authoritative.
          </p>
        </>
      ),
    },
    {
      id: "contenus",
      title: "User-published content",
      content: (
        <>
          <p>
            You remain the owner of the content you publish (events, descriptions, images, decks,
            comments, submitted rulings, and so on).
          </p>
          <p>
            By publishing it, you grant Joutes a non-exclusive, worldwide, royalty-free licence to
            host, reproduce, display, technically adapt (resizing, indexing, translation) and
            distribute that content, for the sole duration of its publication on the Platform and
            for the purposes of operating the service, including through the API and integrations.
          </p>
          <p>
            You warrant that you hold the rights required for the content you publish, in
            particular for third-party images, logos and texts, and you are solely responsible for
            its lawfulness.
          </p>
          <p>
            Deleting a piece of content ends its distribution. Content attached to shared data
            (tournament results, match or trade histories) may be retained in order to preserve the
            consistency of other participants&apos; history.
          </p>
        </>
      ),
    },
    {
      id: "conduite",
      title: "Rules of conduct",
      content: (
        <>
          <p>When using the Platform, you undertake not to:</p>
          <LegalList>
            <li>
              publish unlawful, hateful, defamatory, harassing, pornographic or manifestly
              inappropriate content;
            </li>
            <li>
              infringe the rights of others, in particular intellectual property rights;
            </li>
            <li>
              publish false information, fake events or fake results, or cheat in a tournament;
            </li>
            <li>
              harvest, bulk-extract or republish Platform data outside the uses provided for by the
              API;
            </li>
            <li>
              disrupt the operation of the service (abnormal load, circumventing limits, intrusion
              attempts, access to unauthorised areas);
            </li>
            <li>
              use the Platform for advertising or commercial purposes unrelated to games and
              without authorisation;
            </li>
            <li>
              behave disrespectfully towards other users, organisers or judges.
            </li>
          </LegalList>
        </>
      ),
    },
    {
      id: "evenements",
      title: "Events, tournaments and leagues",
      content: (
        <>
          <p>
            Events and tournaments published on the Platform are organised by the users, shops or
            associations that create them, under their sole responsibility. Joutes provides a
            publishing and management tool: the Platform does not organise these events, is not a
            co-organiser, and does not guarantee that they will take place, their conditions or the
            prizes announced.
          </p>
          <p>Organisers undertake to:</p>
          <LegalList>
            <li>publish accurate information (venue, date, format, entry fee, prizes);</li>
            <li>
              comply with the applicable regulations as well as the rules and policies of the
              publishers of the games concerned;
            </li>
            <li>
              use participant information (identity, contact details, results) only for the
              purposes of the event, and comply with data protection law for the processing they
              carry out on their side.
            </li>
          </LegalList>
          <p>
            Participants accept that their username, registrations, pairings and results are
            visible to other participants and, for public events, to anyone viewing the
            corresponding page.
          </p>
        </>
      ),
    },
    {
      id: "echanges",
      title: "Collections, trades and sell lists",
      content: (
        <>
          <p>
            The collection, trade and sell list features are tracking and matchmaking tools. The
            Platform is not a party to transactions concluded between users: it holds no cards,
            collects no payment on that account, ships nothing and offers no completion guarantee.
          </p>
          <p>
            Users are solely responsible for the reality, conformity and lawfulness of their
            transactions, as well as for complying with any tax and reporting obligations of their
            own. It is up to you to take the necessary precautions before any trade or sale.
          </p>
          <p>
            Collection data you enter is self-declared: it constitutes neither proof of ownership
            nor a valuation.
          </p>
        </>
      ),
    },
    {
      id: "moderation",
      title: "Moderation and reports",
      content: (
        <>
          <p>
            Any signed-in user can report content they believe breaches these Terms or the law,
            using the report button shown on the content concerned.
          </p>
          <p>
            Reports are reviewed by the Platform team. We may hide, edit or delete any content that
            is manifestly unlawful or contrary to the Terms, and restrict access for the account
            behind the publication, without this creating a general obligation to monitor content.
          </p>
          <p>
            Abusive reports, or repeated reports without grounds, may themselves lead to a
            restriction.
          </p>
        </>
      ),
    },
    {
      id: "developpeurs",
      title: "API, MCP and third-party applications",
      content: (
        <>
          <p>
            The Platform exposes an API, an MCP server and an OAuth authorisation mechanism
            allowing third-party applications to access certain data. Use of these interfaces is
            described on the{" "}
            <Link href="/integrations" className="text-primary hover:underline">
              Integrations and Developers
            </Link>{" "}
            page.
          </p>
          <LegalList>
            <li>
              Your API keys are personal and confidential: the calls made with them are attributed
              to you.
            </li>
            <li>
              By authorising a third-party application, you give it access to the data covered by
              the authorisation granted. You can revoke that access from your account.
            </li>
            <li>
              Third-party applications are neither published, controlled nor guaranteed by Joutes;
              their own terms and policies apply to them.
            </li>
            <li>
              We may apply usage limits and suspend a key or an application in the event of abuse,
              excessive load or risk to the service.
            </li>
          </LegalList>
          <p>
            The API is provided without any stability guarantee: its formats and endpoints may
            change.
          </p>
        </>
      ),
    },
    {
      id: "ia",
      title: "AI-assisted features",
      content: (
        <>
          <p>
            Some features rely on artificial intelligence models provided by a third-party
            supplier, for example recognising scanned cards, checking decks, importing quizzes or
            extracting event information.
          </p>
          <p>
            The results produced are indicative and may be incomplete or wrong. They replace
            neither your own verification, nor a judge&apos;s decision, nor the publishers&apos;
            official documents.
          </p>
          <p>
            The content you submit to these features is sent to the supplier concerned in order to
            produce the response. Details are set out in the{" "}
            <Link href="/privacy" className="text-primary hover:underline">
              privacy policy
            </Link>
            .
          </p>
        </>
      ),
    },
    {
      id: "propriete",
      title: "Intellectual property",
      content: (
        <>
          <p>
            The Platform, its structure, its interface and its graphic elements are protected by
            intellectual property law. Components released as open source remain governed by their
            respective licences.
          </p>
          <p>
            The names, logos, card artwork, rules texts and trademarks of the games mentioned
            belong to their respective publishers and rights holders. They are used for information
            and community reference purposes, within the scope of the relevant publishers&apos;
            fan content policies.
          </p>
          <p>
            <strong>Joutes is not affiliated with any game publisher</strong> and is neither
            sponsored nor endorsed by them.
          </p>
          <p>
            Any rights holder who believes that a piece of content infringes their rights may
            contact us through the{" "}
            <a href="#contact" className="text-primary hover:underline">
              contact channels
            </a>
            : the disputed content will be reviewed and, where appropriate, removed.
          </p>
        </>
      ),
    },
    {
      id: "donnees",
      title: "Personal data",
      content: (
        <>
          <p>
            The processing of users&apos; personal data is described in detail in the{" "}
            <Link href="/privacy" className="text-primary hover:underline">
              privacy policy
            </Link>
            , which forms an integral part of these Terms. It sets out the data collected, the
            purposes and legal bases, the recipients, the retention periods and how to exercise
            your rights.
          </p>
          <p>
            Some of the information you provide is public by nature (username, participation in
            public events, tournament results, your profile if you have made it public). It is up
            to you not to publish personal information you do not wish to make accessible.
          </p>
        </>
      ),
    },
    {
      id: "disponibilite",
      title: "Availability and evolution of the service",
      content: (
        <>
          <p>
            The Platform is provided &quot;as is&quot; and &quot;as available&quot;. We strive to
            keep the service accessible and reliable, without being able to guarantee continuous
            availability or the absence of errors.
          </p>
          <p>
            Access may be suspended, limited or interrupted at any time, in particular for
            maintenance, updates, security reasons or technical constraints related to our
            suppliers.
          </p>
          <p>
            Features may be added, changed or withdrawn, including where they are offered on an
            experimental basis. We recommend regularly exporting the data you care about wherever
            that option is available.
          </p>
        </>
      ),
    },
    {
      id: "responsabilite",
      title: "Limitation of liability",
      content: (
        <>
          <p>
            Our liability is limited to direct damage resulting from proven fault on our part. We
            cannot be held liable for:
          </p>
          <LegalList>
            <li>content published by users, its accuracy and its lawfulness;</li>
            <li>
              the running, cancellation or consequences of events, tournaments, trades and sales
              organised or concluded between users;
            </li>
            <li>
              interactions and disputes between users, including outside the Platform;
            </li>
            <li>
              errors or delays affecting game data, rules, rulings or the results produced by
              automated features;
            </li>
            <li>
              indirect damage (loss of data, loss of opportunity, commercial or reputational harm);
            </li>
            <li>
              unavailability, malfunction or loss attributable to a third-party service or to an
              event of force majeure.
            </li>
          </LegalList>
          <p>
            Nothing in these Terms operates to exclude liability that cannot lawfully be limited,
            in particular in the event of gross negligence or wilful misconduct.
          </p>
        </>
      ),
    },
    {
      id: "resiliation",
      title: "Suspension and deletion of the account",
      content: (
        <>
          <p>
            You may stop using the Platform at any time and request the deletion of your account
            through the{" "}
            <a href="#contact" className="text-primary hover:underline">
              contact channels
            </a>
            . Deletion results in the erasure or anonymisation of your personal data under the
            conditions described in the{" "}
            <Link href="/privacy" className="text-primary hover:underline">
              privacy policy
            </Link>
            .
          </p>
          <p>
            We may suspend or delete an account, and remove the associated content, in the event of
            a breach of these Terms, unlawful activity, risk to the security of the service or harm
            to other users. Except in cases of urgency, manifest unlawfulness or repeat offence,
            prior notice is given to the user concerned, who may challenge the measure through the
            contact channels.
          </p>
        </>
      ),
    },
    {
      id: "droit",
      title: "Governing law and disputes",
      content: (
        <>
          <p>
            These Terms are governed by French law. They are written in French; any translation is
            provided for convenience and the French text prevails.
          </p>
          <p>
            Should a difficulty arise, we invite you to contact us first so that an amicable
            solution can be sought. Failing agreement, the dispute may be brought before the
            competent French courts. If you are a consumer, you retain the right to bring
            proceedings before the courts of your place of residence.
          </p>
        </>
      ),
    },
    {
      id: "contact",
      title: "Contact",
      content: (
        <>
          <p>
            For any question about these Terms, to report content or for a request concerning your
            account:
          </p>
          <LegalList>
            <li>
              <strong>Discord:</strong> <LegalLink href={LEGAL_CONTACT.discord} />
            </li>
            <li>
              <strong>GitHub:</strong> <LegalLink href={LEGAL_CONTACT.github} />
            </li>
          </LegalList>
          <p>
            Requests relating to personal data are handled as described in the{" "}
            <Link href="/privacy" className="text-primary hover:underline">
              privacy policy
            </Link>
            .
          </p>
        </>
      ),
    },
  ],
};
