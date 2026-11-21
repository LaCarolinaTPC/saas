/**
 * Política de tratamiento de datos personales de los aspirantes (Ley 1581 de
 * 2012 y Decreto 1377 de 2013, compilado en el Decreto 1074 de 2015). La
 * publica la página /politica-de-datos y la enlaza la autorización que pide el
 * asistente (A4). Los datos del responsable son ajustes de Selección; si uno
 * está vacío, se omite (nunca se muestra un hueco ni «undefined»).
 *
 * El texto debe revisarlo el área jurídica de la empresa antes de usarlo en
 * producción.
 */
import type { AjusteSeleccion } from "./ajustes";

export interface DatosPolitica {
  razonSocial: string;
  nit: string;
  domicilio: string;
  correo: string;
  telefono: string;
  vigencia: string;
}

export interface SeccionPolitica {
  titulo: string;
  parrafos: string[];
  lista?: string[];
}

const valor = (ajustes: Pick<AjusteSeleccion, "clave" | "valor">[], clave: string) => {
  const v = ajustes.find((a) => a.clave === clave)?.valor;
  return typeof v === "string" ? v.trim() : "";
};

export function datosPolitica(ajustes: Pick<AjusteSeleccion, "clave" | "valor">[]): DatosPolitica {
  return {
    razonSocial: valor(ajustes, "empresa_razon_social") || "Metropolitana de Transportes La Carolina",
    nit: valor(ajustes, "empresa_nit"),
    domicilio: valor(ajustes, "empresa_domicilio"),
    correo: valor(ajustes, "empresa_correo_datos"),
    telefono: valor(ajustes, "empresa_telefono_datos"),
    vigencia: valor(ajustes, "politica_vigencia"),
  };
}

/** Canales para consultas y reclamos: siempre el WhatsApp de selección, más los configurados. */
export function canalesPolitica(d: DatosPolitica): string[] {
  return [
    d.correo ? `Correo electrónico: ${d.correo}` : "",
    d.telefono ? `Teléfono: ${d.telefono}` : "",
    "El mismo número de WhatsApp por el que se postuló, escribiendo «consulta de datos personales» o «reclamo de datos personales».",
    d.domicilio ? `Por escrito, en ${d.domicilio}, dirigido al área de Gestión Humana.` : "",
  ].filter(Boolean);
}

