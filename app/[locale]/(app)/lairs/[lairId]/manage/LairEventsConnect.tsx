"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { DateTime } from "luxon";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Lock,
  Mail,
  MessageCircle,
  RefreshCw,
  XCircle,
} from "lucide-react";

import { Link } from "@/i18n/navigation.ts";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { cn } from "@/lib/utils.ts";
import type { EventSource, LairEventsRefreshReport } from "@/lib/types/Lair.ts";
import type { GameSummary, RecognizedSite, RefreshFrequency } from "@/lib/events/connect.ts";
import {
  findPresetForUrl,
  nextRefreshAt,
  presetAsksVenues,
  unknownGamesFromWarnings,
  venuesMatchingAddress,
} from "@/lib/events/connect.ts";
import {
  connectEventPage,
  disconnectEventPage,
  previewEventPage,
  recognizeEventPage,
  refreshLairEventsNow,
  requestEventSourceHelp,
  updateEventPageSettings,
  type EventPagePreview,
  type EventsConnectError,
} from "./events-actions.ts";

const DISCORD_URL = "https://discord.gg/dZEGkZwJGB";
const CONTACT_EMAIL = "contact@joutes.app";
const PARIS = "Europe/Paris";

/** Un jeu du site pour lequel le gérant dit « il n'est pas sur Joutes ». */
const NOT_ON_JOUTES = "__none__";

type PendingRequest = { requestedAt: string; url?: string };

type Props = {
  lairId: string;
  address?: string;
  isPrivate: boolean;
  isPro: boolean;
  userEmail?: string;
  /** La source connectée par le gérant, s'il y en a une. */
  source: EventSource | null;
  frequency: RefreshFrequency;
  report: LairEventsRefreshReport | null;
  /** Combien de sources l'équipe a configurées pour ce lieu, hors celle du gérant. */
  teamSourceCount: number;
  games: { name: string }[];
  pendingRequest: PendingRequest | null;
};

type View = "intro" | "wizard" | "connected" | "settings";

/**
 * L'onglet « Événements » de l'écran de gestion : connecter son site.
 *
 * Écrit pour un gérant de boutique, pas pour l'équipe : jamais de
 * « sélecteur », d'« URL » ni de « source ». Il colle l'adresse d'une page,
 * Joutes la reconnaît ou non. Reconnue : trois écrans — villes, jeux,
 * vérification — puis un bouton. Inconnue : la demande part à l'équipe, qui
 * configure la lecture depuis l'administration. Le mode IA n'apparaît jamais
 * ici.
 *
 * Une fois connecté, l'onglet dit l'état en une phrase et ne montre qu'une
 * action à la fois : le jeu à choisir, sinon rien. Les réglages fins sont
 * derrière « Modifier ».
 */
export default function LairEventsConnect(props: Props) {
  const t = useTranslations("Lairs.manage.events");
  const [view, setView] = useState<View>(props.source ? "connected" : "intro");
  const [source, setSource] = useState(props.source);
  const [frequency, setFrequency] = useState(props.frequency);
  const [report, setReport] = useState(props.report);
  const [pendingRequest, setPendingRequest] = useState(props.pendingRequest);

  if (props.isPrivate) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">{t("private")}</CardContent>
      </Card>
    );
  }

  const connected = (state: { source: EventSource; frequency: RefreshFrequency; report: LairEventsRefreshReport | null }) => {
    setSource(state.source);
    setFrequency(state.frequency);
    setReport(state.report);
    setView("connected");
  };

  if (view === "wizard") {
    return (
      <Wizard
        lairId={props.lairId}
        address={props.address}
        isPro={props.isPro}
        userEmail={props.userEmail}
        games={props.games}
        pendingRequest={pendingRequest}
        onRequested={setPendingRequest}
        onCancel={() => setView(source ? "connected" : "intro")}
        onConnected={connected}
      />
    );
  }

  if (view === "settings" && source) {
    return (
      <SettingsView
        lairId={props.lairId}
        source={source}
        frequency={frequency}
        isPro={props.isPro}
        games={props.games}
        onCancel={() => setView("connected")}
        onSaved={connected}
      />
    );
  }

  if (view === "connected" && source) {
    return (
      <ConnectedView
        lairId={props.lairId}
        source={source}
        frequency={frequency}
        report={report}
        isPro={props.isPro}
        pendingRequest={pendingRequest}
        onRequested={setPendingRequest}
        onReport={setReport}
        onEdit={() => setView("settings")}
        onChangePage={() => setView("wizard")}
        onDisconnected={() => {
          setSource(null);
          setReport(null);
          setView("intro");
        }}
      />
    );
  }

  return (
    <IntroView
      lairId={props.lairId}
      teamSourceCount={props.teamSourceCount}
      report={report}
      pendingRequest={pendingRequest}
      onRequested={setPendingRequest}
      onReport={setReport}
      onStart={() => setView("wizard")}
    />
  );
}

// ---------------------------------------------------------------------------
// Avant connexion
// ---------------------------------------------------------------------------

