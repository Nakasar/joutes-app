import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";
import QRCode from "qrcode";

import {
  BUSINESS_CARD_SCALE,
  BUSINESS_CARD_SIZE,
  type BusinessCardLayout,
  type BusinessCardLine,
  type BusinessCardSection,
} from "@/lib/decks/business-card";
import { COLORLESS_COLOR, domainColor } from "@/lib/meta/domains";

/**
 * Le dessin de la carte de visite d'un deck, avec ce que `next/og` (satori)
 * sait poser : des boîtes flex, des couleurs, une police.
 *
 * La mise en page vient de `business-card.ts` ; ici, on ne fait que la
 * peindre, au double de sa taille (1 500 × 2 096 px). Deux habillages : le
 * thème sombre du site, avec l'illustration de la légende en bandeau, et un
 * fond blanc sans illustration pour l'impression.
 */

type Theme = {
  page: string;
  frame: string;
  frameBorder: string;
  ink: string;
  muted: string;
  faint: string;
  accent: string;
  rule: string;
  panel: string;
  panelBorder: string;
  costBorder: string;
  costInk: string;
  chipBackground: string;
};

const THEMES: Record<BusinessCardLayout["style"], Theme> = {
  // Les jetons sombres servis par le site.
  illustrated: {
    page: "#050a0f",
    frame: "#070d13",
    frameBorder: "#1f6f86",
    ink: "#e6edf3",
    muted: "#a9b7c2",
    faint: "#7f8e9a",
    accent: "#27b3d8",
    rule: "#1f2c37",
    panel: "#0d161e",
    panelBorder: "#1c2934",
    costBorder: "#2c3b48",
    costInk: "#c8d3dc",
    chipBackground: "rgba(5,10,15,0.78)",
  },
  sober: {
    page: "#ffffff",
    frame: "#ffffff",
    frameBorder: "#c9d4dc",
    ink: "#0b1218",
    muted: "#4b5b68",
    faint: "#5b6b77",
    accent: "#0b7593",
    rule: "#d5dee5",
    panel: "#f3f6f8",
    panelBorder: "#dde5eb",
    costBorder: "#b7c4ce",
    costInk: "#2b3a46",
    chipBackground: "#ffffff",
  },
};

/** Un pixel de mise en page, au facteur de rendu. */
const px = (value: number) => value * BUSINESS_CARD_SCALE;

/** Largeur intérieure du cadre, en pixels de mise en page. */
const FRAME_INNER_WIDTH = BUSINESS_CARD_SIZE.width - 2 * 18 - 3;
const HEADER_HEIGHT = 282;

/**
 * Le recadrage d'une carte de Riftbound pour n'en garder que l'illustration :
 * on part du point (140, 110) d'une carte de 744 px de large, à droite des
 * icônes de domaine imprimées, et on montre 580 px de large.
 */
const ART_CROP = { cardWidth: 744, cardHeight: 1039, left: 140, top: 110, width: 580 };

/** Une carte recadrée sur son illustration, pour une boîte de `width` pixels de mise en page. */
function CroppedArt({ src, width }: { src: string; width: number }) {
  const scale = width / ART_CROP.width;
  return (
    <img
      src={src}
      alt=""
      width={px(ART_CROP.cardWidth * scale)}
      height={px(ART_CROP.cardHeight * scale)}
      style={{ position: "absolute", left: px(-ART_CROP.left * scale), top: px(-ART_CROP.top * scale) }}
    />
  );
}

let fonts: Promise<{ name: string; data: Buffer; weight: 400 | 700; style: "normal" }[]> | undefined;

/**
 * Geist, en romain et en gras : la police par défaut de `next/og` n'a pas de
 * gras, et une carte de visite sans titre appuyé se lit mal.
 */
function loadFonts() {
  fonts ??= Promise.all(
    ([
      ["Regular", 400],
      ["Bold", 700],
    ] as const).map(async ([file, weight]) => ({
      name: "Geist",
      data: await readFile(join(process.cwd(), "assets/fonts", `Geist-${file}.ttf`)),
      weight,
      style: "normal" as const,
    }))
  );
  return fonts;
}

export type BusinessCardAssets = {
  /** Les images déjà lues, en `data:` : une image distante qui ne répond pas ne doit pas faire échouer la carte. */
  art?: string;
  champion?: string;
  logo?: string;
};

