import { Router, type IRouter } from "express";
import { spawn } from "child_process";

const router: IRouter = Router();

const PG_DUMP = "/nix/store/bgwr5i8jf8jpg75rr53rz3fqv5k8yrwp-postgresql-16.10/bin/pg_dump";

// GET /admin/db-backup — stream a full pg_dump as a downloadable .db file
router.get("/admin/db-backup", (req, res): void => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    res.status(500).json({ error: "DATABASE_URL not configured" });
    return;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `medeval-backup-${timestamp}.sql`;

  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("X-Backup-Timestamp", new Date().toISOString());

  const dump = spawn(PG_DUMP, [
    "--no-password",
    "--format=plain",
    "--encoding=UTF8",
    "--no-owner",
    "--no-privileges",
    "--if-exists",
    "--clean",
    dbUrl,
  ]);

  dump.stdout.pipe(res);

  let stderr = "";
  dump.stderr.on("data", (d) => { stderr += d.toString(); });

  dump.on("error", (err) => {
    if (!res.headersSent) {
      res.status(500).json({ error: `pg_dump failed: ${err.message}` });
    } else {
      res.destroy();
    }
  });

  dump.on("close", (code) => {
    if (code !== 0 && !res.writableEnded) {
      res.destroy();
      console.error("[db-backup] pg_dump exited with code", code, stderr);
    }
  });
});

export default router;
