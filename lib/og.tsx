import { ImageResponse } from "next/og";

export const ogImageSize = { width: 1200, height: 630 };
export const ogImageContentType = "image/png";

const ACCENTS = {
  home: ["#6366f1", "#9333ea"],
  games: ["#3b82f6", "#06b6d4"],
  cards: ["#8b5cf6", "#d946ef"],
  collection: ["#10b981", "#14b8a6"],
  decks: ["#6366f1", "#3b82f6"],
  wishlists: ["#f43f5e", "#ec4899"],
  lairs: ["#06b6d4", "#0ea5e9"],
  leagues: ["#f97316", "#ef4444"],
  playGroups: ["#f59e0b", "#f97316"],
  events: ["#6366f1", "#8b5cf6"],
  news: ["#0ea5e9", "#6366f1"],
  integrations: ["#64748b", "#334155"],
  users: ["#ec4899", "#8b5cf6"],
  gameMatches: ["#a855f7", "#6366f1"],
} as const;

export type OgVariant = keyof typeof ACCENTS;

function Swatch({ from, to, width }: { from: string; to: string; width: number }) {
  return (
    <div
      style={{
        display: "flex",
        width,
        height: (width * 4) / 3,
        borderRadius: 14,
        backgroundImage: `linear-gradient(135deg, ${from}, ${to})`,
      }}
    />
  );
}

function Bar({ color, widthPct }: { color: string; widthPct: number }) {
  return (
    <div
      style={{
        display: "flex",
        height: 16,
        width: `${widthPct}%`,
        borderRadius: 999,
        backgroundImage: `linear-gradient(90deg, ${color}, ${color}aa)`,
      }}
    />
  );
}

function Pill({ children, tone }: { children: string; tone: string }) {
  return (
    <div
      style={{
        display: "flex",
        padding: "8px 18px",
        borderRadius: 999,
        fontSize: 20,
        fontWeight: 600,
        color: tone,
        backgroundColor: `${tone}22`,
      }}
    >
      {children}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "14px 20px",
        borderRadius: 14,
        border: "2px solid rgba(255,255,255,0.08)",
        fontSize: 22,
        color: "#e2e8f0",
        width: "100%",
      }}
    >
      {children}
    </div>
  );
}

