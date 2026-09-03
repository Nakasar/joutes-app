import type { ReactNode } from "react";

import type { PosterVenue } from "@/lib/posters/selection";
import type { PosterStyleKey } from "@/lib/posters/styles";
import type {
  PosterDayView,
  PosterEvent,
  PosterGame,
  PosterLabels,
  PosterWeekView,
} from "@/lib/posters/format";

/**
 * Ce qu'un style reçoit : tout est déjà formaté (`lib/posters/format.ts`),
 * traduit (`strings`) et décidé (`options`). Un style ne fait que poser des
 * balises et des classes ; la feuille `poster.css` fait le reste.
 */
export type PosterStrings = {
  /** Les textes propres au style : `Lairs.poster.styles.<clé>.*`. */
  s: (key: string, values?: Record<string, string | number>) => string;
  /** Les textes communs : `Lairs.poster.*`. */
  t: (key: string, values?: Record<string, string | number>) => string;
};

export type PosterViewProps = {
  style: PosterStyleKey;
  period: "week" | "month";
  /**
   * Le bloc d'identité en tête : un lieu et son adresse, ou le nombre de lieux
   * réunis et leurs noms. Le style l'écrit sans savoir lequel des deux c'est.
   */
  venue: PosterVenue;
  labels: PosterLabels;
  /** « 8 événements » — le nombre, déjà en toutes lettres. */
  count: string;
  days: PosterDayView[];
  weeks: PosterWeekView[];
  /** Le QR code, en SVG, vers l'adresse que porte l'affiche. */
  qr: string;
  /**
   * La signature du pied de page — celle de Joutes, ou celle qu'un lieu Pro a
   * mise à sa place. Elle est déjà résolue : le style l'écrit telle quelle.
   */
  brand: { logo: string; name: string; line: string };
  /** L'appel à l'action, résolu de la même façon. */
  cta: { title: string; text: string };
  strings: PosterStrings;
  /** Le mois de la période en toutes lettres, pour les styles qui l'écrivent. */
  monthName: string;
};

/* ------------------------------------------------------------ briques communes */

const PIN_ICON = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

/**
 * Le jeu, dans ses deux formes : la tuile-logo (l'image du jeu, ou son
 * initiale sur sa couleur) et le nom complet. Les deux sont rendus ; la classe
 * du lieu — `jeux-logos` ou `jeux-noms` — décide de celle qui se voit.
 */
function GameMark({ game }: { game: PosterGame }) {
  return (
    <span className="game">
      <span className="glogo" style={{ color: game.color }}>
        {game.icon ? (
          // eslint-disable-next-line @next/next/no-img-element -- une image externe, dans une page faite pour l'impression.
          <img src={game.icon} alt="" />
        ) : (
          <i style={{ background: game.color }}>{game.name.charAt(0)}</i>
        )}
        <b>{game.short}</b>
      </span>
      <span className="gname">{game.name}</span>
    </span>
  );
}

/**
 * Le lieu d'un événement, quand l'affiche en réunit plusieurs.
 *
 * Rien du tout sur l'affiche d'un lieu : `venue` n'y est pas rempli, et la
 * ligne garde exactement la forme qu'elle avait.
 */
function VenueTag({ venue }: { venue?: string }) {
  return venue ? <span className="evenue">{venue}</span> : null;
}

/** « 8 € », puis les places ou la mention « complet » — chacune dans sa classe. */
function Attendance({ event, full, separator = " · " }: { event: PosterEvent; full: string; separator?: string }) {
  return (
    <>
      {event.price && <span>{event.price}</span>}
      {event.full ? (
        <span className="full">{full}</span>
      ) : event.seats ? (
        <span className="seats">
          {event.price ? separator : ""}
          {event.seats}
        </span>
      ) : null}
    </>
  );
}

function QR({ svg }: { svg: string }) {
  // Le SVG vient de `qrcode`, généré côté serveur à partir de l'adresse de
  // l'affiche : rien d'étranger n'y entre.
  return <div className="qr" dangerouslySetInnerHTML={{ __html: svg }} />;
}

function Empty({ text }: { text: string }) {
  return <p className="empty">{text}</p>;
}

/* ------------------------------------------------------------------ 1. Joutes */

