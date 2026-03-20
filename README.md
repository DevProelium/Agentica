# Agentica Inventory

Sistema inteligente de gestión de inventarios offline-first con búsqueda semántica por IA.

```
┌─────────────────────────────────────────────────────────────┐
│                    AGENTICA INVENTORY                       │
│                                                             │
│  ┌──────────┐    ┌──────────┐    ┌──────────────────────┐  │
│  │  Cliente │    │  API     │    │  Servicios            │  │
│  │  PWA     │◄──►│  Express │◄──►│                      │  │
│  │          │    │  :3000   │    │  ┌──────────────────┐ │  │
│  │  Vanilla │    │          │    │  │ PostgreSQL 16    │ │  │
│  │  JS      │    │  Routes  │    │  │ + pgvector       │ │  │
│  │  Dexie   │    │  /auth   │    │  └──────────────────┘ │  │
│  │  IndexDB │    │  /inv.   │    │  ┌──────────────────┐ │  │
│  │  SW      │    │  /chat   │    │  │ MinIO            │ │  │
│  └──────────┘    └──────────┘    │  │ (Object Storage) │ │  │
│                                  │  └──────────────────┘ │  │
│                                  │  ┌──────────────────┐ │  │
│                                  │  │ OpenAI           │ │  │
│                                  │  │ embeddings+chat  │ │  │
│                                  │  └──────────────────┘ │  │
│                                  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Stack Tecnológico

| Capa | Tecnología |
|------|-----------|
| Frontend | Vanilla JS PWA (offline-first, IndexedDB via Dexie) |
| Backend | Node.js + Express |
| Base de datos | PostgreSQL 16 + pgvector (búsqueda semántica) |
| Almacenamiento | MinIO (S3-compatible) |
| IA | OpenAI text-embedding-3-small + GPT-4o-mini |
| Infraestructura | Docker Compose |

## Características

- 📦 **Gestión de inventario** con importación CSV (formato Shopify)
- 🔍 **Búsqueda semántica** vectorial usando embeddings de OpenAI
- 🤖 **Asistente IA** para consultas en lenguaje natural
- 📱 **PWA offline-first** con Service Worker y sincronización en background
- 🔐 **Autenticación JWT** con bcrypt
- 📊 **Dashboard** con métricas en tiempo real

## Setup Rápido

### Prerrequisitos

- Docker y Docker Compose
- Node.js 20+ (solo para desarrollo local)

### 1. Clonar y configurar

```bash
git clone <repo>
cd Agentica

# Copiar variables de entorno
cp .env.example .env

