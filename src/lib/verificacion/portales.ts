/**
 * Consultas ciudadanas gratuitas de cada fuente, para revisarla a mano cuando
 * Croma no responde. Las usan «Lo revisé a mano» en la ficha y la barra de
 * estado de los servicios (26-nov-2026).
 */
export const PORTALES_FUENTE: Record<string, string> = {
  policia: "https://antecedentes.policia.gov.co:7005/WebJudicial/",
  procuraduria: "https://www.procuraduria.gov.co/Pages/Consulta-de-Antecedentes.aspx",
  contraloria: "https://www.contraloria.gov.co/web/guest/persona-natural",
  rnmc: "https://srvcnpc.policia.gov.co/PSC/frm_cnp_consulta.aspx",
  simit: "https://www.fcm.org.co/simit/#/home-public",
  runt: "https://www.runt.gov.co/actores/ciudadano/consulta-por-tipo-de-documento",
};