function JoutesPoster(p: PosterViewProps) {
  const { s, t } = p.strings;
  const isWeek = p.period === "week";

  return (
    <div className="poster joutes">
      <header className="hd">
        {/* eslint-disable-next-line @next/next/no-img-element -- filigrane décoratif */}
        <img className="wm" src={p.brand.logo} alt="" />
        <span className="kicker">{s(isWeek ? "kickerWeek" : "kickerMonth")}</span>
        <h1 className="period">
          {p.labels.big}
          <small>
            {p.labels.year} · {p.count}
          </small>
        </h1>
        <div className="venue">
          <span className="venue-name">{p.venue.name}</span>
          {p.venue.address && (
            <span className="venue-addr">
              {PIN_ICON}
              {p.venue.address}
            </span>
          )}
        </div>
      </header>
      {isWeek ? (
        <main className="body">
          {p.days.filter((d) => d.events.length > 0).map((d) => (
            <section className="day" key={d.number}>
              <div className="dhead">
                <span className="dnum">{d.number}</span>
                <span className="dname">{d.name}</span>
              </div>
              {d.events.map((e) => (
                <div className="ev" key={e.id}>
                  <p className="name">{e.name}</p>
                  <div className="meta">
                    <span className="time">{e.time}</span>
                    <GameMark game={e.game} />
                    <VenueTag venue={e.venue} />
                    <Attendance event={e} full={s("full")} separator="" />
                  </div>
                </div>
              ))}
            </section>
          ))}
          {p.days.every((d) => d.events.length === 0) && <Empty text={t("empty")} />}
        </main>
      ) : (
        <main className="body month">
          {p.weeks.map((w) => (
            <section className="day" key={w.isoWeek}>
              <div className="dhead">
                <span className="dname">{t("weekOf", { range: w.label })}</span>
              </div>
              {w.events.map((e) => (
                <div className="mrow" key={e.id}>
                  <span className="mdate">{e.dateShort}</span>
                  <span className="mtime">{e.time.split(" – ")[0]}</span>
                  <span className="mname">{e.name}</span>
                  <GameMark game={e.game} />
                  <VenueTag venue={e.venue} />
                  <span className="mmeta">
                    <Attendance event={e} full={s("full")} />
                  </span>
                </div>
              ))}
            </section>
          ))}
          {p.weeks.length === 0 && <Empty text={t("empty")} />}
        </main>
      )}
      <footer className="ft">
        <div className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element -- l'emblème de la signature, celui du lieu s'il en a posé un */}
          <img src={p.brand.logo} alt="" />
          <div>
            <div className="brand-name">{p.brand.name}</div>
            <div className="brand-line">{p.brand.line}</div>
          </div>
        </div>
        <div className="cta">
          <div>
            <span className="cta-btn">{p.cta.title}</span>
            <p className="cta-sub">{p.cta.text}</p>
          </div>
          <QR svg={p.qr} />
        </div>
      </footer>
    </div>
  );
}

/* ------------------------------------------------------ 2. Tableau d'affichage */

const BOARD_COLORS = ["#fff59a", "#ffc9de", "#c6e6ff", "#d1f5c6", "#ffd9a6", "#e6d4ff", "#c9f2ea"];
const BOARD_PINS = ["#d92b52", "#2f9e44", "#e8b917", "#2b7bd9", "#d92b52", "#7c3aed", "#2f9e44"];
const BOARD_ROTATIONS = [-1.6, 1.2, 1.5, -1.1, -1.8, 0.9, 1.4];

function BoardFixing({ index }: { index: number }) {
  if (index % 3 === 1) {
    return (
      <span
        className="tape"
        style={{ top: -12, left: "50%", marginLeft: -45, transform: `rotate(${-BOARD_ROTATIONS[index % 7] * 2}deg)` }}
      />
    );
  }

  return (
    <span
      className="pin"
      style={{ ["--c" as string]: BOARD_PINS[index % 7], top: -8, ...(index % 2 ? { right: 18 } : { left: 18 }) }}
    />
  );
}

