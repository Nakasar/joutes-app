# Leagues and Tournaments

## Vue d'ensemble

Organiser des leagues étalées dans le temps et des tournois sur la plateforme Joutes.

Paramètres généraux :
- `format: 'KILLER' | 'POINTS'` : format de ligue.
- Liste de participants (users) avec leurs points, l'historique de leurs points et de leurs hauts faits.
- Liste de lieux partenaires de la ligue (lairs).
- Liste des jeux de la ligue.

### Formats de leagues :

## Killer

`format: 'KILLER'`

Les ligues de format "KILLER" fonctionnent par cibles à affronter.

Paramètres :
- `targets: number` (default: 1) : Le nombre de cibles en parallèle attributées aux participants.

## Points

`format: 'POINTS'`

Les leagues de format 'POINTS' fonctionnent par points accumulés lors des évènements et parties qui composent la league.

Paramètres:
- `pointsRules: object` with 
  - `participation: number` (default: 0)
  - `victory: number` (default: 2)
  - `defeat: number` (default: 1)
  - `feats: array` (default: [])
    - `title: string` : titre du haut-fait
    - `points: number` (default: 1) : points rapportés par le haut fait
    - `maxPerEvent?: number` (default: 1)
    - `maxPerLeague?: number` (default: undefined)
