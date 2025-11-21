'use client';

import { useState, useTransition } from 'react';
import { Lair } from '@/lib/types/Lair';
import { updateCalendarMode } from './actions';
import { Button } from '@/components/ui/button';
import { Calendar } from 'lucide-react';

interface CalendarModeSwitchProps {
  lair: Lair;
}

export function CalendarModeSwitch({ lair }: CalendarModeSwitchProps) {
  const currentMode = lair.options?.calendar?.mode || 'CALENDAR';
  const [mode, setMode] = useState<'CALENDAR' | 'AGENDA'>(currentMode);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleModeChange = (newMode: 'CALENDAR' | 'AGENDA') => {
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
        <Calendar className="h-4 w-4 text-gray-600" />
        <label className="text-sm font-medium text-gray-700">
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
      </div>

      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}
      
      {isPending && (
        <p className="text-xs text-gray-500">Mise à jour en cours...</p>
      )}
    </div>
  );
}
