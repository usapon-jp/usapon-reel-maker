import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import Database from 'better-sqlite3';
import {
  AssetRecordSchema,
  BgmTrackSchema,
  BUILTIN_MOTION_TEMPLATES,
  MotionTemplateSchema,
  ProjectDocumentSchema,
  ReelTemplateSchema,
  RenderJobSchema,
  nowIso,
  type AssetRecord,
  type MotionTemplateV1,
  type ProjectDocumentV1,
  type ReelTemplateV1,
  type RenderJob,
  type BgmTrack,
} from '@usapon-reel/core';
import {getDataPaths} from './paths';

type JsonRow = {id: string; document_json: string};
type AssetRow = {
  id: string;
  kind: string;
  status: string;
  original_name: string;
  mime_type: string;
  size: number;
  checksum: string;
  storage_key: string;
  proxy_storage_key: string | null;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  visible_bounds_json: string | null;
  error: string | null;
  created_at: string;
};

type JobRow = {
  id: string;
  kind: string;
  status: string;
  project_id: string | null;
  payload_json: string;
  snapshot_json: string | null;
  progress: number;
  output_storage_key: string | null;
  thumbnail_storage_key: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

function parseJsonRow<T>(row: JsonRow | undefined, parser: {parse(value: unknown): T}): T | null {
  return row ? parser.parse(JSON.parse(row.document_json)) : null;
}

function assetFromRow(row: AssetRow): AssetRecord {
  return AssetRecordSchema.parse({
    id: row.id,
    kind: row.kind,
    status: row.status,
    originalName: row.original_name,
    mimeType: row.mime_type,
    size: row.size,
    checksum: row.checksum,
    storageKey: row.storage_key,
    proxyStorageKey: row.proxy_storage_key,
    width: row.width,
    height: row.height,
    durationMs: row.duration_ms,
    visibleBounds: row.visible_bounds_json ? JSON.parse(row.visible_bounds_json) : null,
    error: row.error,
    createdAt: row.created_at,
  });
}

function jobFromRow(row: JobRow): RenderJob {
  return RenderJobSchema.parse({
    id: row.id,
    kind: row.kind,
    status: row.status,
    projectId: row.project_id,
    payload: JSON.parse(row.payload_json),
    snapshot: row.snapshot_json ? JSON.parse(row.snapshot_json) : null,
    progress: row.progress,
    outputStorageKey: row.output_storage_key,
    thumbnailStorageKey: row.thumbnail_storage_key,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  });
}

export class LocalDatabase {
  readonly db: Database.Database;

  constructor(databasePath = getDataPaths().database) {
    mkdirSync(dirname(databasePath), {recursive: true});
    this.db = new Database(databasePath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');
    this.migrate();
    this.seedMotionTemplates();
  }

  close(): void {
    this.db.close();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS assets (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        status TEXT NOT NULL,
        original_name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size INTEGER NOT NULL,
        checksum TEXT NOT NULL,
        storage_key TEXT NOT NULL,
        proxy_storage_key TEXT,
        width INTEGER,
        height INTEGER,
        duration_ms INTEGER,
        visible_bounds_json TEXT,
        error TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS assets_checksum_idx ON assets(checksum);
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        document_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS motion_templates (
        id TEXT PRIMARY KEY,
        document_json TEXT NOT NULL,
        builtin INTEGER NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS reel_templates (
        id TEXT PRIMARY KEY,
        document_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS bgm_tracks (
        id TEXT PRIMARY KEY,
        document_json TEXT NOT NULL,
        asset_id TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS render_jobs (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        status TEXT NOT NULL,
        project_id TEXT,
        payload_json TEXT NOT NULL,
        snapshot_json TEXT,
        progress REAL NOT NULL,
        output_storage_key TEXT,
        thumbnail_storage_key TEXT,
        error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS render_jobs_queue_idx ON render_jobs(status, created_at);
      INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (1, '${nowIso()}');
    `);
  }

  private seedMotionTemplates(): void {
    const statement = this.db.prepare(`
      INSERT INTO motion_templates(id, document_json, builtin, updated_at)
      VALUES (?, ?, 1, ?)
      ON CONFLICT(id) DO UPDATE SET document_json = excluded.document_json, updated_at = excluded.updated_at
      WHERE motion_templates.builtin = 1
    `);
    const transaction = this.db.transaction(() => {
      for (const template of BUILTIN_MOTION_TEMPLATES) {
        statement.run(template.id, JSON.stringify(template), template.updatedAt);
      }
    });
    transaction();
  }

  createAsset(asset: AssetRecord): AssetRecord {
    const value = AssetRecordSchema.parse(asset);
    this.db.prepare(`
      INSERT INTO assets(id, kind, status, original_name, mime_type, size, checksum, storage_key,
        proxy_storage_key, width, height, duration_ms, visible_bounds_json, error, created_at)
      VALUES (@id, @kind, @status, @originalName, @mimeType, @size, @checksum, @storageKey,
        @proxyStorageKey, @width, @height, @durationMs, @visibleBounds, @error, @createdAt)
    `).run({...value, visibleBounds: value.visibleBounds ? JSON.stringify(value.visibleBounds) : null});
    return value;
  }

  getAsset(id: string): AssetRecord | null {
    const row = this.db.prepare('SELECT * FROM assets WHERE id = ?').get(id) as AssetRow | undefined;
    return row ? assetFromRow(row) : null;
  }

  listAssets(kind?: AssetRecord['kind']): AssetRecord[] {
    const rows = (kind
      ? this.db.prepare('SELECT * FROM assets WHERE kind = ? ORDER BY created_at DESC').all(kind)
      : this.db.prepare('SELECT * FROM assets ORDER BY created_at DESC').all()) as AssetRow[];
    return rows.map(assetFromRow);
  }

  updateAsset(asset: AssetRecord): AssetRecord {
    const value = AssetRecordSchema.parse(asset);
    this.db.prepare(`
      UPDATE assets SET status=@status, proxy_storage_key=@proxyStorageKey, width=@width, height=@height,
        duration_ms=@durationMs, visible_bounds_json=@visibleBounds, error=@error WHERE id=@id
    `).run({...value, visibleBounds: value.visibleBounds ? JSON.stringify(value.visibleBounds) : null});
    return value;
  }

  createProject(project: ProjectDocumentV1): ProjectDocumentV1 {
    const value = ProjectDocumentSchema.parse(project);
    this.db.prepare('INSERT INTO projects(id, document_json, updated_at) VALUES (?, ?, ?)').run(
      value.id,
      JSON.stringify(value),
      value.updatedAt,
    );
    return value;
  }

  getProject(id: string): ProjectDocumentV1 | null {
    const row = this.db.prepare('SELECT id, document_json FROM projects WHERE id = ?').get(id) as JsonRow | undefined;
    return parseJsonRow(row, ProjectDocumentSchema);
  }

  listProjects(): ProjectDocumentV1[] {
    const rows = this.db.prepare('SELECT id, document_json FROM projects ORDER BY updated_at DESC').all() as JsonRow[];
    return rows.map((row) => ProjectDocumentSchema.parse(JSON.parse(row.document_json)));
  }

  updateProject(project: ProjectDocumentV1): ProjectDocumentV1 {
    const value = ProjectDocumentSchema.parse({...project, updatedAt: nowIso()});
    this.db.prepare(`
      INSERT INTO projects(id, document_json, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET document_json=excluded.document_json, updated_at=excluded.updated_at
    `).run(value.id, JSON.stringify(value), value.updatedAt);
    return value;
  }

  deleteProject(id: string): void {
    this.db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  }

  getMotionTemplate(id: string): MotionTemplateV1 | null {
    const row = this.db.prepare('SELECT id, document_json FROM motion_templates WHERE id = ?').get(id) as JsonRow | undefined;
    return parseJsonRow(row, MotionTemplateSchema);
  }

  listMotionTemplates(): MotionTemplateV1[] {
    const rows = this.db
      .prepare('SELECT id, document_json FROM motion_templates ORDER BY builtin DESC, updated_at DESC')
      .all() as JsonRow[];
    return rows.map((row) => MotionTemplateSchema.parse(JSON.parse(row.document_json)));
  }

  saveMotionTemplate(template: MotionTemplateV1): MotionTemplateV1 {
    const value = MotionTemplateSchema.parse({...template, updatedAt: nowIso()});
    if (value.builtin) throw new Error('初期テンプレートは直接変更できません。複製して編集してください。');
    this.db.prepare(`
      INSERT INTO motion_templates(id, document_json, builtin, updated_at) VALUES (?, ?, 0, ?)
      ON CONFLICT(id) DO UPDATE SET document_json=excluded.document_json, updated_at=excluded.updated_at
    `).run(value.id, JSON.stringify(value), value.updatedAt);
    return value;
  }

  deleteMotionTemplate(id: string): void {
    this.db.prepare('DELETE FROM motion_templates WHERE id = ? AND builtin = 0').run(id);
  }

  getReelTemplate(id: string): ReelTemplateV1 | null {
    const row = this.db.prepare('SELECT id, document_json FROM reel_templates WHERE id = ?').get(id) as JsonRow | undefined;
    return parseJsonRow(row, ReelTemplateSchema);
  }

  listReelTemplates(): ReelTemplateV1[] {
    const rows = this.db.prepare('SELECT id, document_json FROM reel_templates ORDER BY updated_at DESC').all() as JsonRow[];
    return rows.map((row) => ReelTemplateSchema.parse(JSON.parse(row.document_json)));
  }

  saveReelTemplate(template: ReelTemplateV1): ReelTemplateV1 {
    const value = ReelTemplateSchema.parse({...template, updatedAt: nowIso()});
    this.db.prepare(`
      INSERT INTO reel_templates(id, document_json, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET document_json=excluded.document_json, updated_at=excluded.updated_at
    `).run(value.id, JSON.stringify(value), value.updatedAt);
    return value;
  }

  deleteReelTemplate(id: string): void {
    this.db.prepare('DELETE FROM reel_templates WHERE id = ?').run(id);
  }

  getBgm(id: string): BgmTrack | null {
    const row = this.db.prepare('SELECT id, document_json FROM bgm_tracks WHERE id = ?').get(id) as JsonRow | undefined;
    return parseJsonRow(row, BgmTrackSchema);
  }

  listBgm(): BgmTrack[] {
    const rows = this.db.prepare('SELECT id, document_json FROM bgm_tracks ORDER BY updated_at DESC').all() as JsonRow[];
    return rows.map((row) => BgmTrackSchema.parse(JSON.parse(row.document_json)));
  }

  saveBgm(track: BgmTrack): BgmTrack {
    const value = BgmTrackSchema.parse({...track, updatedAt: nowIso()});
    this.db.prepare(`
      INSERT INTO bgm_tracks(id, document_json, asset_id, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET document_json=excluded.document_json, asset_id=excluded.asset_id, updated_at=excluded.updated_at
    `).run(value.id, JSON.stringify(value), value.assetId, value.updatedAt);
    return value;
  }

  enqueue(job: RenderJob): RenderJob {
    const value = RenderJobSchema.parse(job);
    this.db.prepare(`
      INSERT INTO render_jobs(id, kind, status, project_id, payload_json, snapshot_json, progress,
        output_storage_key, thumbnail_storage_key, error, created_at, updated_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      value.id,
      value.kind,
      value.status,
      value.projectId,
      JSON.stringify(value.payload),
      value.snapshot ? JSON.stringify(value.snapshot) : null,
      value.progress,
      value.outputStorageKey,
      value.thumbnailStorageKey,
      value.error,
      value.createdAt,
      value.updatedAt,
      value.completedAt,
    );
    return value;
  }

  claimNext(): RenderJob | null {
    const transaction = this.db.transaction(() => {
      const row = this.db
        .prepare("SELECT * FROM render_jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1")
        .get() as JobRow | undefined;
      if (!row) return null;
      const updatedAt = nowIso();
      const changed = this.db
        .prepare("UPDATE render_jobs SET status = 'processing', updated_at = ? WHERE id = ? AND status = 'queued'")
        .run(updatedAt, row.id);
      if (changed.changes !== 1) return null;
      return jobFromRow({...row, status: 'processing', updated_at: updatedAt});
    });
    return transaction();
  }

  getJob(id: string): RenderJob | null {
    const row = this.db.prepare('SELECT * FROM render_jobs WHERE id = ?').get(id) as JobRow | undefined;
    return row ? jobFromRow(row) : null;
  }

  listJobs(kind?: RenderJob['kind']): RenderJob[] {
    const rows = (kind
      ? this.db.prepare('SELECT * FROM render_jobs WHERE kind = ? ORDER BY created_at DESC').all(kind)
      : this.db.prepare('SELECT * FROM render_jobs ORDER BY created_at DESC').all()) as JobRow[];
    return rows.map(jobFromRow);
  }

  updateJob(job: RenderJob): RenderJob {
    const value = RenderJobSchema.parse({...job, updatedAt: nowIso()});
    this.db.prepare(`
      UPDATE render_jobs SET status=?, payload_json=?, snapshot_json=?, progress=?, output_storage_key=?,
        thumbnail_storage_key=?, error=?, updated_at=?, completed_at=? WHERE id=?
    `).run(
      value.status,
      JSON.stringify(value.payload),
      value.snapshot ? JSON.stringify(value.snapshot) : null,
      value.progress,
      value.outputStorageKey,
      value.thumbnailStorageKey,
      value.error,
      value.updatedAt,
      value.completedAt,
      value.id,
    );
    return value;
  }

  resetInterruptedJobs(): void {
    const now = nowIso();
    this.db
      .prepare("UPDATE render_jobs SET status='failed', error='アプリ再起動のため処理を中断しました。再試行してください。', updated_at=? WHERE status='processing'")
      .run(now);
  }

  deleteRenderJob(id: string): RenderJob | null {
    const existing = this.getJob(id);
    if (!existing || existing.kind !== 'render') return null;
    this.db.prepare('DELETE FROM render_jobs WHERE id = ?').run(id);
    return existing;
  }
}

export function createRepositories(databasePath?: string) {
  const database = new LocalDatabase(databasePath);
  return {
    database,
    assets: {
      create: (value: AssetRecord) => database.createAsset(value),
      get: (id: string) => database.getAsset(id),
      list: (kind?: AssetRecord['kind']) => database.listAssets(kind),
      update: (value: AssetRecord) => database.updateAsset(value),
    },
    projects: {
      create: (value: ProjectDocumentV1) => database.createProject(value),
      get: (id: string) => database.getProject(id),
      list: () => database.listProjects(),
      update: (value: ProjectDocumentV1) => database.updateProject(value),
      delete: (id: string) => database.deleteProject(id),
    },
    motionTemplates: {
      get: (id: string) => database.getMotionTemplate(id),
      list: () => database.listMotionTemplates(),
      save: (value: MotionTemplateV1) => database.saveMotionTemplate(value),
      delete: (id: string) => database.deleteMotionTemplate(id),
    },
    reelTemplates: {
      get: (id: string) => database.getReelTemplate(id),
      list: () => database.listReelTemplates(),
      save: (value: ReelTemplateV1) => database.saveReelTemplate(value),
      delete: (id: string) => database.deleteReelTemplate(id),
    },
    bgm: {
      get: (id: string) => database.getBgm(id),
      list: () => database.listBgm(),
      save: (value: BgmTrack) => database.saveBgm(value),
    },
    jobs: {
      enqueue: (value: RenderJob) => database.enqueue(value),
      claimNext: () => database.claimNext(),
      update: (value: RenderJob) => database.updateJob(value),
      get: (id: string) => database.getJob(id),
      list: (kind?: RenderJob['kind']) => database.listJobs(kind),
    },
  };
}
