import express from 'express';
import { randomUUID } from 'crypto';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import fsSync from 'fs';
import XLSX from 'xlsx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uploadsDir = path.resolve(__dirname, '../activity_uploads');
const metadataFileName = 'activity_attachments.json';
const metadataPath = path.join(uploadsDir, metadataFileName);
const legacyMetadataPath = path.resolve(__dirname, '../activity_attachments.json');
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

async function normalizeAttachmentRecord(item, fallbackActivityId) {
  if (!item || typeof item !== 'object') {
    return null;
  }

  const activityId = item.activityId || fallbackActivityId;
  const attachmentId = item.attachmentId || randomUUID();
  const uploadedAt = item.uploadedAt || new Date().toISOString();
  let mutated = false;

  const rawStored = typeof item.storedFileName === 'string' ? item.storedFileName : '';
  const rawFileName = typeof item.fileName === 'string' ? item.fileName : '';

  const normalizedStoredInput = rawStored.replace(/\\/g, '/').replace(/^\/+/, '');
  const fallbackName =
    normalizedStoredInput.split('/').pop() ||
    rawFileName.split(/[\\/]/).pop() ||
    '';

  let storedFileName = normalizedStoredInput;
  if (!storedFileName || !storedFileName.startsWith(`${activityId}/`)) {
    const baseName = fallbackName || (rawFileName ? rawFileName : 'lampiran');
    storedFileName = path.posix.join(activityId, baseName);
    mutated = true;
  }

  const fileName =
    rawFileName ||
    fallbackName ||
    storedFileName.split('/').pop() ||
    'lampiran';

  const filePath = `/activity-uploads/${storedFileName}`;

  const targetPath = path.join(uploadsDir, storedFileName);
  if (!fsSync.existsSync(targetPath)) {
    const candidatePaths = [];
    if (normalizedStoredInput) {
      candidatePaths.push(path.join(uploadsDir, normalizedStoredInput));
    }
    if (rawStored) {
      candidatePaths.push(path.join(uploadsDir, rawStored.replace(/^[/\\]+/, '')));
      candidatePaths.push(path.join(uploadsDir, rawStored.split(/[\\/]/).pop() || ''));
    }
    if (fallbackName) {
      candidatePaths.push(path.join(uploadsDir, fallbackName));
      candidatePaths.push(path.join(uploadsDir, `${activityId}-${fallbackName}`));
    }

    for (const candidate of candidatePaths) {
      if (candidate && fsSync.existsSync(candidate) && candidate !== targetPath) {
        try {
          await ensureActivityDir(activityId);
          await fs.rename(candidate, targetPath);
          mutated = true;
          break;
        } catch {
          // ignore move errors
        }
      }
    }
  }

  return {
    mutated: mutated || !item.attachmentId || !item.activityId || !item.uploadedAt,
    record: {
      attachmentId,
      activityId,
      fileName,
      storedFileName,
      filePath,
      uploadedAt
    }
  };
}

async function readMetadata() {
  try {
    await ensureUploadsDir();
    if (fsSync.existsSync(legacyMetadataPath) && !fsSync.existsSync(metadataPath)) {
      try {
        await fs.rename(legacyMetadataPath, metadataPath);
      } catch (error) {
        console.warn('Failed to migrate legacy metadata file:', error);
      }
    }
    if (!fsSync.existsSync(metadataPath)) {
      return {};
    }
    const data = await fs.readFile(metadataPath, 'utf-8');
    const parsed = JSON.parse(data);
    const normalized = {};
    let mutated = false;

    for (const [activityId, entry] of Object.entries(parsed)) {
      const rawEntries = Array.isArray(entry)
        ? entry
        : entry && typeof entry === 'object'
          ? [entry]
          : [];

      const cleaned = [];
      for (const item of rawEntries) {
        const normalizedItem = await normalizeAttachmentRecord(item, activityId);
        if (normalizedItem?.record) {
          cleaned.push(normalizedItem.record);
          if (normalizedItem.mutated) {
            mutated = true;
          }
        }
      }

      if (cleaned.length > 0) {
        normalized[activityId] = cleaned;
      }
    }

    if (mutated) {
      await writeMetadata(normalized);
    }

    return normalized;
  } catch (error) {
    return {};
  }
}