# Editar .env con tus credenciales de OpenAI
nano .env
```

### 2. Levantar con Docker

```bash
docker compose up --build
```

Servicios disponibles:
- API: http://localhost:3000
- Swagger UI: http://localhost:3000/api-docs
- MinIO Console: http://localhost:9001

### 3. Instalar dependencias (desarrollo local)

```bash
cd server && npm install
```

### 4. Ejecutar smoke tests

```bash
# Con el servidor corriendo
node smoke-test.js
```

## Variables de Entorno

| Variable | Descripción | Default |
|----------|-------------|---------|
| `POSTGRES_HOST` | Host de PostgreSQL | `db` |
| `POSTGRES_USER` | Usuario de PostgreSQL | `agentica` |
| `POSTGRES_PASSWORD` | Contraseña de PostgreSQL | — |
| `POSTGRES_DB` | Nombre de la base de datos | `agentica_inventory` |
| `MINIO_ENDPOINT` | Host de MinIO | `storage` |
| `MINIO_ROOT_USER` | Usuario admin de MinIO | — |
| `MINIO_ROOT_PASSWORD` | Contraseña admin de MinIO | — |
| `MINIO_BUCKET` | Nombre del bucket | `inventory-assets` |
| `JWT_SECRET` | Secreto para firmar JWT | — |
| **Chat (DeepSeek)** | | |
| `OPENAI_BASE_URL` | Base URL para chat (DeepSeek) | `https://api.deepseek.com` |
| `OPENAI_API_KEY` | API Key de DeepSeek | — |
| `AI_MODEL_CHAT` | Modelo de chat | `deepseek-chat` |
| **Embeddings (DashScope)** | | |
| `EMBEDDING_BASE_URL` | Endpoint de DashScope (vía MuleRouter) | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` |
| `EMBEDDING_API_KEY` | API Key de MuleRouter | — |
| `EMBEDDING_MODEL` | Modelo de embeddings | `text-embedding-v3` |
| **Autenticación** | | |
| `ADMIN_USERNAME` | Usuario admin por defecto | `admin` |
| `ADMIN_PASSWORD` | Contraseña admin por defecto | `admin123` |

## API Endpoints

| Método | Ruta | Descripción | Auth |
|--------|------|-------------|------|
| `GET` | `/health` | Health check | No |
| `POST` | `/api/auth/login` | Obtener JWT | No |
| `POST` | `/api/auth/register` | Registrar usuario | No |
| **Inventario** | | | |
| `GET` | `/api/inventory` | Listar productos | ✅ |
| `POST` | `/api/inventory/upload` | Importar CSV | ✅ |
| `GET` | `/api/inventory/:id` | Obtener producto | ✅ |
| `PUT` | `/api/inventory/:id` | Actualizar producto | ✅ |
| `DELETE` | `/api/inventory/:id` | Eliminar producto | ✅ |
| **IA / Búsqueda** | | | |
| `POST` | `/api/chat/chat` | Chat con asistente IA | ✅ |
| `GET` | `/api/chat/search` | Búsqueda semántica | ✅ |
| **Ventas (POS)** | | | |
| `POST` | `/api/sales/checkout` | Procesar venta (descuenta stock) | ✅ |
| `POST` | `/api/sales/sessions/open` | Abrir sesión de caja | ✅ |
| `POST` | `/api/sales/sessions/close` | Cerrar sesión de caja | ✅ |
| `GET` | `/api/sales/sessions/active` | Obtener sesión activa | ✅ |
| `POST` | `/api/sales/sync` | Sincronizar ventas offline | ✅ |

Documentación interactiva completa: http://localhost:3000/api-docs

## Estructura del Proyecto

```
Agentica/
├── docker-compose.yml       # Orquestación de servicios
├── Dockerfile               # Imagen del API
├── swagger.yaml             # Especificación OpenAPI 3.0
├── smoke-test.js            # Pruebas básicas de humo
├── .env.example             # Plantilla de variables de entorno
├── start-agentica.ps1       # Script de inicio (PowerShell)
├── docker/
│   └── init.sql             # Esquema inicial de la base de datos (incluye POS)
├── server/
│   ├── app.js               # Punto de entrada Express (incluye rutas POS)
│   ├── package.json
│   ├── models/
│   │   └── db.js            # Pool de conexiones PostgreSQL
│   ├── controllers/
│   │   ├── inventoryController.js
│   │   ├── chatController.js
│   │   └── salesController.js      # Controlador de ventas POS
│   ├── services/
│   │   ├── inventoryService.js     # CSV processing + vector search
│   │   ├── aiService.js            # OpenAI embeddings + chat (cloud‑first)
│   │   ├── minioService.js         # File storage
│   │   ├── webhookService.js       # Webhook notifications
│   │   └── salesService.js         # Lógica de ventas, caja, sync offline
│   ├── routes/
│   │   ├── inventory.routes.js
│   │   ├── chat.routes.js
│   │   ├── auth.routes.js
│   │   └── sales.routes.js         # Rutas POS (/api/sales/*)
│   └── middleware/
│       └── authMiddleware.js       # JWT verification
├── client/
│   ├── index.html           # PWA principal (gestión de inventario)
│   ├── pos.html             # Terminal de ventas (POS)
│   ├── manifest.json        # Web App Manifest
│   ├── sw.js                # Service Worker
│   ├── css/
│   │   ├── styles.css       # Tema industrial oscuro
│   │   └── pos.css          # Estilos específicos del POS
│   └── js/
│       ├── db.js            # IndexedDB (Dexie wrapper) v2 con offlineSales
│       ├── sync.js          # Background sync
│       ├── wizard.js        # Wizard de importación CSV
│       ├── dashboard.js     # Dashboard de inventario
│       ├── chat-ui.js       # Interfaz de chat IA
│       └── pos.js           # Lógica completa del POS (ventas offline/online)
└── shared/
    └── constants.js         # Constantes compartidas
```

## Importación de CSV (Formato Shopify)

El sistema acepta exportaciones de inventario de Shopify. Columnas mapeadas:

- `Handle` → handle del producto
- `Title` → título
- `Variant SKU` → SKU único (clave de upsert)
- `Variant Price` → precio
- `Location` → ubicación
- `Available`, `On hand`, `Committed`, `Unavailable`, `Incoming` → campos de stock

## Desarrollo

```bash
# Hot-reload con Docker
docker compose up api

