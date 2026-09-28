'use client';

import { useEffect, useState } from 'react';
import { CalendarCheck, Clock, Loader2, Zap } from 'lucide-react';
import { ApiRequestError, fetchEstimate } from '@/lib/catalogueClient';
import type { ServiceSummary } from '@/lib/catalogue';
import { formatPrice, priceForDuration, priceUnitLabel } from '@/lib/catalogue';
import { DurationPicker } from './DurationPicker';
import { SlotPicker } from './SlotPicker';
import { LocationChip } from './LocationChip';
import { usePublicLocation } from './PublicLocationContext';

/**
 * The booking card of §20.3: duration, then the instant estimate, then the
 * slots.
 *
 * The estimate is a separate request from the slots on purpose. §9.1 wants the
 * card to answer "how soon can somebody come?" without waiting for a chosen day,
 * and the answer for *today* is not the answer for the selected date — folding
 * them into one fetch would mean the headline ETA changed every time somebody
 * picked a day, which is the sort of thing that reads as a bug.
 *
 * The Book button is honest about the last step: checkout is Phase 2, so the
 * card says so rather than opening a dead flow. A disabled button labelled
 * "Continue" is worse than a button that tells you what it will do.
 */

export function BookingPanel({ service }: { service: ServiceSummary }) {
  const { hasLocation, area, lat, lng, summary } = usePublicLocation();
  const [duration, setDuration] = useState(service.durations[0] ?? service.minDurationMinutes);
  const [slot, setSlot] = useState<{ start: string; label: string } | null>(null);
  const [eta, setEta] = useState<{ etaLabel: string; etaMinutes: number | null; pros: number } | null>(
    null
  );
  const [etaLoading, setEtaLoading] = useState(false);

  useEffect(() => {
    // A different job length is a different estimate, and a stale one would be
    // quoted next to the new price.
    setSlot(null);

    if (!hasLocation) {
      setEta(null);
      return;
    }

    let cancelled = false;
    setEtaLoading(true);
    fetchEstimate({
      serviceId: service.id,
      durationMinutes: duration,
      area: area ?? null,
      lat: lat ?? null,
      lng: lng ?? null,
    })
      .then((result) => {
        if (cancelled) return;
        setEta({
          etaLabel: result.etaLabel,
          etaMinutes: result.etaMinutes,
          pros: result.prosAvailable,
        });
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setEta(
          caught instanceof ApiRequestError
            ? { etaLabel: caught.message, etaMinutes: null, pros: 0 }
            : { etaLabel: 'We could not check availability right now.', etaMinutes: null, pros: 0 }
        );
      })
      .finally(() => {
        if (!cancelled) setEtaLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [service.id, duration, hasLocation, area, lat, lng]);

  const price = priceForDuration(service, duration, null);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm text-gray-600">Estimated total</p>
        <p className="text-2xl font-semibold text-gray-900">
          {formatPrice(price)}
          {priceUnitLabel(service)}
        </p>
      </div>
      <p className="mt-1 text-xs text-gray-500">
        An estimate. The final price is confirmed before you pay.
      </p>

      <div className="mt-5">
        <h3 className="mb-2 text-sm font-semibold text-gray-900">How long do you need?</h3>
        <DurationPicker
          service={service}
          minutes={duration}
          options={service.durations.map((minutes) => ({ minutes, price: null, priceMultiplier: null }))}
          onChange={setDuration}
        />
      </div>

      <div className="mt-5 rounded-xl bg-gray-50 p-3.5">
        <p className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <Zap className="h-4 w-4 text-amber-500" aria-hidden="true" />
          As soon as possible
        </p>
        {etaLoading ? (
          <p className="mt-1.5 flex items-center gap-2 text-sm text-gray-600">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            Checking today&apos;s slots…
          </p>
        ) : hasLocation ? (
          <>
            <p className="mt-1.5 text-sm text-gray-700">{eta?.etaLabel ?? 'Checking availability…'}</p>
            {eta && eta.pros > 0 ? (
              <p className="mt-1 text-xs text-gray-500">
                {eta.pros} professional{eta.pros === 1 ? '' : 's'} free today
              </p>
            ) : null}
          </>
        ) : (
          <p className="mt-1.5 text-sm text-gray-600">
            Add your area to see how soon somebody can reach you.
          </p>
        )}
      </div>

      <div className="mt-5">
        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-900">
          <CalendarCheck className="h-4 w-4 text-gray-400" aria-hidden="true" />
          Pick a time
        </h3>
        <SlotPicker service={service} durationMinutes={duration} onSelect={setSlot} selected={slot} />
      </div>

      <div className="mt-5 flex items-center justify-between gap-3 border-t border-gray-100 pt-4">
        <div>
          <p className="text-xs text-gray-500">Booking for</p>
          <p className="text-sm font-medium text-gray-900">
            {summary?.localityName ?? summary?.cityName ?? 'Location not set'}
          </p>
        </div>
        <LocationChip />
      </div>

      <button
        type="button"
        disabled
        title="Checkout arrives in Phase 2"
        className="mt-4 flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-gray-200 px-4 py-3 text-sm font-semibold text-gray-500"
      >
        <Clock className="h-4 w-4" aria-hidden="true" />
        {slot ? `Continue with ${slot.label}` : 'Select a slot to continue'}
      </button>
      <p className="mt-2 text-center text-xs text-gray-500">
        Booking and payment arrive in the next release.
      </p>
    </div>
  );
}