/**
 * Lit une image et la rend en `data:`, ou rien si elle ne répond pas à temps.
 *
 * Satori irait la chercher seul, mais une illustration injoignable ferait
 * échouer toute la carte : mieux vaut une carte sans bandeau que pas de carte.
 */
export async function loadImage(url: string | undefined, timeoutMs = 4000): Promise<string | undefined> {
  if (!url) return undefined;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return undefined;
    const type = response.headers.get("content-type") ?? "image/png";
    if (!type.startsWith("image/")) return undefined;
    const buffer = Buffer.from(await response.arrayBuffer());
    return `data:${type};base64,${buffer.toString("base64")}`;
  } catch {
    return undefined;
  }
}

function Label({ children, theme, size = 12 }: { children: string; theme: Theme; size?: number }) {
  return (
    <div
      style={{
        display: "flex",
        fontSize: px(size),
        fontWeight: 700,
        letterSpacing: px(size * 0.14),
        color: theme.accent,
        textTransform: "uppercase",
      }}
    >
      {children}
    </div>
  );
}

function DomainChip({ domain, theme, overArt }: { domain: string; theme: Theme; overArt: boolean }) {
  const color = domainColor(domain);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: px(7),
        padding: `${px(5)}px ${px(12)}px ${px(5)}px ${px(6)}px`,
        borderRadius: px(999),
        background: overArt ? theme.chipBackground : "transparent",
        border: `${px(1)}px solid ${overArt ? `${color}b3` : theme.frameBorder}`,
        fontSize: px(14),
        fontWeight: 700,
        color: theme.ink,
      }}
    >
      <div style={{ display: "flex", width: px(18), height: px(18), borderRadius: px(999), background: color }} />
      {domain}
    </div>
  );
}

function Cost({ cost, theme, size }: { cost: number; theme: Theme; size: number }) {
  return (
    <div
      style={{
        display: "flex",
        flexShrink: 0,
        width: px(size),
        height: px(size),
        borderRadius: px(999),
        border: `${px(1)}px solid ${theme.costBorder}`,
        alignItems: "center",
        justifyContent: "center",
        fontSize: px(size * 0.55),
        color: theme.costInk,
      }}
    >
      {String(cost)}
    </div>
  );
}

function Line({ line, theme, row, font }: { line: BusinessCardLine; theme: Theme; row: number; font: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: px(10), height: px(row) }}>
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          width: px(font * 1.15),
          fontSize: px(font * 0.95),
          fontWeight: 700,
          color: theme.accent,
        }}
      >
        {String(line.quantity)}
      </div>
      <div
        style={{
          display: "block",
          flexGrow: 1,
          minWidth: 0,
          fontSize: px(font),
          color: theme.ink,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {line.name}
      </div>
      {line.cost !== undefined && <Cost cost={line.cost} theme={theme} size={Math.min(22, row - 3)} />}
    </div>
  );
}

function Section({ section, theme, row, font }: { section: BusinessCardSection; theme: Theme; row: number; font: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <SectionHeader title={section.title} count={section.count} theme={theme} />
      {section.lines.map((line) => (
        <Line key={line.name} line={line} theme={theme} row={row} font={font} />
      ))}
      {section.hidden > 0 && (
        <div style={{ display: "flex", height: px(row), alignItems: "center", fontSize: px(font * 0.9), color: theme.faint }}>
          {`+ ${section.hidden} autre${section.hidden > 1 ? "s" : ""}`}
        </div>
      )}
    </div>
  );
}

function SectionHeader({ title, count, theme }: { title: string; count: number; theme: Theme }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        gap: px(8),
        height: px(22),
        paddingBottom: px(5),
        marginBottom: px(4),
        borderBottom: `${px(1)}px solid ${theme.rule}`,
      }}
    >
      <Label theme={theme}>{title}</Label>
      <div style={{ display: "flex", fontSize: px(12), color: theme.faint }}>{String(count)}</div>
    </div>
  );
}