function BoardPoster(p: PosterViewProps) {
  const { s, t } = p.strings;
  const isWeek = p.period === "week";
  const days = p.days.filter((d) => d.events.length > 0);

  return (
    <div className="poster cork">
      <header className="card">
        <span className="pin" style={{ ["--c" as string]: "#d92b52", top: -8, left: 24 }} />
        <span className="pin" style={{ ["--c" as string]: "#2b7bd9", top: -8, right: 24 }} />
        <div>
          <h1 className="title hand">{s(isWeek ? "titleWeek" : "titleMonth")}</h1>
          <p className="sub hand">
            {isWeek ? s("subWeek", { range: p.labels.long }) : s("subMonth", { month: p.labels.long, count: p.count })}
          </p>
        </div>
        <div className="venue">
          <p className="venue-name hand">{p.venue.name}</p>
          {p.venue.address && (
            <span className="venue-addr">
              {PIN_ICON}
              {p.venue.address}
            </span>
          )}
        </div>
      </header>
      {isWeek ? (
        <main className="body">
          {days.map((d, i) => (
            <section
              className="note"
              key={d.number}
              style={{ background: BOARD_COLORS[i % 7], transform: `rotate(${BOARD_ROTATIONS[i % 7]}deg)` }}
            >
              <BoardFixing index={i} />
              <h2 className="dname hand">
                {d.name}
                <small>{d.number}</small>
              </h2>
              {d.events.map((e) => (
                <div className="ev" key={e.id}>
                  <p className="name">{e.name}</p>
                  <p className="meta">
                    <span>{e.time}</span>
                    <span>·</span>
                    <GameMark game={e.game} />
                    <VenueTag venue={e.venue} />
                    {e.price && <span>· {e.price}</span>}
                    {e.full ? <span className="full">{s("full")}</span> : e.seats ? <span className="seats">· {e.seats}</span> : null}
                  </p>
                </div>
              ))}
            </section>
          ))}
          {days.length === 0 && <Empty text={t("empty")} />}
        </main>
      ) : (
        <main className="body month">
          {p.weeks.map((w, i) => (
            <section
              className="note"
              key={w.isoWeek}
              style={{ background: BOARD_COLORS[i % 7], transform: `rotate(${[-0.8, 0.6, -0.5, 0.9, -0.7, 0.5][i % 6]}deg)`, minHeight: 0 }}
            >
              <BoardFixing index={i} />
              <h2 className="dname hand" style={{ fontSize: 24 }}>
                {t("weekOf", { range: w.label })}
              </h2>
              {w.events.map((e) => (
                <div className="mrow" key={e.id}>
                  <span className="mdate">{e.dateShort}</span>
                  <span className="mtime">{e.time.split(" – ")[0]}</span>
                  <span className="mname">{e.name}</span>
                  <GameMark game={e.game} />
                  <VenueTag venue={e.venue} />
                  <span className="mmeta">
                    <Attendance event={e} full={s("full")} />
                  </span>
                </div>
              ))}
            </section>
          ))}
          {p.weeks.length === 0 && <Empty text={t("empty")} />}
        </main>
      )}
      <footer className="ft">
        <div className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element -- l'emblème de la signature, celui du lieu s'il en a posé un */}
          <img src={p.brand.logo} alt="" />
          <div>
            <div className="brand-name">{p.brand.name}</div>
            <div className="brand-line">{p.brand.line}</div>
          </div>
        </div>
        <div className="cta">
          <div className="cta-text">
            <div className="cta-title">{p.cta.title}</div>
            <div className="cta-sub">{p.cta.text}</div>
          </div>
          <QR svg={p.qr} />
        </div>
      </footer>
    </div>
  );
}

/* ----------------------------------------------- 3. Tableau de joutes médiévales */

const TINCTURES = ["#8b1e2d", "#1f3a6b", "#2e6b3a", "#b8891c", "#5b2a6b", "#1f2a2a", "#8b1e2d"];

const LANCES = (
  <svg className="lances" width="120" height="44" viewBox="0 0 120 44" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
    <path d="M10 40 110 6M110 40 10 6" />
    <path d="M104 3l10 3-4 9" fill="currentColor" />
    <path d="M16 3 6 6l4 9" fill="currentColor" />
    <circle cx="60" cy="23" r="7" fill="#eadfc0" />
    <circle cx="60" cy="23" r="3" fill="currentColor" />
  </svg>
);