function MockupContent({ variant, from, to }: { variant: OgVariant; from: string; to: string }) {
  switch (variant) {
    case "games":
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, width: "100%" }}>
          <div style={{ display: "flex", gap: 12 }}>
            <Pill tone={from}>Riftbound</Pill>
            <Pill tone="#94a3b8">Lorcana</Pill>
            <Pill tone="#94a3b8">Altered</Pill>
          </div>
          <div style={{ display: "flex", gap: 14 }}>
            <Swatch from={from} to={to} width={92} />
            <Swatch from={to} to={from} width={92} />
            <Swatch from={from} to="#0ea5e9" width={92} />
            <Swatch from="#0ea5e9" to={to} width={92} />
          </div>
        </div>
      );
    case "cards":
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 18, width: "100%" }}>
          <div style={{ display: "flex", gap: 22 }}>
            <Swatch from={from} to={to} width={140} />
            <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: 1, justifyContent: "center" }}>
              <Bar color="#e2e8f0" widthPct={70} />
              <div style={{ display: "flex", gap: 10 }}>
                <Pill tone={from}>Domain</Pill>
                <Pill tone={to}>Cost 3</Pill>
              </div>
            </div>
          </div>
          <Row>
            <span>12 rulings à jour</span>
            <span style={{ color: "#34d399", fontWeight: 700 }}>OK</span>
          </Row>
        </div>
      );
    case "collection":
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 18, width: "100%" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Bar color={from} widthPct={92} />
            <Bar color={to} widthPct={68} />
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <Swatch from={from} to={to} width={80} />
            <Swatch from={to} to={from} width={80} />
            <Swatch from={from} to={to} width={80} />
            <div style={{ display: "flex", width: 80, height: (80 * 4) / 3, borderRadius: 14, backgroundColor: "#334155" }} />
          </div>
        </div>
      );
    case "decks":
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, width: "100%" }}>
          <Row>
            <span>Deck Ashe/Sett</span>
            <span style={{ color: "#34d399" }}>Légal</span>
          </Row>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 120 }}>
            {[30, 55, 90, 120, 80, 45, 20].map((h, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  width: 40,
                  height: h,
                  borderRadius: 8,
                  backgroundImage: `linear-gradient(180deg, ${from}, ${to})`,
                }}
              />
            ))}
          </div>
        </div>
      );
    case "wishlists":
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 14, width: "100%" }}>
          <Row>
            <span>Card Alpha</span>
            <span style={{ color: "#34d399" }}>Possédée</span>
          </Row>
          <Row>
            <span>Card Beta</span>
            <span style={{ color: "#94a3b8" }}>Recherchée x1</span>
          </Row>
        </div>
      );
    case "lairs":
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, width: "100%" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", width: 340 }}>
            {Array.from({ length: 21 }, (_, i) =>
              [4, 11, 16].includes(i) ? (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    width: 40,
                    height: 40,
                    borderRadius: 8,
                    backgroundImage: `linear-gradient(135deg, ${from}, ${to})`,
                  }}
                />
              ) : (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    width: 40,
                    height: 40,
                    borderRadius: 8,
                    backgroundColor: "#334155",
                  }}
                />
              )
            )}
          </div>
          <Row>
            <span>Prochain tournoi vendredi</span>
          </Row>
        </div>
      );
    case "leagues":
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
          {[
            { pos: 1, name: "Alex", pts: 42 },
            { pos: 2, name: "Sam", pts: 37 },
            { pos: 3, name: "Lou", pts: 33 },
          ].map((r) => (
            <Row key={r.pos}>
              <span style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <span
                  style={{
                    display: "flex",
                    width: 32,
                    height: 32,
                    borderRadius: 999,
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 16,
                    fontWeight: 700,
                    color: "#0f172a",
                    backgroundColor: r.pos === 1 ? "#f59e0b" : r.pos === 2 ? "#94a3b8" : "#c2410c",
                  }}
                >
                  {r.pos}
                </span>
                {r.name}
              </span>
              <span>{r.pts} pts</span>
            </Row>
          ))}
        </div>
      );
    case "playGroups":
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, width: "100%" }}>
          <div style={{ display: "flex" }}>
            {["A", "B", "C"].map((l) => (
              <div
                key={l}
                style={{
                  display: "flex",
                  width: 56,
                  height: 56,
                  marginLeft: -14,
                  borderRadius: 999,
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 22,
                  fontWeight: 700,
                  color: "white",
                  border: "3px solid #0f172a",
                  backgroundImage: `linear-gradient(135deg, ${from}, ${to})`,
                }}
              >
                {l}
              </div>
            ))}
          </div>
          <Row>
            <span>Collection partagée</span>
            <span style={{ color: "#94a3b8" }}>3 membres</span>
          </Row>
        </div>
      );
    case "events":
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 14, width: "100%" }}>
          <Row>
            <span>Tournoi Riftbound - Samedi 14h</span>
          </Row>
          <Row>
            <span>12 participants inscrits</span>
            <span style={{ color: from }}>Places dispo</span>
          </Row>
        </div>
      );
    case "news":
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 14, width: "100%" }}>
          <Bar color="#e2e8f0" widthPct={80} />
          <Bar color="#94a3b8" widthPct={60} />
          <Row>
            <span>Nouvelle extension annoncée</span>
          </Row>
        </div>
      );
    case "integrations":
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 14, width: "100%" }}>
          <Row>
            <span>API REST</span>
            <span style={{ color: "#34d399" }}>Connecté</span>
          </Row>
          <Row>
            <span>Bot Discord</span>
            <span style={{ color: "#34d399" }}>Connecté</span>
          </Row>
          <Row>
            <span>Serveur MCP</span>
            <span style={{ color: "#94a3b8" }}>Disponible</span>
          </Row>
        </div>
      );
    case "users":
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, width: "100%" }}>
          <div style={{ display: "flex", gap: 14 }}>
            {["A", "B", "C", "D"].map((l, i) => (
              <div
                key={l}
                style={{
                  display: "flex",
                  width: 70,
                  height: 70,
                  borderRadius: 999,
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 26,
                  fontWeight: 700,
                  color: "white",
                  backgroundImage: `linear-gradient(135deg, ${i % 2 === 0 ? from : to}, ${i % 2 === 0 ? to : from})`,
                }}
              >
                {l}
              </div>
            ))}
          </div>
          <Row>
            <span>Rejoignez la communauté</span>
          </Row>
        </div>
      );
    case "gameMatches":
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 14, width: "100%" }}>
          <Row>
            <span>Alex</span>
            <span style={{ color: from, fontWeight: 700 }}>2 - 1</span>
            <span>Sam</span>
          </Row>
          <Row>
            <span>Historique des matchs enregistré</span>
          </Row>
        </div>
      );
    case "home":
    default:
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, width: "100%" }}>
          <div style={{ display: "flex", gap: 12 }}>
            <Swatch from="#3b82f6" to="#06b6d4" width={100} />
            <Swatch from="#8b5cf6" to="#d946ef" width={100} />
            <Swatch from="#10b981" to="#14b8a6" width={100} />
          </div>
          <Bar color={from} widthPct={66} />
        </div>
      );
  }
}

