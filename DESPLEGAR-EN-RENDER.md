# Apex Foundry v9 Online — publicar en la nube con Render

Este paquete está preparado para alojar la web y su servidor de conexión en Render, sin instalar el `.bat` en ningún PC. El anfitrión de la carrera **sigue siendo el navegador del jugador**: debe permanecer conectado y mantener la pestaña activa.

## Paso 1. Crear un repositorio en GitHub

1. Crea una cuenta en <https://github.com/> o inicia sesión.
2. Abre <https://github.com/new>, escribe `apex-foundry-online` y crea el repositorio. Puedes elegir **Private**.
3. Descomprime este ZIP. Dentro de la carpeta `Apex-Foundry-v9-Cloud` están `server.js`, `index.html`, `render.yaml`, `package.json`, `src/`, `data/`, `tracks/` y los demás archivos.
4. En tu nuevo repositorio de GitHub selecciona **Add file → Upload files** y arrastra **todo el contenido de esa carpeta**, incluidos los directorios, NO el archivo ZIP. Así, `server.js` y `package.json` deben quedar en la raíz del repositorio (no dentro de una subcarpeta adicional).
5. Selecciona **Commit changes**.

## Paso 2. Desplegar en Render

1. Crea una cuenta o inicia sesión en <https://dashboard.render.com/>.
2. Pulsa **New → Web Service**.
3. Conecta tu cuenta de GitHub, selecciona el repositorio `apex-foundry-online` y continúa.
4. En la configuración selecciona:

   - **Language / Runtime:** `Node`.
   - **Build Command:** `npm install`.
   - **Start Command:** `npm start`.
   - **Instance Type / Plan:** `Free` (para pruebas).
   - **Root Directory:** déjalo vacío.

5. Selecciona **Create Web Service**. Render instalará Node y ejecutará `server.js`. También puedes usar el menú **New → Blueprint** para aprovechar el archivo `render.yaml` del repositorio, si prefieres esa modalidad.
6. Cuando el servicio muestre **Live**, abre el enlace HTTPS que te proporciona Render. El dominio será similar a `https://apex-foundry-online-xxxx.onrender.com/` (el valor exacto lo asigna Render).

## Paso 3. Crear la partida

1. **Todos** (host e invitados) abren la **misma URL HTTPS de Render** en sus navegadores.
2. Uno de ellos pulsa **ONLINE MULTIPLAYER → CREATE HOSTED ROOM**.
3. Comparte el enlace de invitación de esa sala o su código de 6 caracteres.
4. Los invitados entran en la sala y el host inicia la carrera.

**Nadie ejecuta un `.bat`, instala Node ni configura puertos en su router.** No hace falta abrir `Apex-Foundry-Online.html` localmente para participar online.

## Lo que debes saber

- **Este servidor es un enlace entre navegadores**. Las físicas de carrera siguen ejecutándose en el navegador del anfitrión; si cierra la pestaña, la carrera acaba para todos.
- El servidor solo admite una instancia: no habilites escalado a varias instancias porque los códigos de sala se guardan en memoria.
- Las salas se pierden si el servicio se reinicia o se vuelve a desplegar; no hay persistencia ni reconexión en mitad de una carrera.
- El plan gratuito de Render puede dormirse después de **15 minutos sin tráfico entrante**. La primera visita tras un periodo inactivo puede tardar aproximadamente un minuto en activar el servicio. Las conexiones WebSocket con mensajes entrantes cuentan como actividad. Render puede reiniciar los servicios Free ocasionalmente.
- Los límites y precios dependen de las condiciones vigentes de Render. Para jugar sin interrupciones y evitar el inicio en frío, considera un plan de pago.
- Si aparece un error de WebSocket, comprueba que **todos** han abierto la URL `https://...onrender.com/` (no `file://`, `localhost` ni un HTML descargado).
- La URL de Render es accesible públicamente. Usa códigos de sala privados y no incluyas datos personales o contraseñas en el código.

Referencias:
- <https://render.com/docs/web-services>
- <https://render.com/docs/free>
- <https://render.com/docs/blueprint-spec>
- <https://docs.github.com/es/repositories/working-with-files/managing-files/adding-a-file-to-a-repository>
