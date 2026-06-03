import {
  LayoutDashboard, Briefcase, Users, UsersRound, FileText,
  Webhook, Settings, Calendar, CircleCheck, Clock, MapPin,
  Banknote, Heart, Sun, CalendarOff, TriangleAlert,
  Truck, BarChart3, DatabaseZap,
} from "lucide-react";

export const NAV_ITEMS = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Vacantes", href: "/vacantes", icon: Briefcase },
  { label: "Candidatos", href: "/candidatos", icon: Users },
  { label: "Empleados", href: "/empleados", icon: UsersRound },
  { label: "Documentos", href: "/documentos", icon: FileText },
  { label: "Integraciones", href: "/integraciones", icon: Webhook },
  { label: "Configuración", href: "/configuracion", icon: Settings },
] as const;

export const ROTACION_NAV_ITEMS = [
  { label: "Conductores", href: "/rotacion/conductores", icon: Truck },
  { label: "Rendimiento", href: "/rotacion/rendimiento", icon: BarChart3 },
  { label: "Datos", href: "/rotacion/datos", icon: DatabaseZap },
] as const;

export const PIPELINE_STAGES = [
  { value: "recibido", label: "Recibido", color: "#DBEAFE", textColor: "#2563EB" },
  { value: "en_revision", label: "En Revisión", color: "#FEF3C7", textColor: "#D97706" },
  { value: "validacion_documental", label: "Validación Documental", color: "#E0E7FF", textColor: "#4F46E5" },
  { value: "preseleccionado", label: "Preseleccionado", color: "#D1FAE5", textColor: "#059669" },
  { value: "entrevistado", label: "Entrevistado", color: "#E0E7FF", textColor: "#4F46E5" },
  { value: "en_pruebas", label: "En Pruebas", color: "#FEF3C7", textColor: "#D97706" },
  { value: "aprobado", label: "Aprobado", color: "#D1FAE5", textColor: "#059669" },
  { value: "rechazado", label: "Rechazado", color: "#FEE2E2", textColor: "#EF4444" },
] as const;

export const KANBAN_COLUMNS = [
  { id: "recibido", title: "Recibidos", badgeBg: "#DBEAFE", badgeText: "#2563EB" },
  { id: "en_revision", title: "En Revisión", badgeBg: "#FEF3C7", badgeText: "#D97706" },
  { id: "validacion_documental", title: "Validación Doc.", badgeBg: "#E0E7FF", badgeText: "#4F46E5" },
  { id: "preseleccionado", title: "Preseleccionado", badgeBg: "#D1FAE5", badgeText: "#059669" },
  { id: "entrevistado", title: "Entrevista", badgeBg: "#E0E7FF", badgeText: "#4F46E5" },
  { id: "en_pruebas", title: "En Pruebas", badgeBg: "#FEF3C7", badgeText: "#D97706" },
  { id: "aprobado", title: "Aprobado", badgeBg: "#D1FAE5", badgeText: "#059669" },
] as const;

export const VACANCY_STATUSES = [
  { value: "activa", label: "Activa", bg: "#ECFDF5", color: "#10B981" },
  { value: "borrador", label: "Borrador", bg: "#FFFBEB", color: "#F59E0B" },
  { value: "cerrada", label: "Cerrada", bg: "#FEF2F2", color: "#EF4444" },
  { value: "archivada", label: "Archivada", bg: "#F1F5F9", color: "#64748B" },
] as const;

export const EMPLOYEE_STATUSES = [
  { value: "activo", label: "Activo", bg: "#EEF2FF", color: "#4F46E5" },
  { value: "permiso", label: "Permiso", bg: "#FEF3C7", color: "#D97706" },
  { value: "inactivo", label: "Inactivo", bg: "#F1F5F9", color: "#64748B" },
  { value: "periodo_prueba", label: "Período de Prueba", bg: "#DBEAFE", color: "#2563EB" },
  { value: "retirado", label: "Retirado", bg: "#FEE2E2", color: "#EF4444" },
] as const;

export const DOCUMENT_STATUSES = [
  { value: "pendiente", label: "Pendiente", bg: "#FEF3C7", dotColor: "#F59E0B", textColor: "#92400E" },
  { value: "firmado", label: "Firmado", bg: "#DCFCE7", dotColor: "#10B981", textColor: "#166534" },
  { value: "aprobado", label: "Aprobado", bg: "#DCFCE7", dotColor: "#10B981", textColor: "#166534" },
  { value: "revisado", label: "Vigente", bg: "#DCFCE7", dotColor: "#10B981", textColor: "#166534" },
  { value: "vencido", label: "Vencido", bg: "#FEE2E2", dotColor: "#EF4444", textColor: "#991B1B" },
  { value: "rechazado", label: "Rechazado", bg: "#FEE2E2", dotColor: "#EF4444", textColor: "#991B1B" },
] as const;

export const DOCUMENT_CATEGORIES = [
  { slug: "contrato", label: "Contrato", bg: "#EEF2FF", color: "#4F46E5" },
  { slug: "politica", label: "Política", bg: "#F3E8FF", color: "#7C3AED" },
  { slug: "nomina", label: "Nómina", bg: "#FEF3C7", color: "#92400E" },
  { slug: "vinculacion", label: "Vinculación", bg: "#DBEAFE", color: "#1E40AF" },
  { slug: "hoja-de-vida", label: "Hoja de Vida", bg: "#EEF2FF", color: "#4F46E5" },
  { slug: "documento-identidad", label: "Documento ID", bg: "#DBEAFE", color: "#2563EB" },
  { slug: "certificados", label: "Certificados", bg: "#D1FAE5", color: "#059669" },
  { slug: "otro", label: "Otro", bg: "#F1F5F9", color: "#64748B" },
] as const;

export const USER_ROLES = [
  { value: "admin", label: "Administrador" },
  { value: "rrhh", label: "Recursos Humanos" },
  { value: "reclutador", label: "Reclutador" },
  { value: "coordinador", label: "Coordinador" },
  { value: "consulta", label: "Consulta" },
] as const;