function Header({ layout, theme, assets }: { layout: BusinessCardLayout; theme: Theme; assets: BusinessCardAssets }) {
  const illustrated = layout.style === "illustrated" && Boolean(assets.art);
  const topRow = (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div style={{ display: "flex", gap: px(8) }}>
        {layout.domains.map((domain) => (
          <DomainChip key={domain} domain={domain} theme={theme} overArt={illustrated} />
        ))}
      </div>
      {layout.gameName && (
        <div
          style={{
            display: "flex",
            padding: `${px(5)}px ${px(10)}px`,
            borderRadius: px(6),
            background: illustrated ? theme.chipBackground : "transparent",
            fontSize: px(12),
            letterSpacing: px(1.5),
            color: illustrated ? "#b9c6d0" : theme.muted,
            textTransform: "uppercase",
          }}
        >
          {layout.gameName}
        </div>
      )}
    </div>
  );
  const identity = (
    <div style={{ display: "flex", flexDirection: "column", gap: px(4) }}>
      <Label theme={theme}>{layout.kicker}</Label>
      <div
        style={{
          display: "block",
          fontSize: px(layout.title.length > 24 ? 32 : 40),
          fontWeight: 700,
          letterSpacing: px(-0.6),
          lineHeight: 1.08,
          color: theme.ink,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {layout.title}
      </div>
      {layout.subtitle && (
        <div
          style={{
            display: "block",
            fontSize: px(16),
            color: theme.muted,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {layout.subtitle}
        </div>
      )}
    </div>
  );

  if (!illustrated) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          height: px(168),
          flexShrink: 0,
          padding: `${px(26)}px ${px(28)}px ${px(8)}px`,
        }}
      >
        {topRow}
        {identity}
      </div>
    );
  }

  // L'illustration d'une légende de Riftbound occupe le haut de la carte, sous
  // les icônes de domaine imprimées à gauche : on la recadre au-delà de
  // celles-ci. Une autre image est simplement couverte.
  const art = layout.art?.legend ? (
    <CroppedArt src={assets.art!} width={FRAME_INNER_WIDTH} />
  ) : (
    <img
      src={assets.art}
      alt=""
      width={px(FRAME_INNER_WIDTH)}
      height={px(HEADER_HEIGHT)}
      style={{ position: "absolute", left: 0, top: 0, objectFit: "cover" }}
    />
  );

  return (
    <div style={{ display: "flex", position: "relative", height: px(HEADER_HEIGHT), flexShrink: 0, overflow: "hidden" }}>
      {art}
      <div
        style={{
          display: "flex",
          position: "absolute",
          left: 0,
          top: 0,
          right: 0,
          bottom: 0,
          backgroundImage: `linear-gradient(180deg, rgba(7,13,19,0.15) 0%, rgba(7,13,19,0.05) 35%, rgba(7,13,19,0.85) 78%, ${theme.frame} 100%)`,
        }}
      />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          position: "absolute",
          left: px(20),
          right: px(20),
          top: px(18),
          bottom: px(14),
        }}
      >
        {topRow}
        <div style={{ display: "flex", paddingLeft: px(8), paddingRight: px(8) }}>{identity}</div>
      </div>
    </div>
  );
}

function Champion({ layout, theme, assets }: { layout: BusinessCardLayout; theme: Theme; assets: BusinessCardAssets }) {
  const champion = layout.champion!;
  const withImage = layout.style === "illustrated" && Boolean(assets.champion);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: px(14),
        margin: `${px(10)}px ${px(28)}px 0`,
        padding: `${px(10)}px ${px(12)}px`,
        height: px(70),
        borderRadius: px(12),
        background: theme.panel,
        border: `${px(1)}px solid ${theme.panelBorder}`,
      }}
    >
      {withImage && (
        <div style={{ display: "flex", position: "relative", width: px(62), height: px(46), borderRadius: px(8), overflow: "hidden" }}>
          <CroppedArt src={assets.champion!} width={62} />
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: px(2), flexGrow: 1, minWidth: 0 }}>
        <Label theme={theme} size={11}>
          Champion choisi
        </Label>
        <div
          style={{
            display: "block",
            fontSize: px(19),
            fontWeight: 700,
            color: theme.ink,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {champion.name}
        </div>
      </div>
      {champion.cost !== undefined && <Cost cost={champion.cost} theme={theme} size={30} />}
    </div>
  );
}

