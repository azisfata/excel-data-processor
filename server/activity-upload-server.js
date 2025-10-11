import express from 'express';
import { randomUUID } from 'crypto';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import fsSync from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uploadsDir = path.resolve(__dirname, '../activity_uploads');
const metadataPath = path.resolve(__dirname, '../activity_attachments.json');
const port = process.env.ACTIVITY_SERVER_PORT ? Number(process.env.ACTIVITY_SERVER_PORT) : 3001;

async function ensureUploadsDir() {
  if (!fsSync.existsSync(uploadsDir)) {
    await fs.mkdir(uploadsDir, { recursive: true });
  }
}

async function ensureActivityDir(activityId) {
  await ensureUploadsDir();
  const activityDir = path.join(uploadsDir, activityId);
  await fs.mkdir(activityDir, { recursive: true });
  return activityDir;
}

async function removeActivityDir(activityId) {
  const activityDir = path.join(uploadsDir, activityId);
  if (fsSync.existsSync(activityDir)) {
    await fs.rm(activityDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function removeFileIfExists(relativePath) {
  if (!relativePath) return;
  const fullPath = path.join(uploadsDir, relativePath);
  if (fsSync.existsSync(fullPath)) {
    await fs.unlink(fullPath).catch(() => {});
  }
}

async function cleanupActivityDirIfEmpty(activityId) {
  const activityDir = path.join(uploadsDir, activityId);
  if (fsSync.existsSync(activityDir)) {
    try {
      const contents = await fs.readdir(activityDir);
      if (!contents.length) {
        await fs.rmdir(activityDir).catch(() => {});
      }
    } catch {
      // ignore cleanup errors
    }
  }
}

async function readMetadata() {
  try {
    const data = await fs.readFile(metadataPath, 'utf-8');
    const parsed = JSON.parse(data);
    let mutated = false;

    const normalized = Object.entries(parsed).reduce((acc, [activityId, entry]) => {
      const rawEntries = Array.isArray(entry)
        ? entry
        : entry && typeof entry === 'object'
          ? [entry]
          : [];

      const cleaned = rawEntries
        .filter(item => item && typeof item === 'object')
        .map(item => {
          const attachmentId = item.attachmentId || randomUUID();
          const activityIdValue = item.activityId || activityId;
          const uploadedAt = item.uploadedAt || new Date().toISOString();

          if (!item.attachmentId || !item.activityId || !item.uploadedAt) {
            mutated = true;
          }

          const originalStored = typeof item.storedFileName === 'string' ? item.storedFileName : '';
          const originalFileName = typeof item.fileName === 'string' ? item.fileName : '';
          const fallbackName = originalStored.split(/[\\/]/).pop() || originalFileName.split(/[\\/]/).pop() || '';
          let normalizedStored = originalStored.replace(/\\/g, '/').replace(/^\/+/, '');

          if (!normalizedStored || !normalizedStored.startsWith(`${activityIdValue}/`)) {
            const baseName = fallbackName || 'lampiran';
            normalizedStored = path.posix.join(activityIdValue, baseName);
            mutated = true;
          }

          const normalizedFilePath = `/activity-uploads/${normalizedStored}`;
          const normalizedFileName = originalFileName || fallbackName || normalizedStored.split('/').pop() || 'lampiran';

          return {
            attachmentId,
            activityId: activityIdValue,
            fileName: normalizedFileName,
            storedFileName: normalizedStored,
            filePath: normalizedFilePath,
            uploadedAt
          };
        })
        .filter(item => item.storedFileName && item.fileName && item.filePath);

      if (cleaned.length > 0) {
        acc[activityId] = cleaned;
      }
      return acc;
    }, {});

    if (mutated) {
      await writeMetadata(normalized);
    }

    return normalized;
  } catch (error) {
    return {};
  }
}

async function writeMetadata(metadata) {
  await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
}

const storage = multer.diskStorage({
  destination: async (req, _file, cb) => {
    try {
      const dir = await ensureActivityDir(req.params.id);
      cb(null, dir);
    } catch (error) {
      cb(error, uploadsDir);
    }
  },
  filename: (req, file, cb) => {
    const activityId = req.params.id;
    const ext = path.extname(file.originalname);
    const safeBaseName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9-_]/g, '_');
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${activityId}-${safeBaseName}-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({ storage });

const app = express();

app.use(express.json());

app.get('/api/activities/attachments', async (_req, res) => {
  const metadata = await readMetadata();
  res.json(metadata);
});

app.get('/api/activities/:id/attachment', async (req, res) => {
  const metadata = await readMetadata();
  const entry = metadata[req.params.id] || [];
  if (!entry.length) {
    return res.status(404).json({ error: 'Attachment not found' });
  }
  res.json(entry);
});

app.post('/api/activities/:id/attachment', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const activityId = req.params.id;
  const metadata = await readMetadata();

  const newAttachment = {
    attachmentId: randomUUID(),
    activityId,
    fileName: req.file.originalname,
    storedFileName: path.posix.join(activityId, req.file.filename),
    filePath: `/activity-uploads/${path.posix.join(activityId, req.file.filename)}`,
    uploadedAt: new Date().toISOString()
  };

  metadata[activityId] = metadata[activityId] || [];
  metadata[activityId].push(newAttachment);

  await writeMetadata(metadata);

  res.json(newAttachment);
});

app.delete('/api/activities/:id/attachment/:attachmentId?', async (req, res) => {
  const activityId = req.params.id;
  const attachmentId = req.params.attachmentId;
  const metadata = await readMetadata();
  const entries = metadata[activityId];

  if (attachmentId) {
    if (!entries || !entries.length) {
      return res.status(404).json({ error: 'Attachment not found' });
    }
    const index = entries.findIndex(item => item.attachmentId === attachmentId);
    if (index === -1) {
      return res.status(404).json({ error: 'Attachment not found' });
    }
    const [removed] = entries.splice(index, 1);
    await removeFileIfExists(removed?.storedFileName);

    if (!entries.length) {
      delete metadata[activityId];
      await removeActivityDir(activityId);
    } else {
      metadata[activityId] = entries;
      await cleanupActivityDirIfEmpty(activityId);
    }
  } else {
    if (entries && entries.length) {
      for (const item of entries) {
        await removeFileIfExists(item?.storedFileName);
      }
      delete metadata[activityId];
    }
    await removeActivityDir(activityId);
  }

  await writeMetadata(metadata);

  res.json({ success: true });
});

app.use('/activity-uploads', express.static(uploadsDir));

app.listen(port, () => {
  console.log(`Activity upload server listening on port ${port}`);
});
