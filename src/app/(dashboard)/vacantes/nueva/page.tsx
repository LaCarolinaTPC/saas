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

interface Department {
  id: string;
  name: string;
}

export default function NuevaVacantePage() {
  const router = useRouter();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

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
                <Label htmlFor="department_id">Departamento</Label>
                <Select name="department_id" required>
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
