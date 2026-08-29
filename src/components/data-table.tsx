import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type Column<T> = {
  key: string;
  label: string;
  /** Plain text used for sorting, filtering and search. */
  value: (row: T) => string;
  render?: (row: T) => ReactNode;
  /** Show a dropdown with the distinct values of this column. */
  filterable?: boolean;
  /** Sort chronologically instead of alphabetically. */
  sortAsDate?: boolean;
};

const ALL = "__all__";

export function DataTable<T>({
  columns,
  rows,
  isPending,
  emptyMessage,
  searchPlaceholder = "Search…",
  onRowClick,
  rowClassName,
}: {
  columns: Column<T>[];
  rows: T[] | undefined;
  isPending?: boolean;
  emptyMessage: string;
  searchPlaceholder?: string;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string | undefined;
}) {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const data = rows ?? [];

  const options = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const col of columns) {
      if (!col.filterable) continue;
      map[col.key] = Array.from(new Set(data.map((r) => col.value(r) || "—"))).sort((a, b) =>
        a.localeCompare(b),
      );
    }
    return map;
  }, [columns, data]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = data.filter((row) => {
      for (const col of columns) {
        const active = filters[col.key];
        if (active && active !== ALL && (col.value(row) || "—") !== active) return false;
      }
      if (!q) return true;
      return columns.some((col) => col.value(row).toLowerCase().includes(q));
    });

    if (sortKey) {
      const col = columns.find((c) => c.key === sortKey);
      if (col) {
        out = [...out].sort((a, b) => {
          const av = col.value(a);
          const bv = col.value(b);
          let cmp: number;
          if (col.sortAsDate) {
            const at = av ? new Date(av).getTime() : Number.NaN;
            const bt = bv ? new Date(bv).getTime() : Number.NaN;
            const aa = Number.isNaN(at) ? -Infinity : at;
            const bb = Number.isNaN(bt) ? -Infinity : bt;
            cmp = aa - bb;
          } else {
            cmp = av.localeCompare(bv, undefined, { numeric: true });
          }
          return sortDir === "asc" ? cmp : -cmp;
        });
      }
    }
    return out;
  }, [columns, data, filters, query, sortDir, sortKey]);

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const hasFilters =
    query.trim().length > 0 || Object.values(filters).some((v) => v && v !== ALL);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="pl-9"
          />
        </div>
        {columns
          .filter((c) => c.filterable)
          .map((col) => (
            <Select
              key={col.key}
              value={filters[col.key] ?? ALL}
              onValueChange={(v) => setFilters((f) => ({ ...f, [col.key]: v }))}
            >
              <SelectTrigger className="w-44">
                <SelectValue placeholder={col.label} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All {col.label.toLowerCase()}</SelectItem>
                {(options[col.key] ?? []).map((opt) => (
                  <SelectItem key={opt} value={opt}>
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ))}
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setQuery("");
              setFilters({});
            }}
          >
            <X className="size-4" /> Clear
          </Button>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => {
                const active = sortKey === col.key;
                const Icon = active ? (sortDir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
                return (
                  <TableHead key={col.key}>
                    <button
                      type="button"
                      onClick={() => toggleSort(col.key)}
                      className="flex items-center gap-1.5 font-medium hover:text-foreground"
                      aria-label={`Sort by ${col.label}`}
                    >
                      {col.label}
                      <Icon className={cn("size-3.5", active ? "opacity-100" : "opacity-40")} />
                    </button>
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending && (
              <TableRow>
                <TableCell colSpan={columns.length}>
                  <Skeleton className="h-4 w-40" />
                </TableCell>
              </TableRow>
            )}
            {!isPending && visible.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="py-8 text-center text-muted-foreground"
                >
                  {data.length === 0 ? emptyMessage : "No rows match the current filters."}
                </TableCell>
              </TableRow>
            )}
            {visible.map((row, i) => (
              <TableRow
                key={i}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(onRowClick && "cursor-pointer", rowClassName?.(row))}
              >
                {columns.map((col) => (
                  <TableCell key={col.key}>
                    {col.render ? col.render(row) : col.value(row) || "—"}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {!isPending && data.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Showing {visible.length} of {data.length}
        </p>
      )}
    </div>
  );
}
