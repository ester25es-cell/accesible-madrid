# Accesible Madrid

Juego educativo sobre accesibilidad en el municipio de Madrid.

Eres concejal o concejala de Accesibilidad del Ayuntamiento. En cada barrio, seis vecinos con necesidades distintas quieren ir a la Junta Municipal, al centro de salud, al mercado y a otros sitios. Tienes 30 días y un presupuesto para quitar las barreras que se lo impiden.

## Barrios

| Distrito | Barrio | Escenario |
| --- | --- | --- |
| Centro | Embajadores (Lavapiés) | Lavapiés para todos |
| Arganzuela | Legazpi | El río es de todos |
| Chamberí | Trafalgar | Portales de Chamberí |
| Puente de Vallecas | San Diego | Cuesta arriba en Vallecas |
| Carabanchel | San Isidro | Fiesta en la pradera |

Los mapas están estilizados: los nombres de las calles son reales, pero su colocación está simplificada.

## Cómo se juega

- Cada día, los vecinos intentan ir a sus sitios. Si una barrera les bloquea, te avisan.
- Con tu presupuesto construyes rebajes, rampas, semáforos acústicos, señales con pictogramas, etc.
- **Imprevistos:** algunos días aparecen obras sin desvío, terrazas en la acera, coches sobre los rebajes o patinetes tirados. Si actúas, la multa te devuelve créditos.
- **Créditos:** ingreso semanal, multas, premio cuando un vecino alcanza su autonomía y fondos europeos (una vez por partida). El botón «¿Cómo consigo créditos?» lo explica dentro del juego.
- **Objetivo:** Índice de Autonomía de 70 o más y ningún vecino por debajo de 50.

## Jugar

Abre la página del juego en GitHub Pages:
https://ester25es-cell.github.io/accesible-madrid/

## Instalar en el móvil

Una vez instalado, el juego tiene su propio icono y funciona sin conexión.

- **iPhone o iPad:** abre la página en Safari, pulsa Compartir y elige «Añadir a pantalla de inicio».
- **Android:** abre la página en Chrome y pulsa «Instalar» en el juego, o elige «Instalar aplicación» en el menú de los tres puntos.

## Accesibilidad

- Se juega entero con teclado: Tabulador para cambiar de zona, flechas en el mapa e Intro para seleccionar.
- Hay una lista de tramos en tabla como alternativa al mapa.
- Ofrece texto hasta el 200 %, alto contraste y la opción de reducir el movimiento.
- Los avisos se leen con lector de pantalla.
- Botones «Escuchar» con voz y subtítulos: avisos, vecinos, lugares, resumen del día y Rosa. Opción de lectura automática y de voz lenta.
- Efectos de sonido, cada uno con su aviso visual.
- Los vecinos recorren su camino en el mapa y se paran en la barrera; el movimiento se puede pausar o desactivar.
- El tiempo solo avanza cuando el jugador lo decide.
- El objetivo es cumplir WCAG 2.2 nivel AA.

## Archivos

| Archivo | Qué es |
| --- | --- |
| `index.html` | La página del juego |
| `engine.js` | Las reglas de la simulación |
| `app.js` | La interfaz |
| `sw.js` | Permite jugar sin conexión |
| `manifest.webmanifest` e iconos | Permiten instalarlo como aplicación |