/**
 * Stylized device-frame mockup used as the base for all OG/Twitter preview
 * images, matching the illustrative style already used on the /features
 * page (see app/features/Mockups.tsx) rather than real screenshots.
 */
function DeviceFrame({ variant, from, to }: { variant: OgVariant; from: string; to: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: 480,
        borderRadius: 24,
        overflow: "hidden",
        border: "2px solid rgba(255,255,255,0.1)",
        backgroundColor: "#111827",
        boxShadow: "0 30px 60px rgba(0,0,0,0.45)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "14px 18px",
          backgroundColor: "rgba(255,255,255,0.04)",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <div style={{ display: "flex", width: 12, height: 12, borderRadius: 999, backgroundColor: "#f87171" }} />
        <div style={{ display: "flex", width: 12, height: 12, borderRadius: 999, backgroundColor: "#fbbf24" }} />
        <div style={{ display: "flex", width: 12, height: 12, borderRadius: 999, backgroundColor: "#4ade80" }} />
      </div>
      <div style={{ display: "flex", padding: 28 }}>
        <MockupContent variant={variant} from={from} to={to} />
      </div>
    </div>
  );
}

export function buildOgImage({
  eyebrow = "Joutes",
  title,
  subtitle,
  variant,
}: {
  eyebrow?: string;
  title: string;
  subtitle: string;
  variant: OgVariant;
}) {
  const [from, to] = ACCENTS[variant];

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          backgroundColor: "#0b1120",
          backgroundImage: "linear-gradient(135deg, #0b1120 0%, #111827 60%, #0b1120 100%)",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: -160,
            right: -120,
            width: 560,
            height: 560,
            borderRadius: 999,
            backgroundImage: `linear-gradient(135deg, ${from}, ${to})`,
            opacity: 0.25,
            filter: "blur(40px)",
          }}
        />
        <div
          style={{
            display: "flex",
            flex: 1,
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 72px",
            gap: 48,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 22, maxWidth: 560 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                fontSize: 28,
                fontWeight: 700,
                color: "#f8fafc",
              }}
            >
              <div
                style={{
                  display: "flex",
                  width: 14,
                  height: 14,
                  borderRadius: 4,
                  backgroundImage: `linear-gradient(135deg, ${from}, ${to})`,
                }}
              />
              {eyebrow}
            </div>
            <div style={{ display: "flex", fontSize: 56, fontWeight: 800, color: "#f8fafc", lineHeight: 1.1 }}>
              {title}
            </div>
            <div style={{ display: "flex", fontSize: 26, color: "#94a3b8", lineHeight: 1.4 }}>{subtitle}</div>
          </div>
          <div style={{ display: "flex" }}>
            <DeviceFrame variant={variant} from={from} to={to} />
          </div>
        </div>
      </div>
    ),
    ogImageSize
  );
}
