"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TopBar } from "@/components/layout/top-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createVacancy } from "@/lib/actions";
import Link from "next/link";
import { Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

interface Department {
  id: string;
  name: string;
}

export default function NuevaVacantePage() {
  const router = useRouter();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [manageDeps, setManageDeps] = useState(false);
  const [newDep, setNewDep] = useState("");
  const [depBusy, setDepBusy] = useState(false);

  async function addDepartment() {
    const name = newDep.trim();
    if (!name) return;
    setDepBusy(true);
    try {
      const res = await fetch("/api/departments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al crear el departamento");
      setDepartments((prev) =>
        prev.some((d) => d.id === data.id)
          ? prev
          : [...prev, data].sort((a, b) => a.name.localeCompare(b.name))
      );
      setNewDep("");
      toast.success(`Departamento creado: ${data.name}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al crear el departamento");
    } finally {
      setDepBusy(false);
    }
  }

  async function deleteDepartment(dept: Department) {
    setDepBusy(true);
    try {
      const res = await fetch("/api/departments", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: dept.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al eliminar");
      setDepartments((prev) => prev.filter((d) => d.id !== dept.id));
      toast.success(`Departamento eliminado: ${dept.name}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al eliminar");
    } finally {
      setDepBusy(false);
    }
  }

  useEffect(() => {
    fetch("/api/departments")
      .then((res) => res.json())
      .then((data) => setDepartments(data))
      .catch(() => setDepartments([]));
  }, []);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await createVacancy(formData);
        router.push("/vacantes");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al crear la vacante");
      }
    });
  }

  return (
    <>
      <TopBar title="Nueva Vacante" />
      <div className="flex flex-1 flex-col gap-6 p-8">
        <form action={handleSubmit} className="mx-auto w-full max-w-3xl rounded-xl border border-[#E2E8F0] bg-white p-8">
          <h2 className="mb-6 text-lg font-semibold text-[#0F172A]">Información de la Vacante</h2>

          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <input type="hidden" name="action" id="form-action" defaultValue="draft" />

          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="title">Título del Cargo</Label>
                <Input
                  id="title"
                  name="title"
                  required
                  placeholder="Ej: Desarrollador Frontend Senior"
                  className="border-[#E2E8F0]"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="department_id">Departamento</Label>
                  <button
                    type="button"
                    onClick={() => setManageDeps((v) => !v)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-[#4F46E5] hover:text-[#4338CA]"
                  >
                    {manageDeps ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                    {manageDeps ? "Cerrar" : "Gestionar"}
                  </button>
                </div>
                <Select
                  name="department_id"
                  required
                  items={Object.fromEntries(departments.map((d) => [d.id, d.name]))}
                >
                  <SelectTrigger className="border-[#E2E8F0]">
                    <SelectValue placeholder="Seleccionar departamento" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((dept) => (
                      <SelectItem key={dept.id} value={dept.id}>
                        {dept.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {manageDeps && (
                  <div className="rounded-lg border border-[#C7D2FE] bg-[#EEF2FF]/40 p-3">
                    <div className="flex items-center gap-2">
                      <Input
                        value={newDep}
                        onChange={(e) => setNewDep(e.target.value)}
                        placeholder="Nuevo departamento"
                        className="h-8 border-[#E2E8F0] bg-white text-sm"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addDepartment();
                          }
                        }}
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={addDepartment}
                        disabled={depBusy || !newDep.trim()}
                        className="h-8 bg-[#4F46E5] hover:bg-[#4338CA]"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                      {departments.map((dept) => (
                        <div
                          key={dept.id}
                          className="flex items-center justify-between rounded bg-white px-2 py-1 text-sm text-gray-700"
                        >
                          <span className="truncate">{dept.name}</span>
                          <button
                            type="button"
                            onClick={() => deleteDepartment(dept)}
                            disabled={depBusy}
                            className="text-gray-400 hover:text-red-500 disabled:opacity-50"
                            title={`Eliminar ${dept.name}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descripción</Label>
              <Textarea
                id="description"
                name="description"
                placeholder="Describe las responsabilidades del cargo..."
                rows={4}
                className="border-[#E2E8F0]"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="requirements">Requisitos</Label>
              <Textarea
                id="requirements"
                name="requirements"
                placeholder="Lista los requisitos del perfil..."
                rows={4}
                className="border-[#E2E8F0]"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="location">Ubicación</Label>
                <Input
                  id="location"
                  name="location"
                  placeholder="Ej: Bogotá, Colombia"
                  className="border-[#E2E8F0]"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="modality">Modalidad</Label>
                <Select name="modality">
                  <SelectTrigger className="border-[#E2E8F0]">
                    <SelectValue placeholder="Seleccionar modalidad" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="presencial">Presencial</SelectItem>
                    <SelectItem value="remoto">Remoto</SelectItem>
                    <SelectItem value="hibrido">Híbrido</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="contract_type">Tipo de Contrato</Label>
                <Select name="contract_type">
                  <SelectTrigger className="border-[#E2E8F0]">
                    <SelectValue placeholder="Seleccionar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="indefinido">Término indefinido</SelectItem>
                    <SelectItem value="fijo">Término fijo</SelectItem>
                    <SelectItem value="obra_labor">Obra o labor</SelectItem>
                    <SelectItem value="prestacion_servicios">Prestación de servicios</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="salary_min">Salario Mínimo (COP)</Label>
                <Input
                  id="salary_min"
                  name="salary_min"
                  type="number"
                  placeholder="3000000"
                  className="border-[#E2E8F0]"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="salary_max">Salario Máximo (COP)</Label>
                <Input
                  id="salary_max"
                  name="salary_max"
                  type="number"
                  placeholder="6000000"
                  className="border-[#E2E8F0]"
                />
              </div>
            </div>
          </div>

          <div className="mt-8 flex items-center justify-end gap-3 border-t border-[#E2E8F0] pt-6">
            <Link href="/vacantes">
              <Button type="button" variant="outline" className="border-[#E2E8F0] text-[#334155]">
                Cancelar
              </Button>
            </Link>
            <Button
              type="submit"
              variant="outline"
              disabled={isPending}
              className="border-[#E2E8F0] text-[#334155]"
              onClick={() => {
                const el = document.getElementById("form-action") as HTMLInputElement;
                if (el) el.value = "draft";
              }}
            >
              {isPending ? "Guardando..." : "Guardar como Borrador"}
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className="bg-[#4F46E5] hover:bg-[#4338CA]"
              onClick={() => {
                const el = document.getElementById("form-action") as HTMLInputElement;
                if (el) el.value = "publish";
              }}
            >
              {isPending ? "Publicando..." : "Publicar Vacante"}
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}