function Chips({ layout, theme }: { layout: BusinessCardLayout; theme: Theme }) {
  const chips = layout.chips!;
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <SectionHeader title={chips.title} count={chips.count} theme={theme} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: px(8), marginTop: px(4) }}>
        {chips.items.map((chip) => (
          <div
            key={chip.label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: px(7),
              padding: `${px(4)}px ${px(11)}px ${px(4)}px ${px(5)}px`,
              borderRadius: px(999),
              background: theme.panel,
              border: `${px(1)}px solid ${theme.panelBorder}`,
              fontSize: px(15),
              color: theme.ink,
            }}
          >
            <div
              style={{
                display: "flex",
                width: px(16),
                height: px(16),
                borderRadius: px(999),
                background: chip.domain ? domainColor(chip.domain) : COLORLESS_COLOR,
              }}
            />
            {chip.quantity !== undefined && (
              <div style={{ display: "flex", fontWeight: 700, color: theme.accent }}>{String(chip.quantity)}</div>
            )}
            {chip.label}
          </div>
        ))}
      </div>
    </div>
  );
}

export async function renderBusinessCard(layout: BusinessCardLayout, assets: BusinessCardAssets): Promise<ImageResponse> {
  const theme = THEMES[layout.style];
  const { row, font } = layout.density;
  const dark = layout.style === "illustrated" ? "#e6edf3" : "#0b1218";
  const qr = layout.qrUrl
    ? `data:image/svg+xml;base64,${Buffer.from(
        await QRCode.toString(layout.qrUrl, { type: "svg", margin: 0, color: { dark, light: "#00000000" } })
      ).toString("base64")}`
    : undefined;

  const column = (sections: BusinessCardSection[], bottom: React.ReactNode[] = []) => (
    <div style={{ display: "flex", flexDirection: "column", gap: px(12), flex: 1, minWidth: 0 }}>
      {sections.map((section) => (
        <Section key={section.key} section={section} theme={theme} row={row} font={font} />
      ))}
      {...bottom}
    </div>
  );

  const bottom = [
    layout.chips && <Chips key="chips" layout={layout} theme={theme} />,
    qr && (
        <div
          key="qr"
          style={{
            display: "flex",
            alignItems: "center",
            gap: px(14),
            marginTop: "auto",
            padding: px(10),
            borderRadius: px(12),
            background: theme.panel,
            border: `${px(1)}px solid ${theme.panelBorder}`,
          }}
        >
          <img src={qr} alt="" width={px(78)} height={px(78)} />
          <div style={{ display: "flex", flex: 1, fontSize: px(13), lineHeight: 1.35, color: theme.muted }}>
            Scanner pour ouvrir le deck sur Joutes
          </div>
        </div>
    ),
  ];

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          padding: px(18),
          background: theme.page,
          borderRadius: px(36),
          fontFamily: "Geist",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: "100%",
            height: "100%",
            border: `${px(1.5)}px solid ${theme.frameBorder}`,
            borderRadius: px(24),
            overflow: "hidden",
            background: theme.frame,
          }}
        >
          <Header layout={layout} theme={theme} assets={assets} />
          {layout.champion && <Champion layout={layout} theme={theme} assets={assets} />}
          <div style={{ display: "flex", flex: 1, gap: px(28), margin: `${px(14)}px ${px(28)}px 0`, minHeight: 0 }}>
            {column(layout.columns[0])}
            {column(layout.columns[1], bottom)}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexShrink: 0,
              margin: `${px(12)}px ${px(28)}px 0`,
              padding: `${px(12)}px 0 ${px(16)}px`,
              borderTop: `${px(1)}px solid ${theme.rule}`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: px(9) }}>
              {/* Le logo est carré sur fond blanc : le site le montre en rond. */}
              {assets.logo && (
                <img src={assets.logo} alt="" width={px(26)} height={px(26)} style={{ borderRadius: px(999) }} />
              )}
              <div
                style={{
                  display: "flex",
                  fontSize: px(19),
                  fontWeight: 700,
                  backgroundImage: "linear-gradient(90deg, #3b82f6, #8b5cf6)",
                  backgroundClip: "text",
                  color: "transparent",
                }}
              >
                Joutes
              </div>
            </div>
            <div style={{ display: "flex", fontSize: px(13), color: theme.faint }}>{layout.footer}</div>
          </div>
        </div>
      </div>
    ),
    {
      width: BUSINESS_CARD_SIZE.width * BUSINESS_CARD_SCALE,
      height: BUSINESS_CARD_SIZE.height * BUSINESS_CARD_SCALE,
      fonts: await loadFonts(),
    }
  );
}
