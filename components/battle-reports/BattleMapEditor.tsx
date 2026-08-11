"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { nanoid } from "nanoid";
import { Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  BATTLE_MAP_SHAPES,
  BATTLE_MAP_SHAPE_LABELS,
  DEFAULT_TERRAIN_COLOR,
  DEFAULT_TERRAIN_SIZE,
  DEFAULT_TOKEN_DIAMETER,
  MAX_LABEL_LENGTH,
  MAX_SNAPSHOTS,
  MAX_TABLE_SIDE,
  MAX_TERRAIN_PIECES,
  MAX_UNIT_TOKENS,
  MIN_TABLE_SIDE,
  MIN_TOKEN_SIZE,
  colorForPlayer,
  defaultTableForGame,
  emptyBattleMap,
  normalizeTable,
  trianglePoints,
} from "@/lib/battle-reports/battle-map";
import type {
  BattleMap,
  BattleMapShape,
  BattleMapTerrain,
  BattleMapUnitToken,
  BattleReportArmy,
  GameMatchPlayer,
} from "@/lib/types/Match";
import { updateBattleMapAction } from "@/app/game-matches/actions";

/**
 * Table de jeu vue de dessus.
 *
 * Tout le modèle est en centimètres et le dessin n'est qu'une mise à l'échelle :
 * la `viewBox` du SVG **est** la table. Un jeton de 4 cm occupe donc la même
 * fraction du plateau sur un téléphone que sur un écran de bureau, et déplacer
 * un jeton revient à convertir une position de pointeur en centimètres — sans
 * jamais stocker un pixel.
 *
 * Le composant sert aussi de vue en lecture seule : les joueurs qui ne tiennent
 * pas le rapport voient la même table, sans les poignées ni les panneaux.
 */