function TournamentPoster(p: PosterViewProps) {
  const { s, t } = p.strings;
  const isWeek = p.period === "week";
  const days = p.days.filter((d) => d.events.length > 0);

  return (
    <div className="poster tournoi">
      <header className="hd">
        {LANCES}
        <h1 className="title cinzel">{isWeek ? s("titleWeek") : s("titleMonth", { month: p.monthName })}</h1>
        <p className="period">
          {isWeek ? s("subWeek", { range: p.labels.long }) : s("subMonth", { year: p.labels.year, count: p.count })}
        </p>
        <p className="venue cinzel">
          {p.venue.name}
          {p.venue.address ? ` · ${p.venue.address}` : ""}
        </p>
        <div className="rule" />
      </header>
      <div className="pole" />
      {isWeek ? (
        <main className="body">
          {days.map((d, i) => (
            <section className="day" key={d.number}>
              <h2 className="pennant cinzel" style={{ background: TINCTURES[i % 7] }}>
                {d.name}
                <small>{s("dayOf", { number: d.number })}</small>
              </h2>
              {d.events.map((e) => (
                <div className="ev" key={e.id}>
                  <div className="line">
                    <span className="time">{e.timeFr}</span>
                    <span className="name">{e.name}</span>
                  </div>
                  <p className="meta">
                    <GameMark game={e.game} />
                    <VenueTag venue={e.venue} />
                    {e.price && <span>· {e.price}</span>}
                    {e.full ? <span className="full">· {s("full")}</span> : e.seats ? <span className="seats">· {e.seats}</span> : null}
                  </p>
                </div>
              ))}
            </section>
          ))}
          {days.length === 0 && <Empty text={t("empty")} />}
        </main>
      ) : (
        <main className="body month">
          {p.weeks.map((w, i) => (
            <section className="day" key={w.isoWeek}>
              <h2 className="pennant cinzel" style={{ background: TINCTURES[i % 7] }}>
                {t("weekOf", { range: w.short })}
              </h2>
              {w.events.map((e) => (
                <div className="mrow" key={e.id}>
                  <span className="mdate">{e.dateShort}</span>
                  <span className="mtime">{e.timeFr.split(" – ")[0]}</span>
                  <span className="mname">{e.name}</span>
                  <GameMark game={e.game} />
                  <VenueTag venue={e.venue} />
                  <span className="mmeta">
                    <Attendance event={e} full={`· ${s("full")}`} />
                  </span>
                </div>
              ))}
            </section>
          ))}
          {p.weeks.length === 0 && <Empty text={t("empty")} />}
        </main>
      )}
      <footer className="ft">
        <div className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element -- l'emblème de la signature, celui du lieu s'il en a posé un */}
          <img src={p.brand.logo} alt="" />
          <div>
            <div className="brand-name">{p.brand.name}</div>
            <div className="brand-line">{p.brand.line}</div>
          </div>
        </div>
        <div className="cta">
          <div className="cta-text">
            <div className="cta-title">{p.cta.title}</div>
            <div className="cta-sub">{p.cta.text}</div>
          </div>
          <div className="shield">
            <QR svg={p.qr} />
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ---------------------------------------------------------------- 4. Cyberpunk */

function CyberpunkPoster(p: PosterViewProps) {
  const { s, t } = p.strings;
  const isWeek = p.period === "week";
  const title = s(isWeek ? "titleWeek" : "titleMonth");
  const days = p.days.filter((d) => d.events.length > 0);

  return (
    <div className="poster cyber">
      <div className="grid" />
      <header className="hd">
        <span className="sys mono">
          {s("node", { name: p.venue.name.toUpperCase(), address: (p.venue.address ?? "").toUpperCase() })}
        </span>
        <h1 className="title orb glow-c" data-echo={title}>
          {title}
        </h1>
        <p className="period mono glow-m">
          {isWeek ? `${p.labels.startNumeric} >> ${p.labels.endNumeric}` : s("subMonth", { start: p.labels.startNumeric.slice(3), count: p.count.toUpperCase() })}
        </p>
        {p.venue.address && <p className="venue">{p.venue.address}</p>}
      </header>
      {isWeek ? (
        <main className="body">
          {days.map((d) => (
            <section className="day" key={d.number}>
              <div className="dname">
                <span>{d.short}</span>
                <b>{d.padded}</b>
                <i />
              </div>
              <div className="evs">
                {d.events.map((e) => (
                  <div className="ev" key={e.id}>
                    <span className="time">{e.time}</span>
                    <p className="name">
                      {e.name}
                      <small>
                        {e.price}
                        {e.seats && <span className="seats"> · {e.seats}</span>}
                      </small>
                    </p>
                    {e.full && <span className="full">{s("full")}</span>}
                    <GameMark game={e.game} />
                    <VenueTag venue={e.venue} />
                  </div>
                ))}
              </div>
            </section>
          ))}
          {days.length === 0 && <Empty text={t("empty")} />}
        </main>
      ) : (
        <main className="body month">
          {p.weeks.map((w) => (
            <section className="day" key={w.isoWeek}>
              <div className="dname">
                <span>{s("week")}</span>
                <b>{w.isoWeek}</b>
                <i />
              </div>
              <div className="evs">
                {w.events.map((e) => (
                  <div className="mrow" key={e.id}>
                    <span className="mdate">{e.dateShort}</span>
                    <span className="mtime">{e.time.split(" – ")[0]}</span>
                    <span className="mname">{e.name}</span>
                    <span className="mmeta">
                      {e.price}
                      {e.seats && <span className="seats"> · {e.seats}</span>}
                      {e.full && <span className="full">{s("full")}</span>}
                    </span>
                    <GameMark game={e.game} />
                    <VenueTag venue={e.venue} />
                  </div>
                ))}
              </div>
            </section>
          ))}
          {p.weeks.length === 0 && <Empty text={t("empty")} />}
        </main>
      )}
      <footer className="ft">
        <div className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element -- l'emblème de la signature, celui du lieu s'il en a posé un */}
          <img src={p.brand.logo} alt="" />
          <div>
            <div className="brand-name glow-c">{p.brand.name}</div>
            <div className="brand-line">{p.brand.line}</div>
          </div>
        </div>
        <div className="cta">
          <div className="cta-text">
            <div className="cta-title glow-m">{p.cta.title}</div>
            <div className="cta-sub">{p.cta.text}</div>
          </div>
          <QR svg={p.qr} />
        </div>
      </footer>
      <div className="scan" />
    </div>
  );
}