export function seccionesPolitica(d: DatosPolitica): SeccionPolitica[] {
  const responsable = [d.razonSocial, d.nit ? `NIT ${d.nit}` : "", d.domicilio ? `domicilio en ${d.domicilio}` : ""].filter(Boolean).join(", ");
  return [
    {
      titulo: "1. Responsable del tratamiento",
      parrafos: [
        `${responsable} (en adelante, «la empresa») es responsable del tratamiento de los datos personales de quienes participan en sus procesos de selección. El área encargada de atender consultas y reclamos es Gestión Humana.`,
      ],
      lista: canalesPolitica(d),
    },
    {
      titulo: "2. A quién aplica",
      parrafos: [
        "Esta política aplica a los datos de las personas que se postulan a un cargo en la empresa, en especial al de conductor, y que entregan su información por WhatsApp, por formularios, en su hoja de vida o durante las etapas del proceso de selección.",
      ],
    },
    {
      titulo: "3. Datos que tratamos",
      parrafos: ["Según la etapa del proceso, la empresa puede tratar:"],
      lista: [
        "Datos de identificación: nombre, número de cédula, edad o fecha de nacimiento.",
        "Datos de contacto: número de celular y ciudad de residencia.",
        "Datos del perfil: categoría y vigencia de la licencia de conducción, experiencia, empleos anteriores, hoja de vida, cartas laborales y fotos de la licencia y de la cédula.",
        "Resultados de consultas en fuentes públicas: comparendos de tránsito (SIMIT), antecedentes judiciales, Registro Nacional de Medidas Correctivas, antecedentes disciplinarios (Procuraduría) y fiscales (Contraloría).",
        "Resultados de la prueba de manejo y de los exámenes médicos de ingreso.",
        "Los mensajes que intercambia con la empresa por WhatsApp.",
      ],
    },
    {
      titulo: "4. Para qué usamos los datos",
      parrafos: ["Los datos se usan únicamente para:"],
      lista: [
        "Registrar la postulación y verificar que cumple los requisitos del cargo.",
        "Consultar antecedentes y comparendos de tránsito antes de citar a las pruebas.",
        "Comunicarse con el aspirante por WhatsApp o por llamada para citarlo, recordarle sus citas e informarle el avance de su proceso.",
        "Realizar la prueba de manejo, los exámenes médicos de ingreso y, si es seleccionado, la contratación.",
        "Conservar la información para tenerlo en cuenta en futuros procesos de selección de la empresa, aunque no sea contratado en el proceso actual.",
        "Elaborar estadísticas internas del proceso de selección, sin identificar a las personas.",
        "Cumplir las obligaciones legales de la empresa.",
      ],
    },
    {
      titulo: "5. Datos sensibles",
      parrafos: [
        "Los resultados de los exámenes médicos son datos sensibles. Responder preguntas sobre datos sensibles es facultativo. La empresa los usa solo para evaluar la aptitud para el cargo y limita su acceso al personal que lo necesita.",
        "La empresa no trata datos de menores de edad en sus procesos de selección.",
      ],
    },
    {
      titulo: "6. Herramientas tecnológicas y terceros que nos apoyan",
      parrafos: [
        "La empresa usa un asistente automático en WhatsApp, apoyado en inteligencia artificial, para responder preguntas frecuentes y organizar los datos de la postulación. Las decisiones sobre el proceso las toman personas del área de Gestión Humana.",
        "Para prestar el servicio, algunos proveedores tratan datos por cuenta de la empresa (encargados): el servicio de mensajería de WhatsApp, los servicios de alojamiento en la nube, el servicio de inteligencia artificial del asistente y el servicio de consulta de antecedentes y comparendos. Algunos de ellos pueden estar fuera de Colombia. La empresa les exige tratar los datos solo para esas tareas y con medidas de seguridad y confidencialidad.",
        "La empresa no vende ni cede los datos de los aspirantes.",
      ],
    },
    {
      titulo: "7. Derechos de los titulares",
      parrafos: ["Como titular de sus datos, usted puede:"],
      lista: [
        "Conocer, actualizar y rectificar sus datos.",
        "Solicitar prueba de la autorización que otorgó.",
        "Ser informado, previa solicitud, del uso que se ha dado a sus datos.",
        "Presentar quejas ante la Superintendencia de Industria y Comercio por infracciones a la ley, después de haber agotado el trámite de consulta o reclamo ante la empresa.",
        "Revocar la autorización o pedir la supresión de sus datos, cuando no exista un deber legal o contractual de conservarlos.",
        "Acceder gratuitamente a sus datos.",
      ],
    },
    {
      titulo: "8. Cómo presentar consultas y reclamos",
      parrafos: [
        "Las consultas se atienden en un máximo de diez (10) días hábiles desde que se reciben. Si no es posible en ese plazo, se le informará el motivo y la nueva fecha, que no superará cinco (5) días hábiles adicionales.",
        "Los reclamos (para corregir, actualizar o suprimir datos, o por un posible incumplimiento) deben incluir su identificación, la descripción de los hechos, la dirección o el medio para responderle y los documentos que quiera hacer valer. Se atienden en un máximo de quince (15) días hábiles, prorrogables hasta por ocho (8) días hábiles más, informándole el motivo. Si el reclamo está incompleto, se le pedirá completarlo dentro de los cinco (5) días siguientes; si pasan dos (2) meses sin que lo complete, se entenderá que desistió.",
        "Puede usar cualquiera de los canales indicados en el numeral 1.",
      ],
    },
    {
      titulo: "9. Cuánto tiempo conservamos los datos",
      parrafos: [
        "Los datos se conservan durante el proceso de selección y, después, para futuros procesos de la empresa, mientras sigan siendo útiles para esa finalidad o hasta que usted pida su supresión. Si es contratado, sus datos pasan a hacer parte de su historia laboral, que se conserva según la ley.",
      ],
    },
    {
      titulo: "10. Seguridad",
      parrafos: [
        "La empresa aplica medidas técnicas, humanas y administrativas para proteger los datos contra pérdida, consulta, uso o acceso no autorizado. Solo el personal autorizado puede consultarlos, según su función.",
      ],
    },
    {
      titulo: "11. Vigencia y cambios",
      parrafos: [
        d.vigencia ? `Esta política rige desde el ${d.vigencia.replace(/^el\s+/i, "")}.` : "Esta política rige desde su publicación.",
        "Los cambios importantes se informarán por los canales de la empresa antes de aplicarlos. Normas aplicables: Ley 1581 de 2012 y Decreto 1377 de 2013, compilado en el Decreto 1074 de 2015.",
      ],
    },
  ];
}
