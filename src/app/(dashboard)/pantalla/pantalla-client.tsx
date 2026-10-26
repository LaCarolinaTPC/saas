"use client";

import { useState } from "react";
import { Images, Presentation, Tv } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { DispositivoFila, MedioBiblioteca, PresentacionResumen } from "@/lib/pantalla/consultas";
import { PresentacionesClient } from "./presentaciones-client";
import { PantallasClient } from "./pantallas-client";
import { MediosClient } from "./medios-client";

export function PantallaClient({
  tabInicial,
  presentaciones,
  dispositivos,
  medios,
  urlDisplay,
}: {
  tabInicial: "presentaciones" | "pantallas" | "medios";
  presentaciones: PresentacionResumen[];
  dispositivos: DispositivoFila[];
  medios: MedioBiblioteca[];
  urlDisplay: string;
}) {
  const [tab, setTab] = useState<string>(tabInicial);
  const activos = dispositivos.filter((d) => d.estado !== "revocada").length;
  return (
    <Tabs
      value={tab}
      onValueChange={(v) => {
        setTab(String(v));
        const url = new URL(window.location.href);
        url.searchParams.set("tab", String(v));
        window.history.replaceState(null, "", url.pathname + url.search);
      }}
    >
      <TabsList className="mb-4 h-10">
        <TabsTrigger value="presentaciones" className="px-4">
          <Presentation /> Presentaciones <span className="text-xs text-muted-foreground">{presentaciones.length}</span>
        </TabsTrigger>
        <TabsTrigger value="pantallas" className="px-4">
          <Tv /> Televisores <span className="text-xs text-muted-foreground">{activos}</span>
        </TabsTrigger>
        <TabsTrigger value="medios" className="px-4">
          <Images /> Imágenes y videos <span className="text-xs text-muted-foreground">{medios.length}</span>
        </TabsTrigger>
      </TabsList>
      <TabsContent value="presentaciones">
        <PresentacionesClient presentaciones={presentaciones} />
      </TabsContent>
      <TabsContent value="pantallas">
        <PantallasClient dispositivos={dispositivos} presentaciones={presentaciones} urlDisplay={urlDisplay} />
      </TabsContent>
      <TabsContent value="medios">
        <MediosClient medios={medios} />
      </TabsContent>
    </Tabs>
  );
}
