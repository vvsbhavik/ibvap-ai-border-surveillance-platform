# IBVAP Disaster Recovery, Backup & Restore Procedures

This document outlines the standard operational procedures (SOP) for mission-critical data backup, disaster recovery, and evidence vault replication for the Intelligent Border Video Analytics Platform (IBVAP).

---

## 1. PostgreSQL Database Backup & Restore

### A. Manual / Scheduled Database Backup

To export a consistent, transactionally safe snapshot of the primary PostgreSQL database (`ibvap_core`):

```bash
# Set credentials (server-side environment)
export PGUSER="ibvap_admin"
export PGDATABASE="ibvap_core"
export PGHOST="localhost" # or container service name "postgres"
export PGPASSWORD="your_secure_db_password"

# Timestamped compressed custom-format dump (recommended)
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
pg_dump -h $PGHOST -U $PGUSER -d $PGDATABASE -F c -b -v -f "./backups/ibvap_core_${TIMESTAMP}.dump"
```

### B. PostgreSQL Database Restoration

To restore from a previously verified dump:

```bash
# Terminate existing active connections to prevent lock contention
psql -h $PGHOST -U $PGUSER -d postgres -c "
SELECT pg_terminate_backend(pid) 
FROM pg_stat_activity 
WHERE datname = 'ibvap_core' AND pid <> pg_backend_pid();"

# Restore using pg_restore with clean recreation
pg_restore -h $PGHOST -U $PGUSER -d ibvap_core --clean --if-exists -v "./backups/ibvap_core_TARGET.dump"
```

---

## 2. Evidence Vault File Storage Backup

The Evidence Vault stores cryptographic snapshots and media under `./storage/evidence/`.

### A. Evidence Archive Creation with Bit-Level Hash Manifest

```bash
# 1. Create compressed tarball of the evidence directory
tar -czvf "./backups/ibvap_evidence_${TIMESTAMP}.tar.gz" -C "./storage" evidence

# 2. Compute SHA-256 integrity checksum of the archive itself
sha256sum "./backups/ibvap_evidence_${TIMESTAMP}.tar.gz" > "./backups/ibvap_evidence_${TIMESTAMP}.tar.gz.sha256"
```

### B. Evidence Vault Restoration

```bash
# 1. Verify archive checksum before decompression
sha256sum -c "./backups/ibvap_evidence_${TIMESTAMP}.tar.gz.sha256"

# 2. Extract files into the storage directory
tar -xzvf "./backups/ibvap_evidence_${TIMESTAMP}.tar.gz" -C "./storage"
```

---

## 3. Disaster Recovery Readiness Checklist

| Component | Target Recovery Time (RTO) | Target Recovery Point (RPO) | Verification Tool |
|---|---|---|---|
| PostgreSQL Core | < 15 minutes | < 1 hour | `npm run test` & `/health/ready` |
| Evidence Vault | < 30 minutes | 0 (Immutable files) | `evidenceVault.verifyIntegrity()` |
| Redis Cache | < 1 minute | Transient state rebuild | In-memory auto-fallback |
| Video Gateway | < 2 minutes | Live stream reconnect | MediaMTX heartbeat probe |

*Note: Automated cron backups should be configured on the host infrastructure or Cloud Run scheduled jobs. The application itself provides atomic verification tools and does not claim automated external tape/S3 backup without explicit cloud provider configuration.*