/* ----------------------------------------------------------------- 5. Taverne */

const CHAINS = (
  <svg className="chains" width="360" height="26" viewBox="0 0 360 26" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
    <path d="M60 0v26M300 0v26" strokeDasharray="6 4" />
  </svg>
);

function TavernPoster(p: PosterViewProps) {
  const { s, t } = p.strings;
  const isWeek = p.period === "week";
  const days = p.days.filter((d) => d.events.length > 0);

  return (
    <div className="poster tav">
      <header className="sign-wrap">
        {CHAINS}
        <div className="sign">
          <h1 className="sign-name med">{p.venue.name}</h1>
          {p.venue.address && <p className="sign-sub">{p.venue.address}</p>}
        </div>
      </header>
      <div className={`banner${isWeek ? "" : " month-banner"}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- illustration de la taverne */}
        <img src="/joutes.png" alt="" />
        <p className="period med">
          {isWeek ? s("titleWeek", { range: p.labels.big }) : s("titleMonth", { month: p.monthName, year: p.labels.year })}
          <small>{isWeek ? s("subWeek", { year: p.labels.year }) : s("subMonth", { count: p.count })}</small>
        </p>
      </div>
      <div className="scroll">
        {isWeek ? (
          <main className="body">
            {days.map((d) => (
              <section className="day" key={d.number}>
                <h2 className="dname med">
                  {d.name}
                  <small>{s("dayOf", { number: d.number, month: p.monthName.toLocaleLowerCase() })}</small>
                </h2>
                <div className="evs">
                  {d.events.map((e) => (
                    <div className="ev" key={e.id}>
                      <span className="time">{e.timeFr}</span>
                      <span className="name">{e.name}</span>
                      <span className="meta">
                        <GameMark game={e.game} />
                        <VenueTag venue={e.venue} />
                        {e.price && <span>— {e.price}</span>}
                        {e.full ? <span className="full">· {s("full")}</span> : e.seats ? <span className="seats">· {e.seats}</span> : null}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            ))}
            {days.length === 0 && <Empty text={t("empty")} />}
          </main>
        ) : (
          <main className="body month">
            {p.weeks.map((w) => (
              <section className="day" key={w.isoWeek}>
                <h2 className="dname med" style={{ fontSize: 22 }}>
                  {s("week")}
                  <small>{s("weekOf", { range: w.label })}</small>
                </h2>
                <div className="evs">
                  {w.events.map((e) => (
                    <div className="mrow" key={e.id}>
                      <span className="mdate">{e.dateShort}</span>
                      <span className="mtime">{e.timeFr.split(" – ")[0]}</span>
                      <span className="mname">{e.name}</span>
                      <GameMark game={e.game} />
                      <VenueTag venue={e.venue} />
                      <span className="mmeta">
                        <Attendance event={e} full={`· ${s("full")}`} />
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            ))}
            {p.weeks.length === 0 && <Empty text={t("empty")} />}
          </main>
        )}
      </div>
      <footer className="ft">
        <div className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element -- l'emblème de la signature, celui du lieu s'il en a posé un */}
          <img src={p.brand.logo} alt="" />
          <div>
            <div className="brand-name med">{p.brand.name}</div>
            <div className="brand-line">{p.brand.line}</div>
          </div>
        </div>
        <div className="cta">
          <div className="cta-text">
            <div className="cta-title med">{p.cta.title}</div>
            <div className="cta-sub">{p.cta.text}</div>
          </div>
          <QR svg={p.qr} />
        </div>
      </footer>
    </div>
  );
}

/* ---------------------------------------------------------- 6. Science-fiction */

const ORBIT = (
  <svg className="orbit" viewBox="0 0 520 520" fill="none" stroke="currentColor" aria-hidden="true">
    <circle cx="260" cy="260" r="240" strokeWidth="1.5" />
    <circle cx="260" cy="260" r="180" strokeWidth="1" strokeDasharray="4 8" />
    <ellipse cx="260" cy="260" rx="250" ry="90" strokeWidth="1" transform="rotate(-28 260 260)" />
    <circle cx="50" cy="160" r="6" fill="currentColor" />
  </svg>
);

function SciFiPoster(p: PosterViewProps) {
  const { s, t } = p.strings;
  const isWeek = p.period === "week";
  const days = p.days.filter((d) => d.events.length > 0);

  return (
    <div className="poster sf">
      {ORBIT}
      <header className="hd">
        <span className="log">{s("log", { name: p.venue.name })}</span>
        <h1 className="title">
          {isWeek ? (
            <>
              {s("titleWeek", { week: "" })}
              <span>{p.labels.isoWeek}</span>
              <br />
              {p.labels.startNumeric.slice(0, 2)} → {p.labels.endNumeric}
            </>
          ) : (
            <>
              {p.monthName} <span>{p.labels.year}</span>
              <br />
              {s("subMonth", { start: p.labels.startNumeric.slice(0, 2), end: p.labels.endNumeric.slice(0, 2) })}
            </>
          )}
        </h1>
        <div className="status">
          <span className="chip on">
            <i />
            {p.count}
          </span>
          {p.venue.address && <span className="chip">{p.venue.address}</span>}
        </div>
      </header>
      {isWeek ? (
        <main className="body">
          {days.map((d) => (
            <section className="mod" key={d.number}>
              <div className="mhead">
                <span className="dname">{d.name}</span>
                <span className="sol">{s("sol", { number: d.padded })}</span>
              </div>
              {d.events.map((e) => (
                <div className="ev" key={e.id}>
                  <p className="name">{e.name}</p>
                  <div className="meta">
                    <span className="time">{e.time}</span>
                    <GameMark game={e.game} />
                    <VenueTag venue={e.venue} />
                    <Attendance event={e} full={s("full")} separator="" />
                  </div>
                </div>
              ))}
            </section>
          ))}
          {days.length === 0 && <Empty text={t("empty")} />}
        </main>
      ) : (
        <main className="body month">
          {p.weeks.map((w) => (
            <section className="mod" key={w.isoWeek}>
              <div className="mhead">
                <span className="dname">{w.label}</span>
                <span className="sol">{s("weekNumber", { number: w.isoWeek })}</span>
              </div>
              {w.events.map((e) => (
                <div className="mrow" key={e.id}>
                  <span className="mdate">{e.dateShort}</span>
                  <span className="mtime">{e.time.split(" – ")[0]}</span>
                  <span className="mname">{e.name}</span>
                  <GameMark game={e.game} />
                  <VenueTag venue={e.venue} />
                  <span className="mmeta">
                    <Attendance event={e} full={`· ${s("full")}`} />
                  </span>
                </div>
              ))}
            </section>
          ))}
          {p.weeks.length === 0 && <Empty text={t("empty")} />}
        </main>
      )}
      <footer className="ft">
        <div className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element -- l'emblème de la signature, celui du lieu s'il en a posé un */}
          <img src={p.brand.logo} alt="" />
          <div>
            <div className="brand-name">{p.brand.name}</div>
            <div className="brand-line">{p.brand.line}</div>
          </div>
        </div>
        <div className="cta">
          <div className="cta-text">
            <div className="cta-title">{p.cta.title}</div>
            <div className="cta-sub">{p.cta.text}</div>
          </div>
          <QR svg={p.qr} />
        </div>
      </footer>
    </div>
  );
}

/* ----------------------------------------------------------------- 7. Grimoire */

const FLOURISH = (
  <svg className="flourish" width="220" height="22" viewBox="0 0 220 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
    <path d="M4 11h72c8 0 12-8 20-8s12 8 20 8-12 8-20 8-12-8-20-8M216 11h-72c-8 0-12-8-20-8s-12 8-20 8" />
    <circle cx="110" cy="11" r="3" fill="currentColor" />
  </svg>
);

function GrimoirePoster(p: PosterViewProps) {
  const { s, t } = p.strings;
  const isWeek = p.period === "week";
  const days = p.days.filter((d) => d.events.length > 0);

  return (
    <div className="poster grim">
      <div className="page">
        <span className="stain" style={{ width: 260, height: 260, right: -60, top: 120 }} />
        <span className="stain" style={{ width: 180, height: 180, left: 40, bottom: 140 }} />
        <header className="hd">
          {FLOURISH}
          <h1 className="title pirata">{isWeek ? s("titleWeek") : s("titleMonth", { month: p.monthName.toLocaleLowerCase() })}</h1>
          <p className="period">
            {isWeek ? s("subWeek", { range: p.labels.big, year: p.labels.year }) : s("subMonth", { year: p.labels.year, count: p.count })}
          </p>
          <p className="venue">
            {p.venue.name}
            {p.venue.address ? ` · ${p.venue.address}` : ""}
          </p>
          {FLOURISH}
        </header>
        {isWeek ? (
          <main className="body">
            {days.map((d) => (
              <section className="day" key={d.number}>
                <h2 className="dname pirata">
                  {d.name}
                  <small>{s("daySub", { month: p.monthName.toLocaleLowerCase(), number: d.number })}</small>
                </h2>
                <div className="evs">
                  {d.events.map((e) => (
                    <div className="ev" key={e.id}>
                      <span className="name">
                        <span className="init">{e.name.charAt(0)}</span>
                        {e.name.slice(1)}
                      </span>
                      <span className="time">{e.timeFr}</span>
                      <span className="meta">
                        <GameMark game={e.game} />
                        <VenueTag venue={e.venue} />
                        {e.price && <span>— {e.price}</span>}
                        {e.full ? <span className="full">· {s("full")}</span> : e.seats ? <span className="seats">· {e.seats}</span> : null}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            ))}
            {days.length === 0 && <Empty text={t("empty")} />}
          </main>
        ) : (
          <main className="body month">
            {p.weeks.map((w) => (
              <section className="day" key={w.isoWeek}>
                <h2 className="dname pirata" style={{ fontSize: 24 }}>
                  {s("week")}
                  <small>{s("weekOf", { range: w.label })}</small>
                </h2>
                <div className="evs">
                  {w.events.map((e) => (
                    <div className="mrow" key={e.id}>
                      <span className="mdate">{e.dateShort}</span>
                      <span className="mtime">{e.timeFr.split(" – ")[0]}</span>
                      <span className="mname">{e.name}</span>
                      <GameMark game={e.game} />
                      <VenueTag venue={e.venue} />
                      <span className="mmeta">
                        <Attendance event={e} full={`· ${s("full")}`} />
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            ))}
            {p.weeks.length === 0 && <Empty text={t("empty")} />}
          </main>
        )}
        <footer className="ft">
          <div className="brand">
            {/* eslint-disable-next-line @next/next/no-img-element -- l'emblème de la signature, celui du lieu s'il en a posé un */}
            <img src={p.brand.logo} alt="" />
            <div>
              <div className="brand-name">{p.brand.name}</div>
              <div className="brand-line">{p.brand.line}</div>
            </div>
          </div>
          <div className="cta">
            <div className="cta-text">
              <div className="cta-title">{p.cta.title}</div>
              <div className="cta-sub">{p.cta.text}</div>
            </div>
            <div className="seal">J</div>
            <QR svg={p.qr} />
          </div>
        </footer>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------- registre */

export const POSTER_VIEWS: Record<PosterStyleKey, (props: PosterViewProps) => ReactNode> = {
  joutes: JoutesPoster,
  board: BoardPoster,
  tournament: TournamentPoster,
  cyberpunk: CyberpunkPoster,
  tavern: TavernPoster,
  scifi: SciFiPoster,
  grimoire: GrimoirePoster,
};
