# DataOps Control Center

**Plataforma Inteligente de Monitoreo de Bases de Datos — Práctica Final**

---

## Stack Tecnológico

| Capa | Tecnología |
|---|---|
| **Backend API** | Python 3.12 + FastAPI + SQLAlchemy async |
| **Frontend** | React 18 + TypeScript + Tailwind CSS + Recharts |
| **BD Principal** | PostgreSQL 16 (primary + replica streaming) |
| **BD Alternativa** | Microsoft SQL Server 2022 |
| **Caché** | Redis 7 (cache-aside pattern) |
| **Monitoreo** | Prometheus + Grafana |
| **Infraestructura** | Docker + Docker Compose |
| **Cloud Backup** | Amazon S3 |
| **Auth** | JWT (python-jose + passlib bcrypt) |

---

## Requisitos Previos

- Docker Desktop 4.x+
- Docker Compose v2.x
- Git

---

## Instalación y Arranque

```bash
# 1. Clonar el repositorio
git clone <repo-url>
cd dataops-control-center

# 2. Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales de AWS, SMTP, etc.

# 3. Levantar toda la plataforma (UN SOLO COMANDO)
docker compose up --build -d

# 4. Ver logs
docker compose logs -f backend
```

### URLs de acceso

| Servicio | URL |
|---|---|
| **Frontend React** | http://localhost:3000 |
| **API FastAPI (Swagger)** | http://localhost:8000/api/docs |
| **Grafana** | http://localhost:3001 (admin / admin123) |
| **Prometheus** | http://localhost:9090 |
| **PostgreSQL Primary** | localhost:5432 |
| **PostgreSQL Replica** | localhost:5433 |
| **SQL Server** | localhost:1433 |
| **Redis** | localhost:6379 |

---

## Módulos Implementados

### Módulo 1 — Registro de Motores
- Formulario de registro para PostgreSQL, SQL Server y Oracle
- Credenciales cifradas en BD (nunca en texto plano, XOR + base64)
- Test de conectividad automático al registrar
- Tabla `CONNECTIONS` con todos los campos requeridos

### Módulo 2 — Health Check Automático
- Job planificado cada **60 segundos** con APScheduler
- Clasificación **Healthy / Warning / Critical** por umbrales configurables
- Métricas reales de PostgreSQL (`pg_stat_database`, `pg_locks`)
- Tabla `DB_METRICS` con captura temporal

### Módulo 3 — Slow Query Analyzer
- Clasificación: Fast (<100ms) · Medium (100–500ms) · Slow (500–2000ms) · Critical (>2000ms)
- Tabla `QUERY_LOG` con plan de ejecución serializado
- Sugerencias automáticas de optimización (índices, reescritura de queries)
- Demo de datos con 8 queries representativas

### Módulo 4 — Concurrencia
- Simulación de **mínimo 100 usuarios concurrentes** con `asyncio.gather`
- Detección automática de deadlocks con resolución automática
- Tabla `TX_LOG` con tipos: SHARED / EXCLUSIVE / DEADLOCK / TIMEOUT
- Estadísticas agregadas de tiempo de espera y distribución de locks

### Módulo 5 — Backup, Recovery y Replicación a la Nube
- **FULL**: copia completa programada
- **DIFF**: cambios desde el último FULL (con referencia a `parent_id`)
- **INC**: cadena FULL → DIFF → INC demostrada
- **Snapshots**: PRE_DEPLOY, PRE_TEST, PRE_IMPORT
- Simulación de desastre (DROP TABLE) y restauración con medición de RPO/RTO
- Upload automático a **Amazon S3** con verificación MD5 + SHA256
- Política de retención configurable (`BACKUP_RETENTION_DAYS`)
- Dashboard SLA con RPO objetivo = 15 min, RTO objetivo = 45 min

### Módulo 6 — Replicación Distribuida
- Arquitectura Primary → Replica con streaming WAL (PostgreSQL)
- Medición de lag en 3 escenarios: Normal (2s) · Medio (5s) · Alto (20s)
- Tabla `REPLICATION_STATUS` con lag en tiempo real
- **Análisis del Teorema CAP** documentado en `/api/replication/cap-analysis`:
  - Arquitectura: CP (Consistency + Partition Tolerance)
  - Escrituras en primario, lecturas en réplica
  - Justificación de decisiones de diseño

### Módulo 7 — Caché con Redis
- Patrón cache-aside implementado (`cached_query()`)
- Distinción cache **HIT** (~40ms) vs cache **MISS** (~400ms) con medición real
- Tabla `CACHE_METRICS` con log completo de aciertos
- Invalidación por TTL y manual por patrón de clave
- Hit ratio visible en dashboard

### Módulo 8 — Business Intelligence (Dashboard)
- Vista de rendimiento temporal (CPU, memoria, conexiones por motor)
- Disponibilidad por BD con objetivo del 99.9%
- Top 10 queries lentas con sugerencias de optimización
- Estado de backups y cumplimiento de SLA
- Heatmap de actividad por hora/día de semana

### Módulo 9 — Motor de Alertas
- Reglas configurables **sin redespliegue** (almacenadas en `ALERT_RULES`)
- Reglas mínimas preconfiguradas:
  - CPU > 85% → email (Warning)
  - Deadlocks > 3 → dashboard (Critical)
  - Backup fallido → alarma roja + email (Critical)
  - Lag replicación > 10s → dashboard (Warning)
  - Disco > 90% → email + alerta visual (Critical)
  - Conexiones > umbral → dashboard (Warning)
