import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import {
  CalendarClock,
  CalendarRange,
  Clock,
  Flame,
  Layers,
} from 'lucide-react';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ViewSwitcher } from '@/components/ui/ViewSwitcher';
import { useInsightsStore } from '@/stores/insightsStore';
import { useAllEvents } from '@/hooks/useEvents';
import { useCalendars } from '@/hooks/useCalendars';
import {
  computeWeekInsights,
  formatHours,
  getInsightWindow,
  type InsightRange,
} from '@/utils/eventInsights';

const RANGE_OPTIONS = [
  { value: 'thisWeek' as const, label: 'This week' },
  { value: 'next7' as const, label: 'Next 7 days' },
];

function Kpi({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-1 text-lg font-semibold text-foreground">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

export function WeekInsights() {
  const open = useInsightsStore((s) => s.open);
  const setOpen = useInsightsStore((s) => s.setOpen);
  const [range, setRange] = useState<InsightRange>('thisWeek');

  const { data: events = [] } = useAllEvents();
  const { data: calendars = [] } = useCalendars();

  const insights = useMemo(() => {
    const { start } = getInsightWindow(range);
    return computeWeekInsights(events, calendars, start);
  }, [events, calendars, range]);

  const maxDayHours = Math.max(0.001, ...insights.perDay.map((d) => d.hours));

  const rangeLabel = `${format(insights.windowStart, 'MMM d')} – ${format(
    new Date(insights.windowEnd.getTime() - 1),
    'MMM d'
  )}`;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md overflow-y-auto p-0"
      >
        <SheetHeader className="space-y-1 border-b border-border p-5">
          <SheetTitle className="text-lg">Where your week goes</SheetTitle>
          <SheetDescription>
            Time booked across your calendars · {rangeLabel}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 p-5">
          <ViewSwitcher
            value={range}
            onChange={(v) => setRange(v as InsightRange)}
            options={RANGE_OPTIONS}
            className="w-full [&>button]:flex-1"
          />

          {insights.eventCount === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No events in this range. Once you schedule some, you&apos;ll see
              where your time goes.
            </div>
          ) : (
            <>
              {/* Headline KPIs */}
              <div className="grid grid-cols-2 gap-3">
                <Kpi
                  icon={<Clock className="h-3.5 w-3.5" />}
                  label="Scheduled"
                  value={formatHours(insights.totalHours)}
                  sub={`${insights.eventCount} event${
                    insights.eventCount === 1 ? '' : 's'
                  }`}
                />
                <Kpi
                  icon={<Flame className="h-3.5 w-3.5" />}
                  label="Busiest day"
                  value={
                    insights.busiestDay
                      ? format(insights.busiestDay.date, 'EEE')
                      : '—'
                  }
                  sub={
                    insights.busiestDay
                      ? formatHours(insights.busiestDay.hours)
                      : undefined
                  }
                />
                <Kpi
                  icon={<CalendarRange className="h-3.5 w-3.5" />}
                  label="Active days"
                  value={`${insights.activeDays} / 7`}
                />
                <Kpi
                  icon={<CalendarClock className="h-3.5 w-3.5" />}
                  label="Avg / active day"
                  value={formatHours(insights.avgHoursPerActiveDay)}
                />
              </div>

              {/* Per-day load */}
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="mb-3 text-xs font-medium text-muted-foreground">
                  Daily load
                </div>
                <div className="flex items-end justify-between gap-2 h-28">
                  {insights.perDay.map((d, i) => {
                    // Explicit px height: percentage heights don't resolve
                    // against a flex-derived parent height.
                    const barPx =
                      d.hours > 0
                        ? Math.max(8, (d.hours / maxDayHours) * 88)
                        : 3;
                    const isBusiest =
                      insights.busiestDay?.date.getTime() ===
                        d.date.getTime() && d.hours > 0;
                    return (
                      <div
                        key={i}
                        className="flex flex-1 flex-col items-center justify-end gap-1.5"
                        title={`${format(d.date, 'EEE, MMM d')} · ${formatHours(
                          d.hours
                        )} · ${d.count} event${d.count === 1 ? '' : 's'}`}
                      >
                        <div
                          className="w-full rounded-sm transition-all"
                          style={{
                            height: `${barPx}px`,
                            backgroundColor: isBusiest
                              ? 'var(--primary)'
                              : d.hours > 0
                                ? 'color-mix(in oklab, var(--primary) 40%, transparent)'
                                : 'var(--border)',
                          }}
                        />
                        <span
                          className={
                            'text-[10px] ' +
                            (d.isToday
                              ? 'font-semibold text-foreground'
                              : 'text-muted-foreground')
                          }
                        >
                          {d.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Time by calendar */}
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="mb-3 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Layers className="h-3.5 w-3.5" />
                  Time by calendar
                </div>
                <div className="space-y-3">
                  {insights.byCalendar.map((c) => (
                    <div key={c.name} className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 text-foreground">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: c.color }}
                          />
                          {c.name}
                        </span>
                        <span className="text-muted-foreground">
                          {formatHours(c.hours)} · {Math.round(c.pct * 100)}%
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.max(2, c.pct * 100)}%`,
                            backgroundColor: c.color,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {insights.longestEvent && (
                <div className="text-xs text-muted-foreground">
                  Longest block:{' '}
                  <span className="text-foreground">
                    {insights.longestEvent.title}
                  </span>{' '}
                  ({formatHours(insights.longestEvent.hours)})
                </div>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
