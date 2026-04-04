# Keywords at Scale + Semantic Deduplication

**Status:** APPROVED  
**Date:** 2026-04-03  
**Topics:** Pipeline redesign C (CSV import) + D (deduplication)

---

## C. CSV Import with Column Mapping

### UI — Compact dialog in /keywords page

Replaces the existing "Importar CSV" dialog. Single dialog flow:

1. **Upload zone** — drag & drop or click. Accepts `.csv` only (no XLSX — user can export to CSV).
2. **On file upload** — parsed client-side with PapaParse:
   - Preview table (first 5 rows)
   - Dropdown per column: "Keyword", "Prioridad", "Ignorar" (auto-detected from header names)
   - Checkbox "Primera fila es encabezado" (auto-detected)
3. **Deduplication preview** — after column assignment, check against existing keywords:
   - Level 1 (exact): direct match on phrase
   - Level 2 (normalized): strip diacritics + stopwords, compare
   - Badge per row: "Nueva" (green) / "Duplicada" (gray)
   - Counter: "85 nuevas, 15 duplicadas"
4. **Confirm** — POST only new keywords. Banner appears: "85 keywords importadas. ¿Agrupar en clusters?"

### API Changes

**Rewrite `POST /api/upload`:**
- Accept FormData with CSV file + siteId
- Parse server-side, return structured data for preview (not auto-create)
- Response: `{ rows: [{phrase, priority?, ...extra}], headers: string[], detectedMapping: {keyword: idx, priority: idx} }`

**New `POST /api/keywords/check-duplicates`:**
- Input: `{ siteId, phrases: string[] }`
- Output: `{ results: [{phrase, status: "new"|"exact_dup"|"normalized_dup", matchedPhrase?: string}] }`
- Normalization: lowercase, strip diacritics (NFD + replace), remove stopwords, trim

**Existing `POST /api/keywords` (array mode):**
- Already supports bulk creation with `skipDuplicates: true`
- No changes needed

### Client Dependencies

- `papaparse` (~15KB) for CSV parsing — new dependency

---

## D. Semantic Deduplication + Auto-Clustering

### Trigger

After CSV import, banner: "X keywords importadas. ¿Agrupar en clusters?"  
Also available as button in /clusters page: "Auto-agrupar keywords pendientes"

### Flow (POST /api/clusters/auto-group)

1. Fetch keywords for site: `status = pending`, `clusterId = null`
2. Generate embeddings: OpenAI `text-embedding-3-small`, batched (max 100/request)
3. Agglomerative clustering:
   - Cosine similarity, threshold 0.75 to group
   - If cluster > 15 keywords, re-cluster subset at threshold 0.85
4. Detect semantic duplicates: pairs within same cluster with similarity > 0.9
5. Generate cluster names: 1 AI call per cluster (keyword list → descriptive name in Spanish)
6. Save: create ContentCluster records, update keywords with clusterId
7. Response: `{ clusters: [{id, name, keywordCount}], duplicates: [{phrase1, phrase2, similarity}] }`

### Data Model Change

Add `clusterId` to Keyword model (new migration):

```prisma
model Keyword {
  ...existing fields...
  clusterId  String?          @map("cluster_id")
  cluster    ContentCluster?  @relation(fields: [clusterId], references: [id], onDelete: SetNull)
}

model ContentCluster {
  ...existing fields...
  keywords   Keyword[]   // NEW relation
}
```

### Embeddings — In-Memory Only

Embeddings are NOT persisted. Generated on-demand during auto-group, held in memory, discarded after clustering. If persistent vector search is needed later, add pgvector.

Cost: ~$0.0001/keyword. 1000 keywords = $0.10.

### Duplicate Handling UI

After auto-group returns, duplicates shown as warning list:
- Each pair: "keyword A" ↔ "keyword B" (92% similar)
- Button per pair: "Omitir" → sets lower-priority keyword to `status: skipped, skipReason: "Semantic duplicate of: {other}"`
- Button "Omitir todos" for bulk action

### Cluster Size Management

- Minimum: 3 keywords per cluster (smaller groups merged into nearest cluster)
- Target: 5-15 keywords per cluster
- Maximum: 15 (auto-subdivided during grouping)
- Clusters with < 3 keywords after subdivision → merged back

---

## Files Affected

### New Files
- `src/lib/ai/keyword-embeddings.ts` — embedding generation + cosine similarity + clustering algorithm
- `src/app/api/keywords/check-duplicates/route.ts` — dedup endpoint
- `src/app/api/clusters/auto-group/route.ts` — auto-clustering endpoint

### Modified Files
- `prisma/schema.prisma` — add clusterId to Keyword, keywords relation to ContentCluster
- `prisma/seed.ts` or migration — new migration for clusterId
- `src/app/(admin)/keywords/page.tsx` — rewrite import dialog, add post-import banner
- `src/app/(admin)/clusters/page.tsx` — add "Auto-agrupar" button
- `src/app/api/upload/route.ts` — rewrite to return preview data instead of auto-creating
- `package.json` — add `papaparse` dependency

---

## Observable Scenarios

### S1: CSV upload and preview
Given a CSV file with columns "frase", "prioridad", "volumen",  
when uploaded to the import dialog,  
then a preview table shows first 5 rows with dropdowns per column, and "frase" auto-mapped to "Keyword".

### S2: Column auto-detection
Given a CSV where the header contains "keyword" or "phrase" or "frase",  
when parsed,  
then that column is auto-selected as "Keyword" in the dropdown.

### S3: Exact duplicate detection
Given site has keyword "alquiler carro bogota" and CSV contains the same phrase,  
when dedup check runs,  
then that row shows "Duplicada" badge and is excluded from the import count.

### S4: Normalized duplicate detection
Given site has "alquiler carro Bogotá" and CSV contains "alquiler carro bogota" (no accent),  
when dedup check runs,  
then that row shows "Duplicada" badge.

### S5: Import only new keywords
Given 100 CSV rows where 15 are duplicates,  
when user clicks Confirmar,  
then only 85 keywords are created and banner shows "85 keywords importadas. ¿Agrupar en clusters?"

### S6: Auto-clustering groups keywords semantically
Given 50 pending keywords without cluster about car rental topics,  
when auto-group runs,  
then 4-8 clusters are created with 5-15 keywords each, and each cluster has a descriptive Spanish name.

### S7: Semantic duplicate detection
Given keywords "alquiler de carros en bogota" and "renta de autos en bogotá" in the same cluster,  
when auto-group completes,  
then this pair appears in the duplicates list with similarity > 0.9.

### S8: Large cluster subdivision
Given auto-grouping produces a cluster with 20 keywords,  
then it is automatically subdivided into 2 clusters of ~10 each.

### S9: Small cluster merge
Given auto-grouping produces a cluster with only 2 keywords,  
then those keywords are merged into the nearest similar cluster.

### S10: Keyword model has clusterId
Given a keyword assigned to a cluster via auto-group,  
when queried from the API,  
then the keyword has a non-null clusterId matching the assigned cluster.

### S11: Auto-group button in clusters page
Given the clusters page with pending unclustered keywords,  
when user clicks "Auto-agrupar keywords pendientes",  
then the same auto-group flow executes and results appear.

### S12: Skip semantic duplicates
Given a semantic duplicate pair shown after auto-group,  
when user clicks "Omitir",  
then the lower-priority keyword is set to status "skipped" with skipReason.
