import Dexie, { type Table } from "dexie";
import { z } from "zod";
import { schemas, type Meta, type Entities, type EntityName } from "./model";
export interface SyncOperation {
  id: string;
  entityType: EntityName;
  entityId: string;
  operation: "upsert" | "delete";
  revision: number;
  queuedAt: string;
  attempts: number;
  lastError?: string;
}
const stores = {
  exercises: "id,updatedAt",
  plans: "id,updatedAt",
  sessions: "id,status,startedAt",
  sets: "id,sessionId,exerciseId",
  wellness: "id,sessionId,dateLocal",
  recommendations: "id,status",
  health: "id,&sourceRecordHash",
  profiles: "id",
  queue: "id,entityId,queuedAt",
};
export class AppDB extends Dexie {
  exercises!: Table<Entities["exercises"]>;
  plans!: Table<Entities["plans"]>;
  sessions!: Table<Entities["sessions"]>;
  sets!: Table<Entities["sets"]>;
  wellness!: Table<Entities["wellness"]>;
  recommendations!: Table<Entities["recommendations"]>;
  health!: Table<Entities["health"]>;
  profiles!: Table<Entities["profiles"]>;
  queue!: Table<SyncOperation>;
  constructor(name: string) {
    super(name);
    this.version(1).stores(stores);
    this.version(2)
      .stores(stores)
      .upgrade(async (tx) => {
        await tx
          .table("sets")
          .toCollection()
          .modify((s) => {
            if (typeof s.rir === "number") s.rir = { min: s.rir, max: s.rir };
            s.schemaVersion = 2;
          });
        for (const key of Object.keys(schemas).filter((k) => k !== "sets"))
          await tx
            .table(key)
            .toCollection()
            .modify((r) => {
              r.schemaVersion = 2;
            });
      });
  }
}
export const db = new AppDB("takin-2ku");
export const demoDb = new AppDB("takin-2ku-demo");
const clientId = () => {
  try {
    let id = localStorage.getItem("takin-client");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("takin-client", id);
    }
    return id;
  } catch {
    return fallbackClientId;
  }
};
const fallbackClientId = crypto.randomUUID();
export function meta(): Meta {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    schemaVersion: 2,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    clientId: clientId(),
    revision: 1,
  };
}
export function revised<T extends Meta>(item: T): T {
  return {
    ...item,
    updatedAt: new Date().toISOString(),
    revision: item.revision + 1,
  };
}
export async function save<K extends EntityName>(
  db: AppDB,
  kind: K,
  item: Entities[K],
) {
  const valid = schemas[kind].parse(item) as Entities[K];
  await db.transaction("rw", [db.table(kind), db.queue], async () => {
    const current = await db.table(kind).get(valid.id);
    if (current) {
      valid.revision = Math.max(current.revision + 1, valid.revision);
      valid.updatedAt = new Date().toISOString();
      valid.clientId = clientId();
    }
    await db.table(kind).put(valid);
    await enqueue(db, kind, valid);
  });
}
export async function enqueue(db: AppDB, kind: EntityName, item: Meta) {
  await db.queue.add({
    id: crypto.randomUUID(),
    entityType: kind,
    entityId: item.id,
    operation: item.deletedAt ? "delete" : "upsert",
    revision: item.revision,
    queuedAt: new Date().toISOString(),
    attempts: 0,
  });
}
export async function remove(db: AppDB, kind: EntityName, item: Meta) {
  await save(db, kind, {
    ...revised(item),
    deletedAt: new Date().toISOString(),
  } as Entities[typeof kind]);
}
export async function deleteSession(db: AppDB, id: string) {
  await db.transaction(
    "rw",
    [db.sessions, db.sets, db.wellness, db.queue],
    async () => {
      const s = await db.sessions.get(id);
      if (s) await remove(db, "sessions", s);
      for (const row of await db.sets.where("sessionId").equals(id).toArray())
        await remove(db, "sets", row);
      for (const row of await db.wellness
        .where("sessionId")
        .equals(id)
        .toArray())
        await remove(db, "wellness", row);
    },
  );
}
const backupSchema = z
  .object({
    app: z.literal("takin-2ku"),
    schemaVersion: z.literal(2),
    exportedAt: z.iso.datetime(),
    data: z
      .object({
        exercises: z.array(schemas.exercises),
        plans: z.array(schemas.plans),
        sessions: z.array(schemas.sessions),
        sets: z.array(schemas.sets),
        wellness: z.array(schemas.wellness),
        recommendations: z.array(schemas.recommendations),
        health: z.array(schemas.health),
        profiles: z.array(schemas.profiles),
      })
      .strict(),
  })
  .strict();