function IntroView({
  lairId,
  teamSourceCount,
  report,
  pendingRequest,
  onRequested,
  onReport,
  onStart,
}: {
  lairId: string;
  teamSourceCount: number;
  report: LairEventsRefreshReport | null;
  pendingRequest: PendingRequest | null;
  onRequested: (request: PendingRequest) => void;
  onReport: (report: LairEventsRefreshReport) => void;
  onStart: () => void;
}) {
  const t = useTranslations("Lairs.manage.events");

  // L'équipe a déjà branché une lecture : le gérant n'a rien à connecter, et
  // en brancher une seconde ferait des doublons.
  if (teamSourceCount > 0) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="flex items-start gap-3">
              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/10">
                <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
              </span>
              <div className="space-y-1">
                <h2 className="text-xl font-semibold">{t("team.title")}</h2>
                <p className="text-sm text-muted-foreground">{t("team.description")}</p>
              </div>
            </div>
            <ReportSummary report={report} />
            <RefreshNowButton lairId={lairId} onReport={onReport} />
          </CardContent>
        </Card>
        <HelpCard
          lairId={lairId}
          title={t("help.title")}
          description={t("help.connectedDescription")}
          pendingRequest={pendingRequest}
          onRequested={onRequested}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="grid gap-8 pt-6 lg:grid-cols-2 lg:items-center">
          <div className="space-y-4">
            <h2 className="text-2xl font-bold">{t("intro.title")}</h2>
            <p className="text-sm text-muted-foreground">{t("intro.description")}</p>
            <ol className="space-y-2">
              {(["one", "two", "three"] as const).map((step, index) => (
                <li key={step} className="flex items-center gap-3 text-sm">
                  <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                    {index + 1}
                  </span>
                  {t(`intro.steps.${step}`)}
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap items-center gap-4 pt-2">
              <Button size="lg" onClick={onStart}>
                {t("intro.start")}
                <ArrowRight className="ml-2 size-4" aria-hidden />
              </Button>
              <span className="text-xs text-muted-foreground">{t("intro.duration")}</span>
            </div>
          </div>
          <div className="space-y-2 rounded-xl border border-dashed bg-muted/40 p-5">
            <span className="text-xs font-medium text-muted-foreground">{t("intro.previewLabel")}</span>
            {(["one", "two", "three"] as const).map((sample) => (
              <div
                key={sample}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-background px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium">{t(`intro.samples.${sample}.name`)}</div>
                  <div className="text-xs text-muted-foreground">{t(`intro.samples.${sample}.meta`)}</div>
                </div>
                <span
                  className={cn(
                    "text-xs",
                    sample === "three" ? "text-destructive" : "text-emerald-600 dark:text-emerald-400",
                  )}
                >
                  {t(`intro.samples.${sample}.status`)}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="space-y-3 pt-6">
            <div className="space-y-1">
              <h3 className="font-semibold">{t("manual.title")}</h3>
              <p className="text-sm text-muted-foreground">{t("manual.description")}</p>
            </div>
            <Button variant="outline" asChild>
              <Link href={`/lairs/${lairId}/events/new`}>{t("manual.create")}</Link>
            </Button>
          </CardContent>
        </Card>
        <HelpCard
          lairId={lairId}
          title={t("help.introTitle")}
          description={t("help.introDescription")}
          pendingRequest={pendingRequest}
          onRequested={onRequested}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// L'assistant
// ---------------------------------------------------------------------------

type StepKey = "site" | "venues" | "games" | "check";

function Wizard({
  lairId,
  address,
  isPro,
  userEmail,
  games,
  pendingRequest,
  onRequested,
  onCancel,
  onConnected,
}: {
  lairId: string;
  address?: string;
  isPro: boolean;
  userEmail?: string;
  games: { name: string }[];
  pendingRequest: PendingRequest | null;
  onRequested: (request: PendingRequest) => void;
  onCancel: () => void;
  onConnected: (state: { source: EventSource; frequency: RefreshFrequency; report: LairEventsRefreshReport | null }) => void;
}) {
  const t = useTranslations("Lairs.manage.events");
  const [step, setStep] = useState<StepKey>("site");
  const [url, setUrl] = useState("");
  const [checkedUrl, setCheckedUrl] = useState<string | null>(null);
  const [site, setSite] = useState<RecognizedSite | null>(null);
  const [venuesProbe, setVenuesProbe] = useState<{ available: string[]; counts: Record<string, number> } | null>(null);
  const [venues, setVenues] = useState<string[]>([]);
  const [preview, setPreview] = useState<EventPagePreview | null>(null);
  const [aliases, setAliases] = useState<Record<string, string>>({});
  const [frequency, setFrequency] = useState<RefreshFrequency>("weekly");
  const [busy, startBusy] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const steps: StepKey[] = site?.asksVenues ? ["site", "venues", "games", "check"] : ["site", "games", "check"];

  const describeError = (code: EventsConnectError, message?: string) =>
    code === "READ_FAILED" && message ? `${t(`errors.${code}`)} ${message}` : t(`errors.${code}`);

  const input = () => ({ url: checkedUrl ?? url, presetKey: site?.key ?? "", venues, gameAliases: aliases });

  const check = () => {
    setError(null);
    startBusy(async () => {
      const result = await recognizeEventPage(lairId, url.trim());
      if (!result.success) {
        setError(describeError(result.error));
        return;
      }
      setCheckedUrl(url.trim());
      setSite(result.site);
      setVenuesProbe(null);
      setVenues([]);
      setPreview(null);
      setAliases({});
    });
  };

  const leaveSite = () => {
    if (!site) return;
    setError(null);
    startBusy(async () => {
      if (site.asksVenues) {
        const result = await previewEventPage(lairId, { ...input(), venues: [] }, { probeVenues: true });
        if (!result.success) {
          setError(describeError(result.error, result.message));
          return;
        }
        const available = result.preview.venues?.available ?? [];
        setVenuesProbe({ available, counts: result.preview.venues?.counts ?? {} });
        if (venues.length === 0) setVenues(venuesMatchingAddress(available, address));
        setStep("venues");
        return;
      }

      const result = await previewEventPage(lairId, input());
      if (!result.success) {
        setError(describeError(result.error, result.message));
        return;
      }
      setPreview(result.preview);
      setStep("games");
    });
  };

  const leaveVenues = () => {
    setError(null);
    if (venues.length === 0) {
      setError(t("errors.VENUES_REQUIRED"));
      return;
    }
    startBusy(async () => {
      const result = await previewEventPage(lairId, input());
      if (!result.success) {
        setError(describeError(result.error, result.message));
        return;
      }
      setPreview(result.preview);
      setStep("games");
    });
  };

  const activate = () => {
    setError(null);
    startBusy(async () => {
      const result = await connectEventPage(lairId, input(), frequency);
      if (!result.success) {
        setError(describeError(result.error, result.message));
        return;
      }
      toast.success(t("connected.activated"));
      onConnected(result.state);
    });
  };

  const back = () => {
    const index = steps.indexOf(step);
    if (index <= 0) {
      onCancel();
      return;
    }
    setError(null);
    setStep(steps[index - 1]);
  };

  const unknownCount = preview ? preview.games.filter((game) => !game.canonical && !aliases[game.name]).length : 0;

  return (
    <div className="space-y-6">
      <StepsBar steps={steps} current={step} />

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}

      {step === "site" && (
        <Card>
          <CardContent className="space-y-5 pt-6">
            <StepTitle title={t("site.title")} description={t("site.description")} />
            <div className="space-y-2">
              <label htmlFor="events-page-url" className="text-sm font-medium">
                {t("site.urlLabel")}
              </label>
              <div className="flex flex-wrap gap-2">
                <Input
                  id="events-page-url"
                  type="url"
                  inputMode="url"
                  value={url}
                  onChange={(event) => {
                    setUrl(event.target.value);
                    if (checkedUrl && event.target.value.trim() !== checkedUrl) {
                      setSite(null);
                      setCheckedUrl(null);
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      check();
                    }
                  }}
                  placeholder="https://votreboutique.fr/evenements"
                  className="h-11 min-w-0 flex-1 text-base"
                />
                <Button variant="outline" className="h-11" onClick={check} disabled={busy || url.trim() === ""}>
                  {busy && !checkedUrl ? t("site.checking") : t("site.check")}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{t("site.urlHint")}</p>
            </div>

            {checkedUrl && site && (
              <div className="flex items-start gap-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                <div className="space-y-1 text-sm">
                  <p className="font-semibold">{t("site.known", { name: site.label })}</p>
                  <p>{site.asksVenues ? t("site.knownVenues") : t("site.knownSimple")}</p>
                </div>
              </div>
            )}

            {checkedUrl && !site && (
              <UnknownSiteBox
                lairId={lairId}
                url={checkedUrl}
                userEmail={userEmail}
                pendingRequest={pendingRequest}
                onRequested={onRequested}
              />
            )}

            <WizardFooter
              backLabel={t("wizard.cancel")}
              nextLabel={t("wizard.next")}
              note={checkedUrl && !site ? t("site.unknownNote") : t("site.nothingSaved")}
              onBack={back}
              onNext={leaveSite}
              nextDisabled={!site || busy}
              busy={busy && Boolean(site)}
            />
          </CardContent>
        </Card>
      )}

      {step === "venues" && venuesProbe && (
        <Card>
          <CardContent className="space-y-5 pt-6">
            <StepTitle title={t("venues.title")} description={t("venues.description")} />
            <VenuesPicker
              available={venuesProbe.available}
              counts={venuesProbe.counts}
              selected={venues}
              onChange={setVenues}
            />
            {venuesMatchingAddress(venuesProbe.available, address).length > 0 && (
              <Note icon="ok">
                {t("venues.prechecked", { cities: venuesMatchingAddress(venuesProbe.available, address).join(", ") })}
              </Note>
            )}
            <WizardFooter
              backLabel={t("wizard.back")}
              nextLabel={t("wizard.next")}
              onBack={back}
              onNext={leaveVenues}
              nextDisabled={busy || venues.length === 0}
              busy={busy}
            />
          </CardContent>
        </Card>
      )}

      {step === "games" && preview && (
        <Card>
          <CardContent className="space-y-5 pt-6">
            <StepTitle title={t("games.title")} description={t("games.description")} />
            <GamesMapper summary={preview.games} aliases={aliases} games={games} onChange={setAliases} />
            <Note icon="warn">{t("games.note")}</Note>
            <WizardFooter
              backLabel={t("wizard.back")}
              nextLabel={t("wizard.next")}
              note={unknownCount > 0 ? t("games.remaining", { count: unknownCount }) : undefined}
              onBack={back}
              onNext={() => setStep("check")}
              nextDisabled={busy}
            />
          </CardContent>
        </Card>
      )}

      {step === "check" && preview && (
        <Card>
          <CardContent className="space-y-5 pt-6">
            <StepTitle title={t("check.title")} description={t("check.description")} />
            <PreviewStats preview={preview} venues={venues} aliases={aliases} />
            <EventsPreviewList preview={preview} aliases={aliases} />
            <FrequencyChoice value={frequency} isPro={isPro} onChange={setFrequency} />
            <Note icon="ok">{t("check.note")}</Note>
            <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
              <div className="flex flex-wrap items-center gap-4">
                <Button variant="outline" onClick={back} disabled={busy}>
                  {t("wizard.back")}
                </Button>
                <a
                  href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(t("check.reportSubject"))}`}
                  className="text-sm text-muted-foreground underline underline-offset-2"
                >
                  {t("check.report")}
                </a>
              </div>
              <Button size="lg" onClick={activate} disabled={busy}>
                {busy ? t("check.activating") : t("check.activate")}
                {!busy && <ArrowRight className="ml-2 size-4" aria-hidden />}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StepsBar({ steps, current }: { steps: StepKey[]; current: StepKey }) {
  const t = useTranslations("Lairs.manage.events.wizard.steps");
  const currentIndex = steps.indexOf(current);

  return (
    <ol className="flex flex-wrap items-center gap-3">
      {steps.map((step, index) => {
        const done = index < currentIndex;
        const active = index === currentIndex;
        return (
          <li key={step} className="flex items-center gap-3">
            <span
              className={cn(
                "inline-flex size-7 items-center justify-center rounded-full text-xs font-semibold",
                done && "bg-emerald-600 text-white",
                active && "bg-primary text-primary-foreground",
                !done && !active && "border text-muted-foreground",
              )}
              aria-hidden
            >
              {done ? <Check className="size-4" /> : index + 1}
            </span>
            <span className={cn("text-sm", active ? "font-semibold" : done ? "" : "text-muted-foreground")}>
              {t(step)}
            </span>
            {index < steps.length - 1 && <span className="hidden h-px w-8 bg-border sm:block" aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}

function StepTitle({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-1">
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function WizardFooter({
  backLabel,
  nextLabel,
  note,
  onBack,
  onNext,
  nextDisabled,
  busy,
}: {
  backLabel: string;
  nextLabel: string;
  note?: string;
  onBack: () => void;
  onNext: () => void;
  nextDisabled: boolean;
  busy?: boolean;
}) {
  const t = useTranslations("Lairs.manage.events.wizard");
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
      <div className="flex flex-wrap items-center gap-4">
        <Button variant="outline" onClick={onBack}>
          {backLabel}
        </Button>
        {note && <span className="text-xs text-muted-foreground">{note}</span>}
      </div>
      <Button onClick={onNext} disabled={nextDisabled}>
        {busy ? t("reading") : nextLabel}
      </Button>
    </div>
  );
}

function Note({ icon, children }: { icon: "ok" | "warn"; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
      {icon === "ok" ? (
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
      ) : (
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
      )}
      <span>{children}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Site inconnu : demander à l'équipe
// ---------------------------------------------------------------------------

function UnknownSiteBox({
  lairId,
  url,
  userEmail,
  pendingRequest,
  onRequested,
}: {
  lairId: string;
  url: string;
  userEmail?: string;
  pendingRequest: PendingRequest | null;
  onRequested: (request: PendingRequest) => void;
}) {
  const t = useTranslations("Lairs.manage.events.unknown");
  const [note, setNote] = useState("");
  const [sending, startSending] = useTransition();

  const send = () => {
    startSending(async () => {
      const result = await requestEventSourceHelp(lairId, { url, note });
      if (!result.success) {
        toast.error(t("failed"));
        return;
      }
      toast.success(t("sent"));
      onRequested({ requestedAt: result.requestedAt, url });
    });
  };

  const alreadySent = pendingRequest?.url === url;

  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
      <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
      <div className="min-w-0 flex-1 space-y-3 text-sm">
        <div className="space-y-1">
          <p className="font-semibold">{t("title")}</p>
          <p>{t("description")}</p>
        </div>
        {alreadySent ? (
          <p className="font-medium">{t("alreadySent")}</p>
        ) : (
          <>
            <div className="space-y-1">
              <label htmlFor="events-page-note" className="text-xs font-medium">
                {t("noteLabel")}
              </label>
              <Textarea
                id="events-page-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder={t("notePlaceholder")}
                rows={3}
                className="bg-background"
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={send} disabled={sending}>
                {sending ? t("sending") : t("send")}
              </Button>
              {userEmail && <span className="text-xs">{t("notify", { email: userEmail })}</span>}
            </div>
          </>
        )}
        <ContactLine />
      </div>
    </div>
  );
}

/** Le Discord, le courriel, et ce que Joutes Pro ajoute. */
function ContactLine() {
  const t = useTranslations("Lairs.manage.events.contact");
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span>{t("lead")}</span>
        <a
          href={DISCORD_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 underline underline-offset-2"
        >
          <MessageCircle className="size-4" aria-hidden />
          {t("discord")}
        </a>
        <a href={`mailto:${CONTACT_EMAIL}`} className="inline-flex items-center gap-1.5 underline underline-offset-2">
          <Mail className="size-4" aria-hidden />
          {CONTACT_EMAIL}
        </a>
      </div>
      <p className="text-xs text-muted-foreground">{t("pro")}</p>
    </div>
  );
}

function HelpCard({
  lairId,
  title,
  description,
  pendingRequest,
  onRequested,
  extraActions,
}: {
  lairId: string;
  title: string;
  description: string;
  pendingRequest: PendingRequest | null;
  onRequested: (request: PendingRequest) => void;
  extraActions?: ReactNode;
}) {
  const t = useTranslations("Lairs.manage.events.help");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [sending, startSending] = useTransition();

  const send = () => {
    startSending(async () => {
      const result = await requestEventSourceHelp(lairId, { url: url.trim(), note });
      if (!result.success) {
        toast.error(result.error === "INVALID" ? t("invalidUrl") : t("failed"));
        return;
      }
      toast.success(t("sent"));
      onRequested({ requestedAt: result.requestedAt, ...(url.trim() ? { url: url.trim() } : {}) });
      setOpen(false);
    });
  };

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="space-y-1">
          <h3 className="font-semibold">{title}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>

        {pendingRequest && (
          <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
            {t("pending", {
              date: DateTime.fromISO(pendingRequest.requestedAt).setZone(PARIS).setLocale(locale).toFormat("D"),
            })}
          </p>
        )}

        {open ? (
          <div className="space-y-3">
            <div className="space-y-1">
              <label htmlFor="help-url" className="text-xs font-medium">
                {t("urlLabel")}
              </label>
              <Input
                id="help-url"
                type="url"
                inputMode="url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="help-note" className="text-xs font-medium">
                {t("noteLabel")}
              </label>
              <Textarea
                id="help-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder={t("notePlaceholder")}
                rows={3}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={send} disabled={sending}>
                {sending ? t("sending") : t("send")}
              </Button>
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={sending}>
                {t("cancel")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setOpen(true)}>
              {pendingRequest ? t("askAgain") : t("ask")}
            </Button>
            {extraActions}
          </div>
        )}

        <ContactLine />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Les villes
// ---------------------------------------------------------------------------

function VenuesPicker({
  available,
  counts,
  selected,
  onChange,
}: {
  available: string[];
  counts: Record<string, number>;
  selected: string[];
  onChange: (venues: string[]) => void;
}) {
  const t = useTranslations("Lairs.manage.events.venues");
  // Les villes de la page, puis celles déjà cochées qu'elle ne propose plus :
  // un gérant ne perd pas une ville parce que le site l'a renommée.
  const all = useMemo(
    () => [...available, ...selected.filter((venue) => !available.includes(venue))],
    [available, selected],
  );

  if (all.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("none")}</p>;
  }

  const toggle = (venue: string) => {
    onChange(selected.includes(venue) ? selected.filter((item) => item !== venue) : [...selected, venue]);
  };

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {all.map((venue) => {
        const checked = selected.includes(venue);
        const count = counts[venue];
        return (
          <label
            key={venue}
            className={cn(
              "flex min-h-14 cursor-pointer items-center justify-between gap-3 rounded-lg border px-4 py-2",
              checked ? "border-primary bg-muted/60" : "hover:bg-muted/40",
            )}
          >
            <span className="flex items-center gap-3">
              <input type="checkbox" className="sr-only" checked={checked} onChange={() => toggle(venue)} />
              <span
                className={cn(
                  "inline-flex size-6 shrink-0 items-center justify-center rounded-md border",
                  checked ? "border-primary bg-primary text-primary-foreground" : "bg-background",
                )}
                aria-hidden
              >
                {checked && <Check className="size-4" />}
              </span>
              <span className={cn("text-base", checked && "font-semibold")}>{venue}</span>
            </span>
            {count !== undefined && (
              <span className="text-xs text-muted-foreground">{t("count", { count })}</span>
            )}
          </label>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Les jeux
// ---------------------------------------------------------------------------

function GamesMapper({
  summary,
  aliases,
  games,
  onChange,
}: {
  summary: GameSummary[];
  aliases: Record<string, string>;
  games: { name: string }[];
  onChange: (aliases: Record<string, string>) => void;
}) {
  const t = useTranslations("Lairs.manage.events.games");
  const sortedGames = useMemo(() => [...games].sort((left, right) => left.name.localeCompare(right.name)), [games]);

  if (summary.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("none")}</p>;
  }

  const set = (siteName: string, value: string) => {
    const next = { ...aliases };
    if (value === NOT_ON_JOUTES || value === "") {
      delete next[siteName];
    } else {
      next[siteName] = value;
    }
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-4 px-4 text-xs font-medium text-muted-foreground">
        <span>{t("onSite")}</span>
        <span>{t("onJoutes")}</span>
      </div>
      {summary.map((game) => {
        const alias = aliases[game.name];
        const resolved = alias ?? game.canonical;
        const unresolved = !resolved;
        return (
          <div
            key={game.name}
            className={cn(
              "grid items-center gap-4 rounded-lg border px-4 py-3 sm:grid-cols-2",
              unresolved && "border-amber-500/40 bg-amber-500/10",
            )}
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{game.name}</div>
              <div className="text-xs text-muted-foreground">{t("count", { count: game.count })}</div>
            </div>
            {game.canonical && !alias ? (
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                {game.canonical}
              </div>
            ) : (
              <Select value={alias ?? ""} onValueChange={(value) => set(game.name, value)}>
                <SelectTrigger
                  className={cn("h-11 w-full bg-background", unresolved && "border-amber-600")}
                  aria-label={t("chooseFor", { name: game.name })}
                >
                  <SelectValue placeholder={t("choose")} />
                </SelectTrigger>
                <SelectContent>
                  {sortedGames.map((candidate) => (
                    <SelectItem key={candidate.name} value={candidate.name}>
                      {candidate.name}
                    </SelectItem>
                  ))}
                  <SelectItem value={NOT_ON_JOUTES}>{t("notOnJoutes")}</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// La vérification
// ---------------------------------------------------------------------------

function PreviewStats({
  preview,
  venues,
  aliases,
}: {
  preview: EventPagePreview;
  venues: string[];
  aliases: Record<string, string>;
}) {
  const t = useTranslations("Lairs.manage.events.check");
  const locale = useLocale();
  const recognized = preview.games.filter((game) => game.canonical || aliases[game.name]).length;

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Stat value={String(preview.count)} label={venues.length > 0 ? t("foundIn", { cities: venues.join(", ") }) : t("found")} />
      <Stat value={String(preview.games.length)} label={t("gamesRecognized", { recognized })} />
      <Stat
        value={preview.lastDate ? DateTime.fromISO(preview.lastDate).setZone(PARIS).setLocale(locale).toFormat("d LLL") : "—"}
        label={t("lastDate")}
      />
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="space-y-0.5 rounded-lg bg-muted/60 p-4">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function EventsPreviewList({ preview, aliases }: { preview: EventPagePreview; aliases: Record<string, string> }) {
  const t = useTranslations("Lairs.manage.events.check");
  const locale = useLocale();
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? preview.events : preview.events.slice(0, 4);
  const hidden = preview.events.length - shown.length;

  if (preview.events.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("noEvents")}</p>;
  }

  return (
    <div className="space-y-2">
      <span className="text-sm font-medium">{t("listTitle")}</span>
      {shown.map((event, index) => {
        const start = DateTime.fromISO(event.startDateTime).setZone(PARIS).setLocale(locale);
        const end = DateTime.fromISO(event.endDateTime).setZone(PARIS).setLocale(locale);
        const meta = [
          aliases[event.gameName] ?? event.gameName,
          `${start.toFormat("ccc d LLL, HH:mm")} – ${end.toFormat("HH:mm")}`,
          event.price !== undefined ? `${event.price} €` : null,
        ]
          .filter(Boolean)
          .join(" · ");
        return (
          <div
            key={`${event.name}-${event.startDateTime}-${index}`}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-3"
          >
            <div className="min-w-0">
              <div className="text-sm font-medium">{event.name}</div>
              <div className="text-xs text-muted-foreground">{meta}</div>
            </div>
            <span
              className={cn(
                "text-xs font-medium",
                event.status === "available" ? "text-emerald-600 dark:text-emerald-400" : "text-destructive",
              )}
            >
              {t(`status.${event.status === "available" ? "available" : event.status === "cancelled" ? "cancelled" : "soldOut"}`)}
            </span>
          </div>
        );
      })}
      {hidden > 0 && (
        <button type="button" className="text-xs text-muted-foreground underline underline-offset-2" onClick={() => setExpanded(true)}>
          {t("seeMore", { count: hidden })}
        </button>
      )}
      {expanded && preview.count > preview.events.length && (
        <p className="text-xs text-muted-foreground">{t("andMore", { count: preview.count - preview.events.length })}</p>
      )}
    </div>
  );
}

function FrequencyChoice({
  value,
  isPro,
  onChange,
}: {
  value: RefreshFrequency;
  isPro: boolean;
  onChange: (frequency: RefreshFrequency) => void;
}) {
  const t = useTranslations("Lairs.manage.events.frequency");

  const option = (frequency: RefreshFrequency, locked: boolean) => {
    const selected = value === frequency;
    return (
      <label
        className={cn(
          "flex min-h-14 items-center justify-between gap-3 rounded-lg border px-4 py-3",
          selected && "border-primary bg-muted/60",
          locked ? "cursor-not-allowed opacity-70" : "cursor-pointer hover:bg-muted/40",
        )}
      >
        <span className="flex items-center gap-3">
          <input
            type="radio"
            name="events-refresh-frequency"
            className="sr-only"
            checked={selected}
            disabled={locked}
            onChange={() => onChange(frequency)}
          />
          <span
            className={cn(
              "inline-flex size-5 shrink-0 items-center justify-center rounded-full border",
              selected ? "border-[6px] border-primary bg-background" : "bg-background",
            )}
            aria-hidden
          />
          <span className="flex flex-col">
            <span className={cn("inline-flex items-center gap-1.5 text-sm", selected && "font-semibold")}>
              {locked && <Lock className="size-4" aria-hidden />}
              {t(`${frequency}.label`)}
            </span>
            <span className="text-xs text-muted-foreground">
              {frequency === "daily" ? (isPro ? t("daily.hintPro") : t("daily.hintLocked")) : t("weekly.hint")}
            </span>
          </span>
        </span>
        {locked && (
          <Link href="/pricing" className="whitespace-nowrap text-xs underline underline-offset-2">
            {t("discoverPro")}
          </Link>
        )}
      </label>
    );
  };

  return (
    <div className="space-y-2">
      <div className="space-y-0.5">
        <span className="text-sm font-medium">{t("title")}</span>
        <p className="text-xs text-muted-foreground">{t("description")}</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {option("weekly", false)}
        {option("daily", !isPro)}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Connecté
// ---------------------------------------------------------------------------

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function ReportSummary({ report }: { report: LairEventsRefreshReport | null }) {
  const t = useTranslations("Lairs.manage.events.connected");
  const locale = useLocale();
  if (!report) return null;

  const failing = report.sources.filter((source) => !source.ok);
  const total = report.inserted + report.updated + report.unchanged;
  const at = DateTime.fromISO(report.at).setZone(PARIS).setLocale(locale);

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
      {failing.length > 0 ? (
        <XCircle className="size-4 shrink-0 text-destructive" aria-hidden />
      ) : (
        <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
      )}
      <span>
        {failing.length > 0
          ? t("lastReadFailed", { when: at.toRelative() ?? at.toFormat("f") })
          : t("lastRead", { when: at.toRelative() ?? at.toFormat("f"), count: total })}
      </span>
    </div>
  );
}

function RefreshNowButton({
  lairId,
  onReport,
}: {
  lairId: string;
  onReport: (report: LairEventsRefreshReport) => void;
}) {
  const t = useTranslations("Lairs.manage.events.connected");
  const router = useRouter();
  const [refreshing, startRefreshing] = useTransition();

  return (
    <Button
      variant="outline"
      disabled={refreshing}
      onClick={() =>
        startRefreshing(async () => {
          const result = await refreshLairEventsNow(lairId);
          if (!result.success) {
            toast.error(result.message ? `${t("refreshFailed")} ${result.message}` : t("refreshFailed"));
            return;
          }
          onReport(result.report);
          toast.success(t("refreshed"));
          router.refresh();
        })
      }
    >
      <RefreshCw className={cn("mr-2 size-4", refreshing && "animate-spin")} aria-hidden />
      {refreshing ? t("refreshing") : t("refreshNow")}
    </Button>
  );
}

function ConnectedView({
  lairId,
  source,
  frequency,
  report,
  isPro,
  pendingRequest,
  onRequested,
  onReport,
  onEdit,
  onChangePage,
  onDisconnected,
}: {
  lairId: string;
  source: EventSource;
  frequency: RefreshFrequency;
  report: LairEventsRefreshReport | null;
  isPro: boolean;
  pendingRequest: PendingRequest | null;
  onRequested: (request: PendingRequest) => void;
  onReport: (report: LairEventsRefreshReport) => void;
  onEdit: () => void;
  onChangePage: () => void;
  onDisconnected: () => void;
}) {
  const t = useTranslations("Lairs.manage.events");
  const locale = useLocale();
  const router = useRouter();
  const [disconnecting, startDisconnecting] = useTransition();
  const [confirming, setConfirming] = useState(false);

  const mine = report?.sources.find((entry) => entry.url === source.url) ?? null;
  const unknownGames = mine ? unknownGamesFromWarnings(mine.warnings) : [];
  const venues = source.htmlConfig?.venues ?? [];
  const aliases = source.gameAliases ?? {};
  const next = nextRefreshAt({ frequency, pro: isPro, now: DateTime.now().setZone(PARIS) }).setLocale(locale);

  const disconnect = () => {
    startDisconnecting(async () => {
      const result = await disconnectEventPage(lairId);
      if (!result.success) {
        toast.error(t(`errors.${result.error}`));
        return;
      }
      toast.success(t("connected.disconnected"));
      onDisconnected();
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-5 pt-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  "inline-flex size-10 shrink-0 items-center justify-center rounded-full",
                  mine && !mine.ok ? "bg-destructive/10" : "bg-emerald-500/10",
                )}
              >
                {mine && !mine.ok ? (
                  <XCircle className="size-5 text-destructive" aria-hidden />
                ) : (
                  <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
                )}
              </span>
              <div className="space-y-1">
                <h2 className="text-xl font-semibold">
                  {mine && !mine.ok ? t("connected.titleFailed") : t("connected.title")}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {[hostOf(source.url), venues.length > 0 ? venues.join(", ") : null].filter(Boolean).join(" · ")}
                </p>
                <ReportSummary report={report} />
                {mine && !mine.ok && mine.error && (
                  <p className="text-sm text-destructive">{mine.error}</p>
                )}
                <p className="text-sm text-muted-foreground">
                  {t("connected.nextRead", { when: next.toFormat("cccc d LLLL, HH'h'") })}
                </p>
              </div>
            </div>
            <RefreshNowButton lairId={lairId} onReport={onReport} />
          </div>

          {unknownGames.length > 0 && (
            <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
              <div className="space-y-2 text-sm">
                <p>
                  <strong>{t("connected.unknownGamesTitle", { count: unknownGames.length })}</strong>{" "}
                  {t("connected.unknownGames", { names: unknownGames.map((name) => `« ${name} »`).join(", ") })}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={onEdit}>
                    {t("connected.chooseGame")}
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Facet
              title={t("connected.facets.venues")}
              value={venues.length > 0 ? venues.join(", ") : t("connected.facets.allVenues")}
              action={t("connected.edit")}
              onAction={onEdit}
            />
            <Facet
              title={t("connected.facets.games")}
              value={
                Object.keys(aliases).length > 0
                  ? Object.entries(aliases)
                      .map(([site, joutes]) => `${site} → ${joutes}`)
                      .join(", ")
                  : t("connected.facets.gamesAuto")
              }
              action={t("connected.edit")}
              onAction={onEdit}
            />
            <Facet
              title={t("connected.facets.page")}
              value={source.url.replace(/^https?:\/\/(www\.)?/, "")}
              action={t("connected.changePage")}
              onAction={onChangePage}
            />
            <Facet
              title={t("connected.facets.frequency")}
              value={frequency === "daily" && isPro ? t("frequency.daily.label") : t("frequency.weekly.label")}
              hint={frequency === "daily" && isPro ? t("frequency.daily.hintPro") : t("connected.facets.frequencyHint")}
              action={t("connected.edit")}
              onAction={onEdit}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="space-y-3 pt-6">
            <div className="space-y-1">
              <h3 className="font-semibold">{t("connected.wrong.title")}</h3>
              <p className="text-sm text-muted-foreground">{t("connected.wrong.description")}</p>
            </div>
            <Button variant="outline" asChild>
              <Link href={`/lairs/${lairId}/events/new`}>{t("manual.create")}</Link>
            </Button>
          </CardContent>
        </Card>
        <HelpCard
          lairId={lairId}
          title={t("help.title")}
          description={t("help.connectedDescription")}
          pendingRequest={pendingRequest}
          onRequested={onRequested}
          extraActions={
            confirming ? (
              <>
                <Button variant="destructive" onClick={disconnect} disabled={disconnecting}>
                  {disconnecting ? t("connected.disconnecting") : t("connected.disconnectConfirm")}
                </Button>
                <Button variant="ghost" onClick={() => setConfirming(false)} disabled={disconnecting}>
                  {t("wizard.cancel")}
                </Button>
              </>
            ) : (
              <Button variant="ghost" onClick={() => setConfirming(true)}>
                {t("connected.disconnect")}
              </Button>
            )
          }
        />
      </div>
    </div>
  );
}

function Facet({
  title,
  value,
  hint,
  action,
  onAction,
}: {
  title: string;
  value: string;
  hint?: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <div className="space-y-1.5 rounded-lg border p-4">
      <div className="text-sm font-semibold">{title}</div>
      <div className="break-words text-sm text-muted-foreground">{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      <button type="button" className="text-xs underline underline-offset-2" onClick={onAction}>
        {action}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Réglages : villes, jeux, rythme
// ---------------------------------------------------------------------------

function SettingsView({
  lairId,
  source,
  frequency: initialFrequency,
  isPro,
  games,
  onCancel,
  onSaved,
}: {
  lairId: string;
  source: EventSource;
  frequency: RefreshFrequency;
  isPro: boolean;
  games: { name: string }[];
  onCancel: () => void;
  onSaved: (state: { source: EventSource; frequency: RefreshFrequency; report: LairEventsRefreshReport | null }) => void;
}) {
  const t = useTranslations("Lairs.manage.events");
  const router = useRouter();
  const [venues, setVenues] = useState<string[]>(source.htmlConfig?.venues ?? []);
  const [aliases, setAliases] = useState<Record<string, string>>(source.gameAliases ?? {});
  const [frequency, setFrequency] = useState<RefreshFrequency>(isPro ? initialFrequency : "weekly");
  const [probe, setProbe] = useState<{ available: string[]; counts: Record<string, number> } | null>(null);
  const [summary, setSummary] = useState<GameSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();
  const [saving, startSaving] = useTransition();

  // Le préréglage se retrouve au domaine, comme côté serveur : la source ne
  // porte pas sa clé.
  const preset = findPresetForUrl(source.url);
  const presetKey = preset?.key ?? "";
  const asksVenues = preset ? presetAsksVenues(preset) : false;

  const describeError = (code: EventsConnectError, message?: string) =>
    code === "READ_FAILED" && message ? `${t(`errors.${code}`)} ${message}` : t(`errors.${code}`);

  // Une seule lecture à l'ouverture : les villes proposées et les jeux tels
  // que le site les nomme, pour les régler sur du vrai.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const initialVenues = source.htmlConfig?.venues ?? [];
    startLoading(async () => {
      if (asksVenues) {
        const probed = await previewEventPage(
          lairId,
          { url: source.url, presetKey, venues: [], gameAliases: {} },
          { probeVenues: true },
        );
        if (probed.success) {
          setProbe({ available: probed.preview.venues?.available ?? [], counts: probed.preview.venues?.counts ?? {} });
        } else {
          setError(describeError(probed.error, probed.message));
        }
      }
      const read = await previewEventPage(lairId, { url: source.url, presetKey, venues: initialVenues, gameAliases: {} });
      if (read.success) {
        setSummary(read.preview.games);
      } else {
        setError(describeError(read.error, read.message));
      }
    });
    // Lecture d'ouverture uniquement : ce qui suit se relit au bouton.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = () => {
    setError(null);
    if (asksVenues && venues.length === 0) {
      setError(t("errors.VENUES_REQUIRED"));
      return;
    }
    startSaving(async () => {
      const result = await updateEventPageSettings(lairId, { venues, gameAliases: aliases, frequency });
      if (!result.success) {
        setError(describeError(result.error, result.message));
        return;
      }
      toast.success(t("settings.saved"));
      onSaved(result.state);
      router.refresh();
    });
  };

  return (
    <Card>
      <CardContent className="space-y-6 pt-6">
        <StepTitle title={t("settings.title")} description={t("settings.description")} />

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}

        {asksVenues && (
          <section className="space-y-3">
            <h3 className="font-semibold">{t("venues.title")}</h3>
            {probe ? (
              <VenuesPicker available={probe.available} counts={probe.counts} selected={venues} onChange={setVenues} />
            ) : loading ? (
              <p className="text-sm text-muted-foreground">{t("wizard.reading")}</p>
            ) : (
              <VenuesPicker available={[]} counts={{}} selected={venues} onChange={setVenues} />
            )}
          </section>
        )}

        <section className="space-y-3">
          <h3 className="font-semibold">{t("games.title")}</h3>
          {summary ? (
            <GamesMapper summary={summary} aliases={aliases} games={games} onChange={setAliases} />
          ) : loading ? (
            <p className="text-sm text-muted-foreground">{t("wizard.reading")}</p>
          ) : (
            <p className="text-sm text-muted-foreground">{t("games.none")}</p>
          )}
        </section>

        <FrequencyChoice value={frequency} isPro={isPro} onChange={setFrequency} />

        <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
          <Button variant="outline" onClick={onCancel} disabled={saving}>
            {t("wizard.cancel")}
          </Button>
          <Button onClick={save} disabled={saving || loading}>
            {saving ? t("settings.saving") : t("settings.save")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
