"use client";

import { useState } from "react";
import { BibliotecaMedios } from "@/components/pantalla/BibliotecaMedios";
import type { MedioBiblioteca } from "@/lib/pantalla/consultas";

export function MediosClient({ medios: iniciales }: { medios: MedioBiblioteca[] }) {
  const [medios, setMedios] = useState(iniciales);
  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-white p-5">
      <p className="mb-4 max-w-3xl text-sm text-gray-500">
        Imágenes y videos que se pueden poner en las diapositivas. Las imágenes se reducen a 1920 px antes de subir. Para
        video use MP4 con H.264: otros formatos (como el HEVC de algunos celulares) pueden no reproducirse en el TV.
      </p>
      <BibliotecaMedios medios={medios} onCambio={setMedios} gestionar />
    </div>
  );
}
