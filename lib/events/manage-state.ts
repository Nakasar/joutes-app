import { readChoice, readPage, writePage } from "@/lib/navigation/url-query";

/**
 * L'état des onglets d'organisation d'un événement, gardé dans l'adresse :
 * l'onglet ouvert, et pour les inscrits la recherche, le statut filtré, la
 * page et sa taille. Revenir sur la page — ou la recharger — rend la même vue.
 */

export const EVENT_MANAGE_TABS = ["overview", "participants", "waitlist", "interested"] as const;
export type EventManageTab = (typeof EVENT_MANAGE_TABS)[number];

export const PARTICIPANT_FILTERS = ["all", "REGISTERED", "PRE_REGISTERED", "EXCLUDED"] as const;
export type ParticipantFilter = (typeof PARTICIPANT_FILTERS)[number];

export const PARTICIPANT_PAGE_SIZES = [10, 25, 50] as const;

export type EventManageState = {
  tab: EventManageTab;
  query: string;
  status: ParticipantFilter;
  /** À partir de 1, comme dans l'adresse. */
  page: number;
  pageSize: number;
};

export function readEventManageState(params: URLSearchParams): EventManageState {
  const size = Number.parseInt(params.get("size") ?? "", 10);
  return {
    tab: readChoice(params, "tab", EVENT_MANAGE_TABS, "overview"),
    query: params.get("q") ?? "",
    status: readChoice(params, "status", PARTICIPANT_FILTERS, "all"),
    page: readPage(params),
    pageSize: (PARTICIPANT_PAGE_SIZES as readonly number[]).includes(size) ? size : PARTICIPANT_PAGE_SIZES[0],
  };
}

/** Seul ce qui s'écarte du défaut est écrit ; la recherche ne suit que l'onglet des inscrits. */
export function writeEventManageState(state: EventManageState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.tab !== "overview") params.set("tab", state.tab);
  if (state.tab === "participants") {
    if (state.query.trim()) params.set("q", state.query.trim());
    if (state.status !== "all") params.set("status", state.status);
    writePage(params, state.page);
    if (state.pageSize !== PARTICIPANT_PAGE_SIZES[0]) params.set("size", String(state.pageSize));
  }
  return params;
}
