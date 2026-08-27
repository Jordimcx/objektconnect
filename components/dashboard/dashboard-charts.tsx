"use client";

import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Fixed-order categorical palette (blue, orange, aqua, yellow, magenta, green),
// validated for colorblind-safe adjacent contrast — see dataviz skill palette.md.
// Beyond 6 slices, extra categories fold into "Weitere" rather than adding hues.
const CATEGORY_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300"];
const OTHER_COLOR = "#94A3B8";
const MAX_SLICES = 6;

type DataPoint = { name: string; value: number };

function foldIntoOther(data: DataPoint[]): DataPoint[] {
  if (data.length <= MAX_SLICES) return data;
  const sorted = [...data].sort((left, right) => right.value - left.value);
  const top = sorted.slice(0, MAX_SLICES - 1);
  const rest = sorted.slice(MAX_SLICES - 1);
  const otherTotal = rest.reduce((sum, entry) => sum + entry.value, 0);
  return [...top, { name: "Weitere", value: otherTotal }];
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name?: string; value?: number | string; color?: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 shadow-card-hover">
      {label ? <p className="text-xs font-semibold text-slate-500">{label}</p> : null}
      {payload.map((entry) => (
        <p key={entry.name} className="flex items-center gap-2 text-sm font-bold text-primary">
          {entry.color ? <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} /> : null}
          {label ? entry.value : entry.name}
          {label ? " Vorgänge" : `: ${entry.value}`}
        </p>
      ))}
    </div>
  );
}

export function DashboardCharts({
  statusData,
  categoryData
}: {
  statusData: Array<{ name: string; value: number }>;
  categoryData: Array<{ name: string; value: number }>;
}) {
  const donutData = foldIntoOther(categoryData);
  const total = donutData.reduce((sum, entry) => sum + entry.value, 0);
  const colorFor = (name: string, index: number) => (name === "Weitere" ? OTHER_COLOR : CATEGORY_COLORS[index % CATEGORY_COLORS.length]);

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Tickets nach Status</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusData} barSize={30}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EEF1F5" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#94A3B8" }} axisLine={{ stroke: "#E2E8F0" }} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#94A3B8" }} axisLine={false} tickLine={false} width={28} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(20,35,60,0.04)" }} />
                <Bar dataKey="value" fill="#18B7A0" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tickets nach Kategorie</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="relative h-72 flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={donutData} dataKey="value" nameKey="name" innerRadius={62} outerRadius={96} paddingAngle={2} stroke="#FFFFFF" strokeWidth={2}>
                    {donutData.map((entry, index) => (
                      <Cell key={entry.name} fill={colorFor(entry.name, index)} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 grid place-items-center">
                <div className="text-center">
                  <p className="text-2xl font-bold tracking-tight text-primary">{total}</p>
                  <p className="text-xs font-semibold text-slate-500">Tickets</p>
                </div>
              </div>
            </div>
            <ul className="flex shrink-0 flex-col gap-2 sm:w-40">
              {donutData.map((entry, index) => (
                <li key={entry.name} className="flex items-center gap-2 text-xs">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: colorFor(entry.name, index) }} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate font-medium text-slate-600">{entry.name}</span>
                  <span className="font-bold text-primary">{entry.value}</span>
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
