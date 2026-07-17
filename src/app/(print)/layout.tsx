/** Vistas de impresión: sin sidebar ni chrome del dashboard. */
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-white">{children}</div>;
}
