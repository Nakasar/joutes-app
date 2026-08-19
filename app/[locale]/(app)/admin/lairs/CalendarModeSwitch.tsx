'use client';

import { useState, useTransition } from 'react';
import { Lair } from '@/lib/types/Lair.ts';
import { updateCalendarMode } from './actions.ts';
import { Button } from '@/components/ui/button.tsx';
import { Calendar } from 'lucide-react';

interface CalendarModeSwitchProps {
  lair: Lair;
}

export function CalendarModeSwitch({ lair }: CalendarModeSwitchProps) {
  const currentMode = lair.options?.calendar?.mode || 'CALENDAR';
  const [mode, setMode] = useState<'CALENDAR' | 'AGENDA' | 'CONFERENCE'>(currentMode);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleModeChange = (newMode: 'CALENDAR' | 'AGENDA' | 'CONFERENCE') => {
    setMode(newMode);
    setError(null);

    startTransition(async () => {
      const result = await updateCalendarMode(lair.id, newMode);
      
      if (!result.success) {
        setError(result.error || 'Erreur lors de la mise à jour');
        // Restaurer l'ancien mode en cas d'erreur
        setMode(currentMode);
      }
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <label className="text-sm font-medium text-foreground">
          Vue du calendrier
        </label>
      </div>
      
      <div className="flex gap-2">
        <Button
          type="button"
          variant={mode === 'CALENDAR' ? 'default' : 'outline'}
          size="sm"
          onClick={() => handleModeChange('CALENDAR')}
          disabled={isPending}
          className="flex-1"
        >
          Calendrier
        </Button>
        <Button
          type="button"
          variant={mode === 'AGENDA' ? 'default' : 'outline'}
          size="sm"
          onClick={() => handleModeChange('AGENDA')}
          disabled={isPending}
          className="flex-1"
        >
          Agenda
        </Button>
        <Button
          type="button"
          variant={mode === 'CONFERENCE' ? 'default' : 'outline'}
          size="sm"
          onClick={() => handleModeChange('CONFERENCE')}
          disabled={isPending}
          className="flex-1"
        >
          Conférence
        </Button>
      </div>

      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}
      
      {isPending && (
        <p className="text-xs text-muted-foreground">Mise à jour en cours...</p>
      )}
    </div>
  );
}