# O sin Docker
cd server && npm run dev
```

## Seguridad

- Consultas SQL parametrizadas (sin riesgo de inyección SQL)
- Validación de formato UUID antes de queries por ID
- JWT con expiración de 8 horas
- Contraseñas hasheadas con bcrypt (coste 12)
- Helmet.js para headers de seguridad HTTP
- Límite de tamaño de archivo en multer (50 MB)
- Solo archivos `.csv` permitidos en upload

## Módulo POS (Point of Sale)

Agentica Inventory incluye un **terminal de ventas profesional (POS)** con las siguientes características:

- **Interfaz optimizada para velocidad**: Teclado numérico en pantalla, búsqueda híbrida (local IndexedDB + API remota).
- **Atomicidad garantizada**: Procedimiento almacenado `process_sale` que descuenta stock automáticamente en una transacción.
- **Persistencia offline**: Las ventas se guardan en IndexedDB (Dexie) y se sincronizan al recuperar conexión.
- **Cálculos precisos**: IVA (16%), descuentos, totales con precisión decimal.
- **Manejo de caja**: Apertura/cierre de sesiones con montos inicial/final.
- **Integración con Agentica Reports**: Función `consumeFromReport` para descontar stock desde inspecciones (método de pago `maintenance`).

### Tablas de base de datos POS
- `cash_sessions`: Sesiones de caja (apertura/cierre).
- `sales`: Encabezados de venta.
- `sale_items`: Detalle de items vendidos.
- `offline_sales`: Ventas pendientes de sincronización.

### Endpoints POS
| Método | Ruta | Descripción | Auth |
|--------|------|-------------|------|
| `POST` | `/api/sales/checkout` | Procesar venta (descuenta stock) | ✅ |
| `POST` | `/api/sales/sessions/open` | Abrir sesión de caja | ✅ |
| `POST` | `/api/sales/sessions/close` | Cerrar sesión de caja | ✅ |
| `GET`  | `/api/sales/sessions/active` | Obtener sesión activa | ✅ |
| `POST` | `/api/sales/sync` | Sincronizar ventas offline | ✅ |

### Acceso al POS
- **URL**: `http://localhost:8081/pos.html`
- **Credenciales por defecto**: `admin` / `admin123`

## Configuración de embeddings en la nube

Agentica Inventory usa **Qwen text‑embedding‑v3 (DashScope)** via MuleRouter para embeddings semánticos (1536 dimensiones). Configuración en `.env`:

| Variable | Descripción | Valor por defecto |
|----------|-------------|-------------------|
| `EMBEDDING_BASE_URL` | Endpoint de DashScope | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` |
| `EMBEDDING_API_KEY` | API Key de MuleRouter | — |
| `EMBEDDING_MODEL` | Modelo de embeddings | `text-embedding-v3` |

**Nota**: Ollama local está deshabilitado en producción porque los clientes finales (PC/tablet/celular) no pueden ejecutar modelos locales. La suite es **cloud‑first**.

## Scripts de automatización

### `start‑agentica.ps1` (PowerShell)
Levanta todos los contenedores y verifica que la API esté saludable:

```powershell
# Ejecutar como administrador (si es necesario)
.\start-agentica.ps1
```

### Comandos manuales
```bash
# Reinicio completo
docker-compose down
docker-compose up -d

# Ver logs
docker-compose logs -f api

# Estado de contenedores
docker-compose ps
```

## Reinicio automático de contenedores

Los servicios están configurados con `restart: unless-stopped` en `docker‑compose.yml`. Esto significa:

1. Si Docker se reinicia, los contenedores se levantarán automáticamente.
2. Si un contenedor falla, Docker intentará reiniciarlo.

**Para que Docker Desktop inicie con Windows**:
1. Abre Docker Desktop.
2. Ve a **Settings → General**.
3. Marca **"Start Docker Desktop when you log in"**.

## Próximos pasos (GPU local)

La suite está diseñada para migrar a **GPU local** cuando el servidor con 12‑24 VRAM esté disponible:

1. Cambiar `EMBEDDING_BASE_URL` al endpoint local (ej: `http://192.168.1.100:8080/v1`).
2. Cambiar `EMBEDDING_MODEL` al modelo local (ej: `mxbai‑embed‑large`).
3. Amaterasu residirá permanentemente en la GPU, eliminando costos de API.

## Sinergia con Agentica Reports

La función `consumeFromReport(reportId, items)` permite que un técnico de campo descuente stock directamente desde un folio de inspección, marcando la salida como **"Mantenimiento"**. Esto integra el flujo:

1. **Agentica Reports** → Inspección detecta equipo dañado.
2. **Agentica Inventory** → Descuenta repuesto usado (método `maintenance`).
3. **Agentica POS** → Factura repuestos nuevos al cliente.

**Tres productos, una base de datos, un flujo de valor.**