async function writeMetadata(metadata) {
  await ensureUploadsDir();
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
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const shortId = randomUUID().replace(/-/g, '').slice(0, 16);
    cb(null, `${shortId}${ext}`);
  }
});

const upload = multer({ storage });

const app = express();

app.use(express.json());

app.get('/api/reports/laporan-processed', (_req, res) => {
  try {
    const reportPath = path.resolve(__dirname, '../bahanUpload/laporan_processed (1).xlsx');

    if (!fsSync.existsSync(reportPath)) {
      return res.status(404).json({ error: 'Laporan tidak ditemukan.' });
    }

    const workbook = XLSX.readFile(reportPath, { cellFormula: false, cellHTML: false });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null });

    if (!rows.length) {
      return res.status(200).json({ columns: [], rows: [], summary: null });
    }

    const [header, ...dataRows] = rows;
    const numericColumnNames = header.filter(name => typeof name === 'string' && name !== 'Kode' && name !== 'Uraian');
    const columnIndexMap = new Map();
    header.forEach((name, index) => columnIndexMap.set(name, index));

    const colTotals = Object.fromEntries(numericColumnNames.map(name => [name, 0]));
    const uniqueCodes = new Set();
    const uniqueDescriptions = new Set();

    const paguRecords = [];
    const realisasiPerKode = new Map();

    for (const row of dataRows) {
      const kode = row[columnIndexMap.get('Kode')] ?? '';
      const uraian = row[columnIndexMap.get('Uraian')] ?? '';
      if (kode) uniqueCodes.add(kode);
      if (uraian) uniqueDescriptions.add(uraian);

      for (const name of numericColumnNames) {
        const idx = columnIndexMap.get(name);
        const value = row[idx];
        if (typeof value === 'number' && Number.isFinite(value)) {
          colTotals[name] += value;
        }
      }

      const paguIdx = columnIndexMap.get('Pagu Revisi');
      const realisasiIdx = columnIndexMap.get('s.d. Periode');
      const paguValue = typeof row[paguIdx] === 'number' ? row[paguIdx] : 0;
      const realisasiValue = typeof row[realisasiIdx] === 'number' ? row[realisasiIdx] : 0;

      paguRecords.push({
        kode,
        uraian,
        pagu: paguValue,
        realisasi: realisasiValue
      });

      if (kode) {
        realisasiPerKode.set(kode, (realisasiPerKode.get(kode) || 0) + realisasiValue);
      }
    }

    const topByPagu = paguRecords
      .filter(item => item.pagu > 0)
      .sort((a, b) => b.pagu - a.pagu)
      .slice(0, 10);

    const topKodeByRealisasi = Array.from(realisasiPerKode.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([kode, total]) => ({ kode, total }));

    return res.json({
      columns: header,
      rows,
      summary: {
        rowCount: dataRows.length,
        columnTotals: colTotals,
        uniqueCodes: uniqueCodes.size,
        uniqueDescriptions: uniqueDescriptions.size,
        topByPagu,
        topKodeByRealisasi
      }
    });
  } catch (error) {
    console.error('Failed to read laporan_processed file:', error);
    res.status(500).json({ error: 'Gagal memuat data laporan_processed.' });
  }
});

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

app.get('/api/activities/:id/attachments/:attachmentId/download', async (req, res) => {
  try {
    const { id: activityId, attachmentId } = req.params;
    const metadata = await readMetadata();
    const entries = metadata[activityId];

    if (!entries || !entries.length) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    const attachment = entries.find(item => item.attachmentId === attachmentId);
    if (!attachment) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    const fileAbsolutePath = path.join(uploadsDir, attachment.storedFileName);
    if (!fsSync.existsSync(fileAbsolutePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.download(fileAbsolutePath, attachment.fileName);
  } catch (error) {
    console.error('Error serving attachment download:', error);
    res.status(500).json({ error: 'Failed to download attachment' });
  }
});

app.listen(port, () => {
  console.log(`Activity upload server listening on port ${port}`);
});