- Tabla `ALERT_LOG` con timestamp, condición, motor afectado y estado de resolución
- Envío de emails via SMTP (configurable en `.env`)

---

## Estructura del Proyecto

```
dataops-control-center/
├── docker-compose.yml          # Orquestación completa (1 comando)
├── .env.example                # Variables de entorno
│
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py             # FastAPI app entry point
│       ├── core/
│       │   ├── config.py       # Pydantic Settings
│       │   ├── security.py     # JWT + cifrado de credenciales
│       │   └── scheduler.py    # APScheduler jobs
│       ├── db/
│       │   └── database.py     # SQLAlchemy async (primary + replica)
│       ├── models/
│       │   └── models.py       # Todos los modelos ORM
│       ├── schemas/
│       │   └── schemas.py      # Pydantic request/response schemas
│       ├── api/routes/
│       │   ├── auth.py         # JWT login/register
│       │   ├── connections.py  # Módulo 1
│       │   ├── metrics.py      # Módulo 2
│       │   ├── queries.py      # Módulo 3
│       │   ├── transactions.py # Módulo 4
│       │   ├── backup.py       # Módulo 5
│       │   ├── replication.py  # Módulo 6
│       │   ├── cache.py        # Módulo 7
│       │   ├── dashboard.py    # Módulo 8
│       │   └── alerts.py       # Módulo 9
│       └── services/
│           ├── monitoring/health_check.py
│           ├── backup/backup_service.py
│           ├── cache/redis_service.py
│           ├── replication/replication_service.py
│           └── alerts/alert_engine.py
│
├── frontend/
│   ├── Dockerfile
│   ├── src/
│   │   ├── App.tsx
│   │   ├── pages/              # Una página por módulo
│   │   ├── components/
│   │   └── services/api.ts     # Todas las llamadas a la API
│
└── monitoring/
    ├── prometheus/prometheus.yml
    └── grafana/
        ├── dashboards/dataops.json
        └── provisioning/
```

---

## Decisiones de Diseño y Arquitectura

### Separación de capas
La plataforma sigue el patrón de capas definido en el documento:
- **Presentación** (React): se comunica únicamente con el Backend API via REST
- **API** (FastAPI): centraliza toda la lógica de orquestación
- **Datos** (PostgreSQL / SQL Server): accedidos únicamente por la capa API
- **Servicios auxiliares** (Redis, Prometheus, Grafana): operan de forma asíncrona

### Seguridad de credenciales
Las credenciales de conexión nunca se almacenan en texto plano. Se utiliza cifrado XOR + Base64 con la `SECRET_KEY` del sistema. En producción, reemplazar con AES-256 + KMS.

### Consistencia vs Disponibilidad (CAP)
La arquitectura primary-replica elige **CP** (Consistency + Partition Tolerance). Las escrituras van al primario garantizando consistencia; el lag asíncrono es aceptable para las consultas de monitoreo de la réplica.

### Análisis RPO / RTO
- **RPO objetivo**: 15 minutos (garantizado con backups incrementales cada ~15 min)
- **RTO objetivo**: 45 minutos (restauración simulada en segundos para archivos pequeños)
- En producción con volúmenes reales, el RTO depende del tamaño del backup y el ancho de banda hacia S3

---

## Comandos Útiles

```bash
# Ver estado de todos los servicios
docker compose ps

# Ejecutar health check manualmente
curl http://localhost:8000/api/health

# Seed de queries demo (Módulo 3)
curl -X POST http://localhost:8000/api/queries/seed-demo

# Simular 200 usuarios concurrentes (Módulo 4)
curl -X POST "http://localhost:8000/api/transactions/simulate?db_id=1&num_users=200"

# Crear backup FULL (Módulo 5)
curl -X POST "http://localhost:8000/api/backup/run?db_id=1&backup_type=FULL"

# Ver análisis CAP (Módulo 6)
curl http://localhost:8000/api/replication/cap-analysis

# Test cache HIT/MISS (Módulo 7)
curl http://localhost:8000/api/cache/demo-query  # 1ra vez: MISS ~400ms
curl http://localhost:8000/api/cache/demo-query  # 2da vez: HIT ~40ms

# Detener toda la plataforma
docker compose down

# Detener y borrar volúmenes (reset total)
docker compose down -v
```

---

## Defensa Oral — Puntos Clave

1. **¿Por qué FastAPI?** Async nativo, tipado con Pydantic, Swagger automático, rendimiento comparable a Node.js
2. **¿Cómo se protegen las credenciales?** Cifrado antes de persistir, nunca en logs ni en respuestas de API
3. **¿Qué es el Teorema CAP y cómo aplica aquí?** CP: primario garantiza consistencia, réplica acepta eventual consistency
4. **¿Cómo funciona el cache-aside?** Busca en Redis → si no está, consulta BD → guarda en Redis con TTL
5. **¿Qué pasa si el backup falla?** El Alert Engine detecta el `BackupStatus.FAILED` y dispara Critical alert + email
6. **¿Cómo se agregan nuevas reglas de alerta sin redespliegue?** Las reglas están en la tabla `ALERT_RULES`, modificables via API en tiempo real
