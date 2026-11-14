import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import multer from "multer";

// Files live in an "uploads" folder next to the running app (i.e. inside
// mycommunity-api/ on the server), not inside the web-served public_html —
// so they are never reachable by a direct URL. The only way to read one back
// is through an authenticated download route.
const UPLOADS_BASE = path.join(process.cwd(), "uploads");

const ALLOWED_MIME = new Set(["application/pdf", "image/jpeg", "image/png"]);
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

function extensionFor(mimetype: string): string {
  if (mimetype === "application/pdf") return ".pdf";
  if (mimetype === "image/png") return ".png";
  return ".jpg";
}

function makeUploader(subfolder: string) {
  const root = path.join(UPLOADS_BASE, subfolder);
  fs.mkdirSync(root, { recursive: true });

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, root),
    filename: (_req, file, cb) => {
      // Never trust the original filename — it's attacker-controlled input.
      // Generate our own random name and keep only a safe, known extension.
      cb(null, `${crypto.randomBytes(24).toString("hex")}${extensionFor(file.mimetype)}`);
    },
  });

  const upload = multer({
    storage,
    limits: { fileSize: MAX_BYTES, files: 1 },
    fileFilter: (_req, file, cb) => {
      if (!ALLOWED_MIME.has(file.mimetype)) {
        cb(new Error("Only PDF, JPG, or PNG files are allowed"));
        return;
      }
      cb(null, true);
    },
  });

  return {
    upload,
    absolutePath: (storedName: string) => path.join(root, storedName),
    deleteFile: (storedName: string) => {
      try {
        fs.unlinkSync(path.join(root, storedName));
      } catch {
        // Already gone — nothing to do.
      }
    },
  };
}

const documents = makeUploader("documents");
const noticeAttachments = makeUploader("notices");

export const documentUpload = documents.upload;
export const documentAbsolutePath = documents.absolutePath;
export const deleteDocumentFile = documents.deleteFile;

export const noticeAttachmentUpload = noticeAttachments.upload;
export const noticeAttachmentAbsolutePath = noticeAttachments.absolutePath;
export const deleteNoticeAttachmentFile = noticeAttachments.deleteFile;