export type Backup = z.infer<typeof backupSchema>;
export async function exportBackup(db: AppDB): Promise<Backup> {
  return db.transaction("r", Object.keys(schemas), async () => {
    const data: Record<string, unknown> = {};
    for (const key of Object.keys(schemas))
      data[key] = await db.table(key).toArray();
    return backupSchema.parse({
      app: "takin-2ku",
      schemaVersion: 2,
      exportedAt: new Date().toISOString(),
      data,
    });
  });
}
export function parseBackup(text: string): Backup {
  const raw = JSON.parse(text);
  if (raw.schemaVersion === 1) {
    raw.schemaVersion = 2;
    for (const [key, rows] of Object.entries(raw.data) as [
      string,
      Record<string, unknown>[],
    ][]) {
      for (const row of rows) {
        row.schemaVersion = 2;
        if (key === "sets" && typeof row.rir === "number")
          row.rir = { min: row.rir, max: row.rir };
      }
    }
  }
  const b = backupSchema.parse(raw);
  for (const rows of Object.values(b.data)) {
    const ids = new Set<string>();
    for (const r of rows) {
      if (ids.has(r.id)) throw Error("ファイル内に重複IDがあります");
      ids.add(r.id);
    }
  }
  const sessions = new Set(b.data.sessions.map((s) => s.id));
  for (const s of b.data.sets)
    if (!sessions.has(s.sessionId))
      throw Error("セットのセッション参照が不正です");
  return b;
}
export async function importBackup(db: AppDB, b: Backup) {
  b = parseBackup(JSON.stringify(b));
  let added = 0,
    duplicates = 0,
    conflicts = 0;
  await db.transaction("rw", [...Object.keys(schemas), "queue"], async () => {
    for (const key of Object.keys(schemas) as EntityName[])
      for (const row of b.data[key]) {
        const existing = await db.table(key).get(row.id);
        if (existing) {
          if (JSON.stringify(existing) === JSON.stringify(row)) duplicates++;
          else conflicts++;
          continue;
        }
        if (
          key === "health" &&
          (await db.health
            .where("sourceRecordHash")
            .equals((row as Entities["health"]).sourceRecordHash)
            .count())
        ) {
          duplicates++;
          continue;
        }
        await db.table(key).add(row);
        await enqueue(db, key, row);
        added++;
      }
  });
  return { added, duplicates, conflicts };
}
export async function seed(db: AppDB, demo = false) {
  if (await db.profiles.count()) return;
  await db.transaction(
    "rw",
    [
      db.profiles,
      db.exercises,
      db.plans,
      db.sessions,
      db.sets,
      db.wellness,
      db.queue,
    ],
    async () => {
      if (await db.profiles.count()) return;
      await save(db, "profiles", {
        ...meta(),
        id: "main",
        units: "kg",
        goal: "筋肥大",
        targetDaysPerWeek: 3,
        targetWeightKg: null,
        theme: "dark",
        priorityMuscles: ["胸", "背中", "脚"],
      });
      const exercises = [
        ["ベンチプレス", "胸", "フリーウェイト"],
        ["ラットプルダウン", "背中", "ケーブル A"],
        ["スクワット", "脚", "パワーラック"],
      ].map(([name, muscle, equipmentId]) => ({
        ...meta(),
        name,
        muscle,
        equipmentId,
        notes: "",
        measurementBasis: "total" as const,
      }));
      for (const e of exercises) await save(db, "exercises", e);
      const p = {
        ...meta(),
        name: "全身ベーシック",
        dayLabel: "月・水・金 / 全身",
        exercises: exercises.map((e) => ({
          exerciseId: e.id,
          targetSets: 3,
          repMin: 8,
          repMax: 12,
          targetRir: { min: 1, max: 2 },
          plannedWeightKg: 20,
        })),
      };
      await save(db, "plans", p);
      if (demo)
        for (let n = 0; n < 6; n++) {
          const start = new Date(
            Date.now() - (19 - n * 3) * 86400000,
          ).toISOString();
          const s = {
            ...meta(),
            name: p.name,
            startedAt: start,
            endedAt: start,
            status: "finished" as const,
            planId: p.id,
            notes: "デモ記録",
            exercises: exercises.map((e) => ({
              exerciseId: e.id,
              name: e.name,
              muscle: e.muscle,
              equipmentId: e.equipmentId,
              notes: "",
            })),
          };
          await save(db, "sessions", s);
          for (const [i, e] of exercises.entries())
            for (let ordinal = 0; ordinal < 3; ordinal++)
              await save(db, "sets", {
                ...meta(),
                sessionId: s.id,
                exerciseId: e.id,
                equipmentId: e.equipmentId,
                ordinal,
                setType: "normal",
                weightKg: 30 + i * 10 + n * 2.5,
                reps: 8 + (n % 3),
                rir: { min: 1, max: 2 },
                rpe: null,
                completedAt: start,
                notes: "",
                restSeconds: 90,
              });
          await save(db, "wellness", {
            ...meta(),
            sessionId: s.id,
            dateLocal: start.slice(0, 10),
            sleepHours: 7,
            mood: 4,
            fatigue: 2,
            painFlag: false,
            sorenessByMuscle: {},
            bodyWeightKg: 70 - n * 0.2,
            notes: "",
          });
        }
    },
  );
}
