# STEG Instagram V3 — Postiz v2.25.3

Conector **independiente** de Instagram para **Meta Unified Login / Facebook Login for Business**. No cambia los proveedores `instagram` ni `instagram-standalone` y no requiere asociar la cuenta de Instagram a una página de Facebook.

## Alcance

- OAuth mediante el **`config_id`** de Meta (no `scope`), con `state` validado por Postiz.
- Intercambio del código por **System-user access token** (SUAT) y selección explícita/verificada de cuenta profesional.
- Reutilización del motor de publicación de `InstagramProvider`: imágenes, carruseles, vídeos, comprobación de contenedores y protección ante repeticiones tras un fallo.
- Conector independiente `instagram-v3`, incluido en Add Channel y en el editor de publicaciones.
- Sin migraciones de base de datos.

**Límites / validación pendiente:** No se ha probado el flujo contra las credenciales reales del STEG ni una publicación real en Meta. El descubrimiento mediante Business Portfolio puede depender de permisos adicionales; se recomienda fijar la ID de Instagram. No se implementan mensajes directos, webhooks ni renovación automática del SUAT. La interfaz heredada muestra algunas opciones (como audio de Reels) que no están disponibles en este flujo. Las estadísticas también requieren validación. El conector está pensado para publicar en una cuenta controlada por el STEG.

## Aplicar (desde un clon LIMPIO de v2.25.3)

```bash
git clone --branch v2.25.3 --depth 1 https://github.com/gitroomhq/postiz-app.git postiz-steg
cd postiz-steg
git switch -c steg/instagram-v3
git apply --check ../postiz-instagram-v3-v2.25.3.patch
git apply ../postiz-instagram-v3-v2.25.3.patch
bash steg-instagram-v3/prepare-icon.sh
bash steg-instagram-v3/test.sh
```

Alternativamente, coloca el parche dentro del clon y usa `git apply postiz-instagram-v3-v2.25.3.patch`.

## Meta Developers

En **Instagram API → API setup with Unified login** usa la configuración `General / SUAT / Never`, que contenga la cuenta profesional del STEG y, como mínimo, `instagram_basic` e `instagram_content_publish`.

**Registra esta URL exacta** (además de la anterior, no es necesario eliminarla):

```
https://social.steg.gal/integrations/social/instagram-v3
```

No copies tokens ni secretos en Git. Las claves son de la **aplicación de Meta**, no de Instagram Login heredado.

## Variables del contenedor Postiz

```yaml
INSTAGRAM_V3_APP_ID: "${INSTAGRAM_V3_APP_ID}"
INSTAGRAM_V3_APP_SECRET: "${INSTAGRAM_V3_APP_SECRET}"
INSTAGRAM_V3_CONFIG_ID: "${INSTAGRAM_V3_CONFIG_ID}"
INSTAGRAM_V3_ACCOUNT_ID: "${INSTAGRAM_V3_ACCOUNT_ID}"
# Opcional en lugar de ACCOUNT_ID, siempre que Meta permita la consulta de activos:
# INSTAGRAM_V3_BUSINESS_ID: "${INSTAGRAM_V3_BUSINESS_ID}"
```

Para localizar la ID de Instagram, consulta **Configuración de Meta Business → Cuentas → Cuentas de Instagram → cuenta del STEG**. Debe ser el identificador numérico del activo Instagram, no el identificador de la aplicación ni del Business Portfolio. El conector **comprueba el acceso** a esa ID antes de guardar el canal.

## Construcción y despliegue en `ourizo`

Dentro del clon, con el icono preparado y el parche aplicado:

```bash
docker build -f Dockerfile.dev -t postiz-steg:2.25.3-instagram-v3 .
```

En Portainer → Stacks → `postiz`, cambia **solo** la imagen del servicio `postiz` por:

```yaml
image: postiz-steg:2.25.3-instagram-v3
```

Añade las cuatro variables mostradas arriba y sus valores desde Portainer. Mantén todos los montajes `/srv/postiz`, la red, PostgreSQL, Redis y Temporal **sin cambios**. No pulses opciones de «eliminar volúmenes». Antes de cambiar la imagen, respalda PostgreSQL y `/srv/postiz`.

Cuando termine de arrancar, entra en **Add Channel → Instagram V3 (Unified Login)**. Se abrirá el diálogo de Meta para autorizar el Business Portfolio. Si funciona, realiza primero una publicación con una imagen JPEG pública a través de Postiz.

## Retroceso

En Portainer vuelve a la imagen original `ghcr.io/gitroomhq/postiz-app:v2.25.3` y retira las variables `INSTAGRAM_V3_*`. Las conexiones X y Telegram continúan en la misma base de datos. **No publiques mediante `instagram-v3` cuando utilices una imagen que no incluye ese proveedor**, pues los trabajos programados para ese identificador no podrán ejecutarse.

## Nota de mantenimiento

Postiz se distribuye con licencia **AGPL-3.0**. Conserva el código fuente de las modificaciones y cumple las obligaciones aplicables a la prestación del servicio. Reaplica y valida el parche en cada actualización de Postiz; no usar contra `latest` sin revisión.
