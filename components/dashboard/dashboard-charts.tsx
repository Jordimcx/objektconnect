"use client";

import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const colors = ["#14233C", "#18B7A0", "#2563EB", "#F97316", "#16A34A", "#DC2626", "#64748B"];

export function DashboardCharts({
  statusData,
  categoryData
}: {
  statusData: Array<{ name: string; value: number }>;
  categoryData: Array<{ name: string; value: number }>;
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
        <h2 className="text-base font-bold text-primary">Tickets nach Status</h2>
        <div className="mt-4 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={statusData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="value" fill="#18B7A0" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
        <h2 className="text-base font-bold text-primary">Tickets nach Kategorie</h2>
        <div className="mt-4 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={categoryData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={92} paddingAngle={2}>
                {categoryData.map((entry, index) => (
                  <Cell key={entry.name} fill={colors[index % colors.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
