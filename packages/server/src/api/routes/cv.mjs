import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';

const router = express.Router();
const uploadDir = path.resolve('data', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir });

function toParsedPath(filename) {
  return path.resolve('data', 'cv-parsed.md');
}

router.post('/', upload.single('cv'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const destPath = path.resolve(uploadDir, req.file.originalname);
  fs.renameSync(req.file.path, destPath);

  const ext = path.extname(req.file.originalname).toLowerCase();
  let parsed = false;
  let parsedPath;

  if (ext === '.md' || ext === '.txt') {
    const text = fs.readFileSync(destPath, 'utf-8');
    parsedPath = toParsedPath(req.file.originalname);
    fs.writeFileSync(parsedPath, text, 'utf-8');
    parsed = true;
  }

  res.json({
    uploaded: true,
    filename: req.file.originalname,
    path: destPath,
    parsed,
    parsedPath: parsed ? parsedPath : null,
  });
});

export default router;
