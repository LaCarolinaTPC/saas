/**
 * Fuentes de la pantalla informativa cargadas con `next/font/google` (se
 * sirven desde la propia app, sin pedirle nada a Google desde el TV).
 *
 * Solo lo importan componentes. Cada loader debe ser una constante a nivel de
 * módulo con opciones literales. Las fuentes que no son variables exigen
 * `weight`. `preload: false` para no inyectar siete precargas en cada página:
 * se descargan solo donde se aplica `claseFuentes`.
 *
 * Las claves y variables CSS viven en `fuentes-catalogo.ts` (parte pura).
 */

import { Bebas_Neue, Lato, Montserrat, Noto_Color_Emoji, Oswald, Playfair_Display, Poppins, Roboto } from "next/font/google";

const roboto = Roboto({ subsets: ["latin"], variable: "--font-pantalla-roboto", display: "swap", preload: false });
const montserrat = Montserrat({ subsets: ["latin"], variable: "--font-pantalla-montserrat", display: "swap", preload: false });
const oswald = Oswald({ subsets: ["latin"], variable: "--font-pantalla-oswald", display: "swap", preload: false });
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-pantalla-playfair", display: "swap", preload: false });
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  variable: "--font-pantalla-poppins",
  display: "swap",
  preload: false,
});
const lato = Lato({
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  variable: "--font-pantalla-lato",
  display: "swap",
  preload: false,
});
const bebas = Bebas_Neue({ subsets: ["latin"], weight: "400", variable: "--font-pantalla-bebas", display: "swap", preload: false });

// Emoticonos a color servidos por la app: iguales en cualquier TV. El archivo
// viene partido por rangos Unicode y el navegador solo baja los que se usan.
const emoji = Noto_Color_Emoji({ subsets: ["emoji"], weight: "400", variable: "--font-pantalla-emoji", display: "swap", preload: false });

/** Clase que declara las variables CSS de todas las fuentes. Va en el contenedor del lienzo. */
export const claseFuentes = [roboto, montserrat, oswald, playfair, poppins, lato, bebas, emoji].map((f) => f.variable).join(" ");
