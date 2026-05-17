import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import pdfParse from 'pdf-parse';

const router = express.Router();
const uploadDir = path.resolve('data', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir });
const CV_PATH = path.resolve('data', 'cv.md');
const PARSED_PATH = path.resolve('data', 'cv-parsed.md');

// GET current CV
router.get('/current', (req, res) => {
  const cvPath = fs.existsSync(CV_PATH) ? CV_PATH : (fs.existsSync(PARSED_PATH) ? PARSED_PATH : null);
  if (!cvPath) return res.json({ exists: false, content: null });
  try {
    const content = fs.readFileSync(cvPath, 'utf-8');
    res.json({ exists: true, content });
  } catch {
    res.json({ exists: false, content: null });
  }
});

router.post('/', upload.single('cv'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const destPath = path.resolve(uploadDir, req.file.originalname);
  fs.renameSync(req.file.path, destPath);

  const ext = path.extname(req.file.originalname).toLowerCase();
  let parsed = false;
  let parsedPath;
  let parsedText = '';

  try {
    if (ext === '.pdf') {
      const buffer = fs.readFileSync(destPath);
      const data = await pdfParse(buffer);
      parsedText = data.text;
      parsed = true;
    } else if (ext === '.md' || ext === '.txt') {
      parsedText = fs.readFileSync(destPath, 'utf-8');
      parsed = true;
    }

    if (parsed) {
      parsedPath = PARSED_PATH;
      fs.writeFileSync(parsedPath, parsedText, 'utf-8');
    }
  } catch (err) {
    return res.status(500).json({ error: 'Failed to parse file: ' + err.message });
  }

  res.json({
    uploaded: true,
    filename: req.file.originalname,
    path: destPath,
    parsed,
    parsedPath: parsed ? parsedPath : null,
    text: parsed ? parsedText : null,
    textLength: parsedText.length,
  });
});

export default router;
