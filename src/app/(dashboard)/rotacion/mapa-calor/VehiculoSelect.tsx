"use client";

import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import type { VehiculoOpcion } from "@/lib/rotacion/data/mapa-calor";

/**
 * Combobox de vehículo con búsqueda por código o placa: con ~200 opciones el
 * select nativo era impracticable (y no estilizable).
 */
export default function VehiculoSelect({
  vehiculos,
  value,
  onChange,
}: {
  vehiculos: VehiculoOpcion[];
  value: string | null;
  onChange: (codigo: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const actual = value ? vehiculos.find((v) => v.codigo === value) : null;
  const etiqueta = (v: VehiculoOpcion) => `${v.codigo}${v.placa ? ` · ${v.placa}` : ""}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        role="combobox"
        aria-expanded={open}
        className="flex min-w-40 items-center justify-between gap-2 rounded-lg border border-border bg-white px-2.5 py-1.5 text-xs cursor-pointer hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
      >
        <span className={actual ? "text-text-primary font-medium" : "text-text-secondary"}>
          {actual ? etiqueta(actual) : "Todos los vehículos"}
        </span>
        <ChevronsUpDown className="h-3 w-3 shrink-0 text-text-muted" />
      </PopoverTrigger>
      <PopoverContent className="w-60 p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar código o placa…" />
          <CommandList>
            <CommandEmpty>Ningún vehículo coincide.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="todos los vehículos"
                onSelect={() => { onChange(null); setOpen(false); }}
                className="text-xs"
              >
                <Check className={`h-3.5 w-3.5 ${value === null ? "opacity-100" : "opacity-0"}`} />
                Todos los vehículos
              </CommandItem>
              {vehiculos.map((v) => (
                <CommandItem
                  key={v.codigo}
                  value={`${v.codigo} ${v.placa ?? ""}`}
                  onSelect={() => { onChange(v.codigo); setOpen(false); }}
                  className="text-xs"
                >
                  <Check className={`h-3.5 w-3.5 ${value === v.codigo ? "opacity-100" : "opacity-0"}`} />
                  {etiqueta(v)}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
