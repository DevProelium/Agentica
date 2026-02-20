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
| `OPENAI_API_KEY` | API Key de OpenAI | — |
| `ADMIN_USERNAME` | Usuario admin por defecto | `admin` |
| `ADMIN_PASSWORD` | Contraseña admin por defecto | `admin123` |

## API Endpoints

| Método | Ruta | Descripción | Auth |
|--------|------|-------------|------|
| `GET` | `/health` | Health check | No |
| `POST` | `/api/auth/login` | Obtener JWT | No |
| `POST` | `/api/auth/register` | Registrar usuario | No |
| `GET` | `/api/inventory` | Listar productos | ✅ |
| `POST` | `/api/inventory/upload` | Importar CSV | ✅ |
| `GET` | `/api/inventory/:id` | Obtener producto | ✅ |
| `PUT` | `/api/inventory/:id` | Actualizar producto | ✅ |
| `DELETE` | `/api/inventory/:id` | Eliminar producto | ✅ |
| `POST` | `/api/chat/chat` | Chat con asistente IA | ✅ |
| `GET` | `/api/chat/search` | Búsqueda semántica | ✅ |

Documentación interactiva completa: http://localhost:3000/api-docs

## Estructura del Proyecto

```
Agentica/
├── docker-compose.yml       # Orquestación de servicios
├── Dockerfile               # Imagen del API
├── swagger.yaml             # Especificación OpenAPI 3.0
├── smoke-test.js            # Pruebas básicas de humo
├── .env.example             # Plantilla de variables de entorno
├── docker/
│   └── init.sql             # Esquema inicial de la base de datos
├── server/
│   ├── app.js               # Punto de entrada Express
│   ├── package.json
│   ├── models/
│   │   └── db.js            # Pool de conexiones PostgreSQL
│   ├── controllers/
│   │   ├── inventoryController.js
│   │   └── chatController.js
│   ├── services/
│   │   ├── inventoryService.js  # CSV processing + vector search
│   │   ├── aiService.js         # OpenAI embeddings + chat
│   │   ├── minioService.js      # File storage
│   │   └── webhookService.js    # Webhook notifications
│   ├── routes/
│   │   ├── inventory.routes.js
│   │   ├── chat.routes.js
│   │   └── auth.routes.js
│   └── middleware/
│       └── authMiddleware.js    # JWT verification
├── client/
│   ├── index.html           # PWA principal
│   ├── manifest.json        # Web App Manifest
│   ├── sw.js                # Service Worker
│   ├── css/
│   │   └── styles.css       # Tema industrial oscuro
│   └── js/
│       ├── db.js            # IndexedDB (Dexie wrapper)
│       ├── sync.js          # Background sync
│       ├── wizard.js        # Wizard de importación CSV
│       ├── dashboard.js     # Dashboard de inventario
│       └── chat-ui.js       # Interfaz de chat IA
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
