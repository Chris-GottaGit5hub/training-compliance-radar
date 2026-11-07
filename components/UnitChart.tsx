import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { UnitSummary } from "@/lib/engine";

const MAX_BARS = 15;
const ROW_HEIGHT = 30;
const ACCENT = "#6366f1";
const ACCENT_SELECTED = "#3730a3";

const shorten = (name: string): string => (name.length > 24 ? `${name.slice(0, 23)}…` : name);

export function UnitChart({
  units,
  selectedUnit,
  onSelect,
}: {
  units: UnitSummary[];
  selectedUnit: string | null;
  onSelect: (unit: string) => void;
}) {
  const data = units.slice(0, MAX_BARS);
  const height = data.length * ROW_HEIGHT + 50;
  const top = data[0];

  return (
    <figure>
      <figcaption className="mb-2 text-sm text-slate-600">
        At-risk employees by unit
        {units.length > MAX_BARS && ` (top ${MAX_BARS} of ${units.length})`}. Click a bar to open
        that unit.
      </figcaption>
      <div
        role="img"
        aria-label={
          top
            ? `Bar chart of at-risk employees by unit. Highest: ${top.unit} with ${top.atRisk}. The table below has all values.`
            : "Bar chart of at-risk employees by unit"
        }
      >
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
            <YAxis
              type="category"
              dataKey="unit"
              width={150}
              tick={{ fontSize: 12 }}
              tickFormatter={shorten}
              interval={0}
            />
            <Tooltip
              cursor={{ fill: "#f1f5f9" }}
              formatter={(value) => [value, "At risk"]}
            />
            <Bar
              dataKey="atRisk"
              radius={[0, 4, 4, 0]}
              className="cursor-pointer"
              onClick={(_, index) => onSelect(data[index].unit)}
            >
              {data.map((u) => (
                <Cell key={u.unit} fill={u.unit === selectedUnit ? ACCENT_SELECTED : ACCENT} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
