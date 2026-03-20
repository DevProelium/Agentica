# 🗺️ Agentica: Mapa Situacional y Roadmap hacia un ERP

**Documento Vivo de Arquitectura e Innovación**
Este documento sirve como faro estratégico y mapa de contexto para el desarrollo de Agentica. Define las áreas de oportunidad arquitectónicas necesarias para evolucionar de un sistema POS/Inventario a un ERP completo capaz de competir con gigantes de la industria (como Odoo), aprovechando nuestras fortalezas tecnológicas únicas.

---

## 🚀 1. Estado Actual vs. Ventajas Competitivas (Nuestro "Edge")

Agentica nace con una base moderna que los ERP tradicionales intentan "parchar" a posteriori:
* **AI-Native (Nacimos con IA):** Uso de `pgvector` y embeddings. Nos permite tener asistentes que toman decisiones informadas, extraen datos de PDFs, auto-completan reportes (ej. Sicar) y analizan tendencias.
* **PWA y Offline-First Real:** Sincronización transparente con `Dexie.js` e `IndexedDB`. Funciona en entornos hostiles sin internet (almacenes lejanos, rutas de venta, caídas de red) sin bloquear la operación.
* **Ligereza Relámpago:** Construido sobre Node.js/Express y Vanilla JS (sin frameworks pesados de frontend ni renderizado acoplado lento). El tiempo de carga y despliegue es inmediato vía Docker.

---

## 🧩 2. Áreas de Oportunidad (El Camino hacia el "Mata-Odoo")

Para competir en las "Grandes Ligas" del software empresarial, la arquitectura debe incorporar los siguientes pilares:

### A. Arquitectura Pragmática de Dominio (No "Plugin Hell")
* **Filosofía Base ("Anti-Odoo"):** Agentica RECHAZA el modelo sobrecargado de "miles de plugins para cada tontería". No queremos un marketplace inflado tipo Prestashop ni la fricción cognitiva de Opus. Apostamos por **Sistemas de Dominio Listos para Usar y Ocultables**.
* **Solución Arquitectónica:** En lugar de "instalar" plugins (que rompen dependencias y pesan), TODO el código del ERP (Ventas, Mantenimiento Industrial, Retail) viene incluido en el Core. Sin embargo, a través de Perfiles de Tenant (Ej. Perfil "Papelería POS" vs "Mantenimiento Industrial B2B"), el sistema simplemente **oculta o muestra** flujos en la interfaz de usuario. Es un solo motor ultra-optimizado, pero la IA y la interfaz se adaptan al pragmatismo de la industria del cliente. Todo está conectado desde el día cero, sin "comprar puentes de integración".

### B. El "Heartbeat" Financiero: Accounting Engine
* **Brecha:** No hay concepto de partida doble (Double-entry ledger).
* **Solución:** Diseñar un libro diario inmutable. Toda acción de negocio (compra, venta, merma) debe disparar un evento asíncrono que cree un asiento contable automático.

### C. Sistema WMS (Warehouse Management) Avanzado
* **Brecha:** Inventario simple por sucursal.
* **Solución:** Soporte para Lotes, Números de Serie, Múltiples ubicaciones dentro de un almacén (pasillos/estantes) y separación de *Modelos de Producto* vs *Variantes*.

### D. Motores de Flujo (State Machines) y Roles (RBAC)
* **Brecha:** Estados de documentos harcodeados y permisos binarios (`admin` / `user`).
* **Solución:** Motor de flujos de aprobación (Borrador -> Aprobado -> Completado) y Row-Level Security / Permisos granulares de usuario.

### E. Capa de Abstracción de Facturación
* **Brecha:** Ventas sin timbrado oficial local.
* **Solución:** Patrón 'Adapter' para conectarse a PACs de México (CFDI 4.0), AFIP (Arg), o DIAN (Col) sin alterar el núcleo de Agentica.

### F. Motor de UI Dinámica y Reportes
* **Brecha:** Generación manual de cada pantalla HTML.
* **Solución:** Motor JSON-to-UI para que el backend renderice vistas Kanban, Listas y Formularios automáticamente. Motor robusto de generación de PDFs.

---

## 🎯 3. Plan de Ejecución (Roadmap Estratégico)

Hemos priorizado el mapa técnico para maximizar la entrega de valor sin romper lo que ya funciona:

- [ ] **Pase 1: CRM & Ventas B2B (Cotizaciones y Pedidos)** 👈 *(Fase Actual)*
- [ ] **Pase 2: Motor de Documentos (PDF) y Permisos Extendidos**
- [ ] **Pase 3: Contabilidad Base (Ledger Inmutable)**
- [ ] **Pase 4: Refactor hacia Sistema Modular (Core vs Plugins)**

---

## 🔍 DEEP DIVE: Pase 1 - CRM & Ventas B2B

**Objetivo:** Permitir ciclo comercial completo más allá del "mostrador de caja rápida" (POS). Necesitamos gestionar cuentas de clientes, oportunidades, y levantar pedidos institucionales.

**Entidades a crear / modificar:**
1. `clientes` (Customers): Más allá del nombre, necesitamos Razón Social, RFC/Tax ID, Días de crédito, Vendedor asignado.
2. `prospectos` (Leads/Oportunidades): Canal de entrada antes de ser cliente oficial. Embudo simple (Kanban).
3. `cotizaciones` (Quotes): Listado de productos propuestos con validez de fecha. No reserva inventario.
4. `pedidos_venta` (Sales Orders): Al confirmar una cotización. Reserva inventario (`committed`) e inicia proceso de envío o facturación.

**Impacto Arquitectónico:**
* Deberemos crear el archivo SQL `migrate_crm_sales.sql`.
* Nuevas rutas en el backend: `/api/crm` y `/api/sales/orders`.
* Pantallas PWA: "Directorio de Clientes", "Cotizaciones", interactuando con el offline mode.
* Integración IA: El asistente debe poder analizar el historial de un cliente y sugerir re-órdenes.