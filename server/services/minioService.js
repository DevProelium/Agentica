'use strict';

const Minio = require('minio');
const path  = require('path');
const crypto = require('crypto');

// Cliente MinIO configurado desde variables de entorno
const minioClient = new Minio.Client({
  endPoint:  process.env.MINIO_ENDPOINT  || 'localhost',
  port:      parseInt(process.env.MINIO_PORT || '9000', 10),
  useSSL:    process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ROOT_USER     || 'minio_admin',
  secretKey: process.env.MINIO_ROOT_PASSWORD || 'minio_secret123',
});

const BUCKET = process.env.MINIO_BUCKET || 'inventory-assets';

/**
 * Asegura que el bucket de MinIO exista; lo crea si no existe.
 */
async function ensureBucket() {
  const exists = await minioClient.bucketExists(BUCKET);
  if (!exists) {
    await minioClient.makeBucket(BUCKET, 'us-east-1');
    console.log(`[MinIO] Bucket '${BUCKET}' creado correctamente`);
  }
}

/**
 * Sube un archivo al bucket de MinIO.
 * @param {Buffer} fileBuffer - Contenido del archivo
 * @param {string} originalName - Nombre original del archivo
 * @param {string} mimetype - Tipo MIME del archivo
 * @returns {Promise<string>} Nombre único asignado al archivo en el bucket
 */
async function uploadFile(fileBuffer, originalName, mimetype) {
  await ensureBucket();

  const ext      = path.extname(originalName);
  const uniqueId = crypto.randomBytes(16).toString('hex');
  const filename = `${Date.now()}-${uniqueId}${ext}`;

  const metadata = { 'Content-Type': mimetype };

  await minioClient.putObject(BUCKET, filename, fileBuffer, fileBuffer.length, metadata);
  console.log(`[MinIO] Archivo subido: ${filename}`);
  return filename;
}

/**
 * Genera una URL pre-firmada temporal para acceder a un archivo.
 * @param {string} filename - Nombre del archivo en el bucket
 * @param {number} [expiry=3600] - Expiración en segundos (default: 1 hora)
 * @returns {Promise<string>} URL pre-firmada
 */
async function getPresignedUrl(filename, expiry = 3600) {
  return minioClient.presignedGetObject(BUCKET, filename, expiry);
}

module.exports = { ensureBucket, uploadFile, getPresignedUrl };