export default function BattleMapEditor({
  matchId,
  gameSlug,
  players,
  armies,
  map: savedMap,
  editable,
}: {
  matchId: string;
  gameSlug?: string;
  players: GameMatchPlayer[];
  armies: Record<string, BattleReportArmy>;
  map?: BattleMap;
  editable: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [showNames, setShowNames] = useState(true);

  const [map, setMap] = useState<BattleMap>(
    () =>
      savedMap ??
      emptyBattleMap(
        gameSlug,
        nanoid(8),
        players.map((player) => player.userId)
      )
  );
  const [snapshotIndex, setSnapshotIndex] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  // Ce qu'on tient sous le doigt : l'élément, et l'écart entre son centre et le
  // point saisi — sans lui, le jeton sauterait sous le pointeur au premier
  // mouvement.
  const drag = useRef<
    | { id: string; kind: "terrain" | "unit" | "resize"; offsetX: number; offsetY: number }
    | null
  >(null);

  const snapshot = map.snapshots[snapshotIndex] ?? map.snapshots[0];
  const preset = useMemo(() => defaultTableForGame(gameSlug), [gameSlug]);

  const playerColor = (playerId: string) =>
    colorForPlayer(map, playerId, players.findIndex((player) => player.userId === playerId));

  const update = (next: BattleMap) => {
    setMap(next);
    setDirty(true);
  };

  const updateSnapshot = (units: BattleMapUnitToken[]) => {
    update({
      ...map,
      snapshots: map.snapshots.map((entry, index) =>
        index === snapshotIndex ? { ...entry, units } : entry
      ),
    });
  };

  /**
   * Un doigt qui file au-delà du plateau ne doit pas emporter le jeton avec
   * lui : la `viewBox` s'arrête à la table, et ce qui sort disparaît de l'écran.
   * Le serveur ramène déjà tout au bord à l'enregistrement — le faire aussi au
   * déplacement, c'est montrer tout de suite ce qui sera gardé.
   */
  const clampToTable = (x: number, y: number) => ({
    x: Math.min(map.table.width, Math.max(0, x)),
    y: Math.min(map.table.height, Math.max(0, y)),
  });

  /** Position du pointeur, en centimètres sur la table. */
  const toTable = (event: React.PointerEvent) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) {
      return { x: 0, y: 0 };
    }

    return {
      x: ((event.clientX - rect.left) / rect.width) * map.table.width,
      y: ((event.clientY - rect.top) / rect.height) * map.table.height,
    };
  };

  const startDrag = (
    event: React.PointerEvent,
    id: string,
    kind: "terrain" | "unit" | "resize",
    center: { x: number; y: number }
  ) => {
    if (!editable) return;
    event.preventDefault();
    event.stopPropagation();
    setSelectedId(id);
    const point = toTable(event);
    drag.current = { id, kind, offsetX: point.x - center.x, offsetY: point.y - center.y };
    svgRef.current?.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    const current = drag.current;
    if (!current) return;

    const point = toTable(event);

    if (current.kind === "resize") {
      const piece = map.terrain.find((entry) => entry.id === current.id);
      if (!piece) return;
      update({
        ...map,
        terrain: map.terrain.map((entry) =>
          entry.id === current.id
            ? {
                ...entry,
                // La poignée tire un coin : la pièce grandit de part et d'autre
                // de son centre, qui ne bouge pas.
                width: Math.min(
                  map.table.width,
                  Math.max(MIN_TOKEN_SIZE, Math.abs(point.x - piece.x) * 2)
                ),
                height: Math.min(
                  map.table.height,
                  Math.max(MIN_TOKEN_SIZE, Math.abs(point.y - piece.y) * 2)
                ),
              }
            : entry
        ),
      });
      return;
    }

    const { x, y } = clampToTable(point.x - current.offsetX, point.y - current.offsetY);

    if (current.kind === "terrain") {
      update({
        ...map,
        terrain: map.terrain.map((entry) => (entry.id === current.id ? { ...entry, x, y } : entry)),
      });
    } else {
      updateSnapshot(
        snapshot.units.map((unit) => (unit.id === current.id ? { ...unit, x, y } : unit))
      );
    }
  };

  const endDrag = (event: React.PointerEvent) => {
    if (!drag.current) return;
    drag.current = null;
    svgRef.current?.releasePointerCapture(event.pointerId);
  };

  const addTerrain = (shape: BattleMapShape) => {
    if (map.terrain.length >= MAX_TERRAIN_PIECES) return;
    const piece: BattleMapTerrain = {
      id: nanoid(8),
      shape,
      color: DEFAULT_TERRAIN_COLOR,
      x: map.table.width / 2,
      y: map.table.height / 2,
      width: DEFAULT_TERRAIN_SIZE,
      height: DEFAULT_TERRAIN_SIZE,
    };
    update({ ...map, terrain: [...map.terrain, piece] });
    setSelectedId(piece.id);
  };

  const addUnitToken = (playerId: string, unit: { name: string; image?: string; productId?: string }) => {
    if (snapshot.units.length >= MAX_UNIT_TOKENS) return;
    const token: BattleMapUnitToken = {
      id: nanoid(8),
      playerId,
      unitName: unit.name,
      ...(unit.productId ? { productId: unit.productId } : {}),
      ...(unit.image ? { image: unit.image } : {}),
      x: map.table.width / 2,
      y: map.table.height / 2,
      diameter: DEFAULT_TOKEN_DIAMETER,
    };
    updateSnapshot([...snapshot.units, token]);
    setSelectedId(token.id);
  };

  const removeSelected = () => {
    if (!selectedId) return;
    update({
      ...map,
      terrain: map.terrain.filter((piece) => piece.id !== selectedId),
      snapshots: map.snapshots.map((entry, index) =>
        index === snapshotIndex
          ? { ...entry, units: entry.units.filter((unit) => unit.id !== selectedId) }
          : entry
      ),
    });
    setSelectedId(null);
  };

  /**
   * Un nouvel instant part de l'état courant : on capture une évolution, pas
   * une table vide — les unités ont bougé de quelques centimètres, elles n'ont
   * pas été reposées.
   */
  const addSnapshot = () => {
    if (map.snapshots.length >= MAX_SNAPSHOTS) return;
    const copy = {
      id: nanoid(8),
      label: `Instant ${map.snapshots.length + 1}`,
      units: snapshot.units.map((unit) => ({ ...unit, id: nanoid(8) })),
    };
    update({ ...map, snapshots: [...map.snapshots, copy] });
    setSnapshotIndex(map.snapshots.length);
    setSelectedId(null);
  };

  const removeSnapshot = () => {
    if (map.snapshots.length <= 1) return;
    update({ ...map, snapshots: map.snapshots.filter((_, index) => index !== snapshotIndex) });
    setSnapshotIndex(Math.max(0, snapshotIndex - 1));
    setSelectedId(null);
  };

  const handleSave = () => {
    setError(null);
    startTransition(async () => {
      const result = await updateBattleMapAction(matchId, map);
      if (result.success) {
        setDirty(false);
      } else {
        setError(result.error || "Erreur lors de l'enregistrement de la table");
      }
    });
  };

  const selectedTerrain = map.terrain.find((piece) => piece.id === selectedId);
  const selectedUnit = snapshot?.units.find((unit) => unit.id === selectedId);

  // Épaisseurs et tailles de texte exprimées dans l'échelle de la table, pour
  // qu'elles restent constantes quelle que soit la taille du plateau.
  const strokeWidth = Math.max(0.2, Math.min(map.table.width, map.table.height) / 250);
  const fontSize = Math.min(map.table.width, map.table.height) / 30;

  if (!snapshot) {
    return null;
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive rounded-lg text-destructive text-sm">
          {error}
        </div>
      )}

      {/* Instants */}
      <div className="flex flex-wrap items-center gap-2">
        {map.snapshots.map((entry, index) => (
          <Button
            key={entry.id}
            type="button"
            size="sm"
            variant={index === snapshotIndex ? "default" : "outline"}
            onClick={() => {
              setSnapshotIndex(index);
              setSelectedId(null);
            }}
          >
            {entry.label}
          </Button>
        ))}
        {editable && map.snapshots.length < MAX_SNAPSHOTS && (
          <Button type="button" size="sm" variant="ghost" className="gap-1" onClick={addSnapshot}>
            <Plus className="h-4 w-4" />
            Nouvel instant
          </Button>
        )}
      </div>

      {/* La table */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${map.table.width} ${map.table.height}`}
        className="w-full h-auto touch-none select-none rounded-lg border bg-muted/30"
        role="img"
        aria-label={`Table de jeu de ${map.table.width} sur ${map.table.height} centimètres, ${snapshot.label}`}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerDown={() => setSelectedId(null)}
      >
        <defs>
          {/* Une graduation tous les 10 cm : de quoi juger une distance sans
              avoir à mesurer. */}
          <pattern id={`grid-${matchId}`} width="10" height="10" patternUnits="userSpaceOnUse">
            <path
              d="M 10 0 L 0 0 0 10"
              fill="none"
              stroke="currentColor"
              strokeOpacity="0.15"
              strokeWidth={strokeWidth / 2}
            />
          </pattern>
          {snapshot.units
            .filter((unit) => unit.image)
            .map((unit) => (
              <clipPath key={unit.id} id={`token-${unit.id}`}>
                <circle cx={unit.x} cy={unit.y} r={unit.diameter / 2} />
              </clipPath>
            ))}
        </defs>

        <rect width={map.table.width} height={map.table.height} fill={`url(#grid-${matchId})`} />

        {map.terrain.map((piece) => {
          const isSelected = piece.id === selectedId;
          const common = {
            fill: piece.color,
            fillOpacity: 0.75,
            stroke: isSelected ? "#ffffff" : piece.color,
            strokeWidth: isSelected ? strokeWidth * 2 : strokeWidth,
            onPointerDown: (event: React.PointerEvent) =>
              startDrag(event, piece.id, "terrain", piece),
            className: editable ? "cursor-move" : undefined,
          };

          return (
            <g key={piece.id}>
              {piece.shape === "circle" && (
                <ellipse cx={piece.x} cy={piece.y} rx={piece.width / 2} ry={piece.height / 2} {...common} />
              )}
              {piece.shape === "rectangle" && (
                <rect
                  x={piece.x - piece.width / 2}
                  y={piece.y - piece.height / 2}
                  width={piece.width}
                  height={piece.height}
                  {...common}
                />
              )}
              {piece.shape === "triangle" && <polygon points={trianglePoints(piece)} {...common} />}

              {showNames && piece.name && (
                <text
                  x={piece.x}
                  y={piece.y + piece.height / 2 + fontSize}
                  textAnchor="middle"
                  fontSize={fontSize}
                  className="pointer-events-none fill-foreground"
                >
                  {piece.name}
                </text>
              )}

              {editable && isSelected && (
                <rect
                  x={piece.x + piece.width / 2 - fontSize / 2}
                  y={piece.y + piece.height / 2 - fontSize / 2}
                  width={fontSize}
                  height={fontSize}
                  fill="#ffffff"
                  stroke={piece.color}
                  strokeWidth={strokeWidth}
                  className="cursor-nwse-resize"
                  onPointerDown={(event) => startDrag(event, piece.id, "resize", piece)}
                />
              )}
            </g>
          );
        })}

        {snapshot.units.map((unit) => {
          const color = playerColor(unit.playerId);
          const radius = unit.diameter / 2;
          const isSelected = unit.id === selectedId;

          return (
            <g
              key={unit.id}
              onPointerDown={(event) => startDrag(event, unit.id, "unit", unit)}
              className={editable ? "cursor-move" : undefined}
            >
              {unit.image ? (
                <>
                  <image
                    href={unit.image}
                    x={unit.x - radius}
                    y={unit.y - radius}
                    width={unit.diameter}
                    height={unit.diameter}
                    preserveAspectRatio="xMidYMid slice"
                    clipPath={`url(#token-${unit.id})`}
                  />
                  {/* Image dans le rond, et de la couleur du joueur seulement la
                      bordure : c'est elle qui dit à qui appartient l'unité. */}
                  <circle
                    cx={unit.x}
                    cy={unit.y}
                    r={radius}
                    fill="none"
                    stroke={color}
                    strokeWidth={strokeWidth * 3}
                  />
                </>
              ) : (
                <circle
                  cx={unit.x}
                  cy={unit.y}
                  r={radius}
                  fill={color}
                  stroke={color}
                  strokeWidth={strokeWidth}
                />
              )}

              {isSelected && (
                <circle
                  cx={unit.x}
                  cy={unit.y}
                  r={radius + strokeWidth * 2}
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth={strokeWidth}
                />
              )}

              {showNames && (
                <text
                  x={unit.x}
                  y={unit.y + radius + fontSize}
                  textAnchor="middle"
                  fontSize={fontSize}
                  className="pointer-events-none fill-foreground"
                >
                  {unit.unitName}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {players.map((player) => (
            <span key={player.userId} className="flex items-center gap-1.5 text-xs">
              <span
                className="inline-block size-3 rounded-full border"
                style={{ backgroundColor: playerColor(player.userId) }}
              />
              {player.username}
            </span>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={showNames}
            onChange={(event) => setShowNames(event.target.checked)}
          />
          Afficher les noms
        </label>
      </div>

      {!editable && (
        <p className="text-xs text-muted-foreground">
          Seul le créateur du rapport dispose la table.
        </p>
      )}

      {editable && (
        <div className="space-y-4">
          {/* Dimensions */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Dimensions de la table</p>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                Largeur
                <Input
                  type="number"
                  className="w-24"
                  min={MIN_TABLE_SIDE}
                  max={MAX_TABLE_SIDE}
                  value={map.table.width}
                  onChange={(event) =>
                    update({
                      ...map,
                      table: normalizeTable({
                        width: Number(event.target.value),
                        height: map.table.height,
                      }),
                    })
                  }
                />
              </label>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                Hauteur
                <Input
                  type="number"
                  className="w-24"
                  min={MIN_TABLE_SIDE}
                  max={MAX_TABLE_SIDE}
                  value={map.table.height}
                  onChange={(event) =>
                    update({
                      ...map,
                      table: normalizeTable({
                        width: map.table.width,
                        height: Number(event.target.value),
                      }),
                    })
                  }
                />
              </label>
              <span className="text-xs text-muted-foreground">
                cm — habituel pour ce jeu : {preset.width} × {preset.height}
              </span>
            </div>
          </div>

          {/* Décor */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Ajouter un décor</p>
            <div className="flex flex-wrap gap-2">
              {BATTLE_MAP_SHAPES.map((shape) => (
                <Button
                  key={shape}
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-1"
                  disabled={map.terrain.length >= MAX_TERRAIN_PIECES}
                  onClick={() => addTerrain(shape)}
                >
                  <Plus className="h-4 w-4" />
                  {BATTLE_MAP_SHAPE_LABELS[shape]}
                </Button>
              ))}
            </div>
          </div>

          {/* Unités des joueurs */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Poser une unité</p>
            {players.map((player) => {
              const units = armies[player.userId]?.units ?? [];

              return (
                <div key={player.userId} className="space-y-1 rounded-lg border p-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      aria-label={`Couleur de ${player.username}`}
                      className="size-6 rounded border bg-transparent"
                      value={playerColor(player.userId)}
                      onChange={(event) =>
                        update({
                          ...map,
                          playerColors: {
                            ...map.playerColors,
                            [player.userId]: event.target.value,
                          },
                        })
                      }
                    />
                    <span className="text-sm">{player.username}</span>
                  </div>

                  {units.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Aucune figurine dans sa liste d&apos;armée.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {units.map((unit, index) => (
                        <Button
                          key={`${unit.productId ?? "libre"}-${index}`}
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 gap-1 text-xs"
                          disabled={snapshot.units.length >= MAX_UNIT_TOKENS}
                          onClick={() => addUnitToken(player.userId, unit)}
                        >
                          <Plus className="h-3 w-3" />
                          {unit.name}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Élément sélectionné */}
          {(selectedTerrain || selectedUnit) && (
            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  {selectedTerrain
                    ? BATTLE_MAP_SHAPE_LABELS[selectedTerrain.shape]
                    : selectedUnit?.unitName}
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="gap-1 text-destructive"
                  onClick={removeSelected}
                >
                  <Trash2 className="h-4 w-4" />
                  Retirer
                </Button>
              </div>

              {selectedTerrain && (
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    type="text"
                    className="w-44"
                    placeholder="Nom du décor"
                    maxLength={MAX_LABEL_LENGTH}
                    value={selectedTerrain.name ?? ""}
                    onChange={(event) =>
                      update({
                        ...map,
                        terrain: map.terrain.map((piece) =>
                          piece.id === selectedTerrain.id
                            ? { ...piece, name: event.target.value }
                            : piece
                        ),
                      })
                    }
                  />
                  <input
                    type="color"
                    aria-label="Couleur du décor"
                    className="size-9 rounded border bg-transparent"
                    value={selectedTerrain.color}
                    onChange={(event) =>
                      update({
                        ...map,
                        terrain: map.terrain.map((piece) =>
                          piece.id === selectedTerrain.id
                            ? { ...piece, color: event.target.value }
                            : piece
                        ),
                      })
                    }
                  />
                  <label className="flex items-center gap-1 text-xs text-muted-foreground">
                    L
                    <Input
                      type="number"
                      className="w-20"
                      min={MIN_TOKEN_SIZE}
                      value={selectedTerrain.width}
                      onChange={(event) =>
                        update({
                          ...map,
                          terrain: map.terrain.map((piece) =>
                            piece.id === selectedTerrain.id
                              ? { ...piece, width: Math.max(MIN_TOKEN_SIZE, Number(event.target.value)) }
                              : piece
                          ),
                        })
                      }
                    />
                  </label>
                  <label className="flex items-center gap-1 text-xs text-muted-foreground">
                    H
                    <Input
                      type="number"
                      className="w-20"
                      min={MIN_TOKEN_SIZE}
                      value={selectedTerrain.height}
                      onChange={(event) =>
                        update({
                          ...map,
                          terrain: map.terrain.map((piece) =>
                            piece.id === selectedTerrain.id
                              ? { ...piece, height: Math.max(MIN_TOKEN_SIZE, Number(event.target.value)) }
                              : piece
                          ),
                        })
                      }
                    />
                  </label>
                </div>
              )}

              {selectedUnit && (
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  Diamètre du socle (cm)
                  <Input
                    type="number"
                    className="w-20"
                    min={MIN_TOKEN_SIZE}
                    value={selectedUnit.diameter}
                    onChange={(event) =>
                      updateSnapshot(
                        snapshot.units.map((unit) =>
                          unit.id === selectedUnit.id
                            ? { ...unit, diameter: Math.max(MIN_TOKEN_SIZE, Number(event.target.value)) }
                            : unit
                        )
                      )
                    }
                  />
                </label>
              )}
            </div>
          )}

          {/* Instant courant */}
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              Nom de l&apos;instant
              <Input
                type="text"
                className="w-56"
                maxLength={MAX_LABEL_LENGTH}
                value={snapshot.label}
                onChange={(event) =>
                  update({
                    ...map,
                    snapshots: map.snapshots.map((entry, index) =>
                      index === snapshotIndex ? { ...entry, label: event.target.value } : entry
                    ),
                  })
                }
              />
            </label>
            {map.snapshots.length > 1 && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="gap-1 text-destructive"
                onClick={removeSnapshot}
              >
                <Trash2 className="h-4 w-4" />
                Supprimer l&apos;instant
              </Button>
            )}
          </div>

          <div className="flex items-center justify-end gap-3">
            {dirty && <Badge variant="outline">Modifications non enregistrées</Badge>}
            <Button type="button" onClick={handleSave} disabled={isPending || !dirty} className="gap-2">
              <Save className="h-4 w-4" />
              {isPending ? "Enregistrement..." : "Enregistrer la table"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
