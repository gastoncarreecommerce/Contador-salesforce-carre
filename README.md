# ⏱ Countdown Timer para Emails — SFMC

Servicio que genera **GIFs animados de countdown** para usar en emails de Salesforce Marketing Cloud (o cualquier email HTML).

## Cómo funciona

1. El servicio recibe una URL con la fecha objetivo como parámetro
2. Genera un GIF animado con el countdown en tiempo real
3. Cada vez que el email se abre, el GIF se regenera con el tiempo actual
4. Cuando expira, muestra un mensaje configurable

## Deploy en Vercel

```bash
# 1. Cloná el repo
git clone https://github.com/TU_USER/countdown-timer-email.git
cd countdown-timer-email

# 2. Instalá dependencias
npm install

# 3. Instalá Vercel CLI (si no la tenés)
npm i -g vercel

# 4. Deploy
vercel --prod
```

## Uso en emails

### HTML directo
```html
<img src="https://TU-DOMINIO.vercel.app/countdown?date=2026-05-17T23:59:00&tz=-3" 
     width="600" height="200" 
     alt="Countdown Timer" 
     style="display:block; max-width:100%;" />
```

### AMPscript (SFMC)
```
%%[
SET @targetDate = "2026-05-17T23:59:00"
SET @baseUrl = "https://TU-DOMINIO.vercel.app/countdown"
SET @imgUrl = CONCAT(@baseUrl, "?date=", @targetDate, "&tz=-3&bg=004E9A&fg=FFFFFF&accent=FFD700&w=600&h=200")
]%%
<img src="%%=v(@imgUrl)=%%" width="600" height="200" alt="Countdown" style="display:block;" />
```

### Con fecha dinámica por suscriptor (SFMC)
```
%%[
SET @targetDate = AttributeValue("FechaVencimiento")
SET @baseUrl = "https://TU-DOMINIO.vercel.app/countdown"
SET @imgUrl = CONCAT(@baseUrl, "?date=", @targetDate, "&tz=-3")
]%%
<img src="%%=v(@imgUrl)=%%" width="600" height="200" alt="Countdown" />
```

## Parámetros

| Param    | Default           | Descripción                          |
|----------|-------------------|--------------------------------------|
| `date`   | (requerido)       | Fecha objetivo ISO: `2026-05-17T23:59:00` |
| `tz`     | `-3`              | Offset UTC en horas                  |
| `bg`     | `004E9A`          | Color de fondo (hex sin #)           |
| `fg`     | `FFFFFF`          | Color de texto (hex sin #)           |
| `accent` | `FFD700`          | Color de labels (hex sin #)          |
| `w`      | `600`             | Ancho en px                          |
| `h`      | `200`             | Alto en px                           |
| `frames` | `30`              | Frames del GIF (max 60)             |
| `label`  | `¡TERMINA EN!`    | Texto superior                       |
| `expired`| `¡TIEMPO AGOTADO!`| Mensaje cuando expira               |
| `font`   | `Arial Black`     | Familia tipográfica                  |

## Configurador visual

Abrí la raíz del deploy (`https://TU-DOMINIO.vercel.app/`) para acceder al configurador visual donde podés ajustar colores, textos y previsualizar el GIF antes de copiarte el código.

## Ejemplo Hot Sale

```
/countdown?date=2026-05-17T23:59:00&tz=-3&bg=E31837&fg=FFFFFF&accent=FFD700&label=HOT SALE TERMINA EN&expired=¡HOT SALE FINALIZÓ!
```

## Notas técnicas

- El GIF se genera **en cada request** (server-side), así que siempre muestra el tiempo real restante al momento de abrir el email
- `Cache-Control: no-cache` para que los email clients no cacheen la imagen
- Usa `canvas` y `gif-encoder-2` de Node.js
- Funciona en Vercel Serverless Functions (Node.js runtime)
- El GIF pesa aprox. 200-400kb dependiendo de las dimensiones

## Limitaciones

- Algunos email clients cachean imágenes agresivamente (Outlook desktop, por ejemplo). En esos casos el countdown puede quedar "congelado" en el momento de la primera apertura
- Gmail cachea imágenes en su proxy; el countdown se actualiza cada vez que el usuario abre el email pero puede tener un delay
- Para emails de alto volumen, considerá agregar un CDN o cache layer con TTL corto (ej: 60 segundos)
