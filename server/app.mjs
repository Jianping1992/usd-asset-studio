import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { access, mkdir, open, readFile, stat, unlink } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { JsonRepository } from './lib/json-repository.mjs';
import {
  AppError,
  assertPlainObject,
  finiteVector,
  notFound,
  optionalString,
  parseNonNegativeInteger,
  parseTags,
  rejectUnknownKeys,
  requiredString,
  validationError,
} from './lib/validation.mjs';

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(moduleDirectory, '..');
const allowedFormats = new Set(['usd', 'usda', 'usdc', 'usdz']);
const reviewStatuses = new Set(['pending', 'approved', 'rejected']);
const maxUploadBytes = 100 * 1024 * 1024;

function success(data, meta) {
  return meta === undefined ? { data } : { data, meta };
}

function normalizePathInside(root, candidate) {
  const normalizedRoot = resolve(root);
  const normalizedCandidate = resolve(candidate);
  if (
    normalizedCandidate !== normalizedRoot &&
    !normalizedCandidate.startsWith(`${normalizedRoot}${sep}`)
  ) {
    throw new AppError(500, 'STORAGE_ERROR', 'Resolved file is outside the storage directory');
  }
  return normalizedCandidate;
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function verifyUsdFile(path, format) {
  const handle = await open(path, 'r');
  try {
    const buffer = Buffer.alloc(64);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead === 0) {
      throw validationError('Uploaded file cannot be empty', { field: 'file' });
    }

    const header = buffer.subarray(0, bytesRead);
    const textHeader = header.toString('utf8').replace(/^\uFEFF/, '').trimStart();
    const isUsda = textHeader.startsWith('#usda');
    const isUsdc = header.subarray(0, 8).toString('ascii') === 'PXR-USDC';
    const isZip =
      header[0] === 0x50 &&
      header[1] === 0x4b &&
      ((header[2] === 0x03 && header[3] === 0x04) ||
        (header[2] === 0x05 && header[3] === 0x06) ||
        (header[2] === 0x07 && header[3] === 0x08));

    const valid =
      (format === 'usda' && isUsda) ||
      (format === 'usdc' && isUsdc) ||
      (format === 'usdz' && isZip) ||
      (format === 'usd' && (isUsda || isUsdc));

    if (!valid) {
      throw new AppError(
        415,
        'INVALID_USD_FILE',
        `File contents do not match the .${format} format`,
        { field: 'file' },
      );
    }
  } finally {
    await handle.close();
  }
}

function validateAssetPatch(body) {
  assertPlainObject(body);
  rejectUnknownKeys(body, ['name', 'category', 'tags', 'description']);
  if (Object.keys(body).length === 0) {
    throw validationError('At least one metadata field is required');
  }

  const patch = {};
  if (Object.hasOwn(body, 'name')) {
    patch.name = requiredString(body.name, 'name', { max: 120 });
  }
  if (Object.hasOwn(body, 'category')) {
    patch.category = requiredString(body.category, 'category', { max: 60 });
  }
  if (Object.hasOwn(body, 'tags')) patch.tags = parseTags(body.tags);
  if (Object.hasOwn(body, 'description')) {
    patch.description = optionalString(body.description, 'description');
  }
  return patch;
}

function validateReviewPatch(body) {
  assertPlainObject(body);
  rejectUnknownKeys(body, ['status', 'reviewComment']);
  if (!reviewStatuses.has(body.status)) {
    throw validationError('status must be pending, approved, or rejected', { field: 'status' });
  }
  return {
    status: body.status,
    reviewComment: optionalString(body.reviewComment, 'reviewComment', { max: 1_000 }),
  };
}

function validateCompositionAsset(value, index) {
  assertPlainObject(value, `assets[${index}]`);
  rejectUnknownKeys(
    value,
    ['assetId', 'position', 'rotation', 'scale'],
    `assets[${index}]`,
  );
  return {
    assetId: requiredString(value.assetId, `assets[${index}].assetId`, { max: 100 }),
    position: finiteVector(value.position, `assets[${index}].position`),
    // Rotation is deliberately persisted in degrees; the rendering adapter is
    // responsible for converting it to radians for Three.js.
    rotation: finiteVector(value.rotation, `assets[${index}].rotation`, { bounded: false }),
    scale: finiteVector(value.scale, `assets[${index}].scale`, { positive: true }),
  };
}

function validateCompositionPatch(body, { partial = false } = {}) {
  assertPlainObject(body);
  rejectUnknownKeys(body, ['name', 'assets']);
  if (partial && Object.keys(body).length === 0) {
    throw validationError('At least one composition field is required');
  }

  const result = {};
  if (!partial || Object.hasOwn(body, 'name')) {
    result.name = requiredString(body.name, 'name', { max: 120 });
  }
  if (!partial || Object.hasOwn(body, 'assets')) {
    if (!Array.isArray(body.assets) || body.assets.length < 2 || body.assets.length > 3) {
      throw validationError('assets must contain 2 or 3 scene assets', { field: 'assets' });
    }
    result.assets = body.assets.map(validateCompositionAsset);
    const ids = result.assets.map((item) => item.assetId);
    if (new Set(ids).size !== ids.length) {
      throw validationError('A composition cannot contain the same asset more than once', {
        field: 'assets',
      });
    }
  }
  return result;
}

async function assertApprovedCompositionAssets(items, assetsRepository) {
  const assets = await assetsRepository.all();
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  const missing = [];
  const unapproved = [];
  for (const item of items) {
    const asset = assetsById.get(item.assetId);
    if (!asset) missing.push(item.assetId);
    else if (asset.status !== 'approved') unapproved.push(item.assetId);
  }
  if (missing.length > 0) {
    throw validationError('Composition references unknown assets', { assetIds: missing });
  }
  if (unapproved.length > 0) {
    throw new AppError(
      409,
      'ASSET_NOT_APPROVED',
      'Only approved assets can be added to a composition',
      { assetIds: unapproved },
    );
  }
}

function parseAssetQuery(query) {
  const source = query ?? {};
  rejectUnknownKeys(
    source,
    ['search', 'category', 'status', 'format', 'sort', 'order', 'offset', 'limit'],
    'Query',
  );
  const result = {
    search: optionalString(source.search, 'search', { max: 100 }).toLocaleLowerCase(),
    category: optionalString(source.category, 'category', { max: 60 }),
    status: optionalString(source.status, 'status', { max: 20 }),
    format: optionalString(source.format, 'format', { max: 10 }).toLocaleLowerCase(),
    sort: source.sort ?? 'createdAt',
    order: source.order ?? 'desc',
    offset: parseNonNegativeInteger(source.offset, 'offset', 0),
    limit: parseNonNegativeInteger(source.limit, 'limit', 100),
  };
  if (result.status && !reviewStatuses.has(result.status)) {
    throw validationError('status must be pending, approved, or rejected', { field: 'status' });
  }
  if (result.format && !allowedFormats.has(result.format)) {
    throw validationError('format must be usd, usda, usdc, or usdz', { field: 'format' });
  }
  if (!['createdAt', 'updatedAt', 'name', 'size', 'status', 'category'].includes(result.sort)) {
    throw validationError('Unsupported sort field', { field: 'sort' });
  }
  if (!['asc', 'desc'].includes(result.order)) {
    throw validationError('order must be asc or desc', { field: 'order' });
  }
  if (result.limit < 1 || result.limit > 100) {
    throw validationError('limit must be between 1 and 100', { field: 'limit' });
  }
  return result;
}

function sortAssets(items, field, order) {
  const direction = order === 'asc' ? 1 : -1;
  return items.sort((left, right) => {
    const a = left[field];
    const b = right[field];
    if (typeof a === 'string' && typeof b === 'string') {
      return a.localeCompare(b, 'zh-CN', { numeric: true }) * direction;
    }
    return ((a ?? 0) - (b ?? 0)) * direction;
  });
}

async function registerStaticFiles(app, { storageDir, publicDir, distDir }) {
  await app.register(fastifyStatic, {
    root: storageDir,
    prefix: '/uploads/',
    index: false,
    cacheControl: false,
    decorateReply: true,
  });

  const thumbnailDirectory = join(publicDir, 'thumbnails');
  if (await pathExists(thumbnailDirectory)) {
    await app.register(fastifyStatic, {
      root: thumbnailDirectory,
      prefix: '/thumbnails/',
      index: false,
      maxAge: '1h',
      immutable: false,
      decorateReply: false,
    });
  }

  let spaIndex = null;
  if (await pathExists(join(distDir, 'index.html'))) {
    spaIndex = await readFile(join(distDir, 'index.html'));
    await app.register(fastifyStatic, {
      root: distDir,
      prefix: '/',
      index: ['index.html'],
      maxAge: '1h',
      decorateReply: false,
    });
  }

  app.setNotFoundHandler((request, reply) => {
    const pathname = request.raw.url?.split('?')[0] ?? '';
    const acceptsHtml = request.headers.accept?.includes('text/html');
    const reservedPath =
      pathname.startsWith('/api/') ||
      pathname === '/api' ||
      pathname.startsWith('/uploads/') ||
      pathname.startsWith('/thumbnails/');
    if (spaIndex && request.method === 'GET' && acceptsHtml && !reservedPath) {
      return reply.type('text/html; charset=utf-8').send(spaIndex);
    }
    return reply.code(404).send({
      error: { code: 'NOT_FOUND', message: 'Route not found', details: { path: pathname } },
    });
  });
}

export async function buildApp(options = {}) {
  const dataDir = resolve(options.dataDir ?? join(projectRoot, 'data'));
  const storageDir = resolve(options.storageDir ?? join(projectRoot, 'storage', 'assets'));
  const publicDir = resolve(options.publicDir ?? join(projectRoot, 'public'));
  const distDir = resolve(options.distDir ?? join(projectRoot, 'dist'));
  const logger = options.logger ?? false;

  await mkdir(dataDir, { recursive: true });
  await mkdir(storageDir, { recursive: true });

  const assetsRepository = new JsonRepository(join(dataDir, 'assets.json'), []);
  const compositionsRepository = new JsonRepository(join(dataDir, 'compositions.json'), []);
  await Promise.all([assetsRepository.initialize(), compositionsRepository.initialize()]);

  // Asset review state and composition references live in separate JSON files.
  // Serialize operations that can change their relationship so a concurrent
  // composition save cannot race an approved asset being moved out of review.
  let compositionConsistencyQueue = Promise.resolve();
  const runCompositionConsistentMutation = (operation) => {
    const result = compositionConsistencyQueue.then(operation, operation);
    compositionConsistencyQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };

  const app = Fastify({ logger, bodyLimit: 2 * 1024 * 1024 });

  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header('Cross-Origin-Opener-Policy', 'same-origin');
    reply.header('Cross-Origin-Embedder-Policy', 'require-corp');
    reply.header('Cross-Origin-Resource-Policy', 'same-origin');
    reply.header('X-Content-Type-Options', 'nosniff');
    return payload;
  });

  await app.register(multipart, {
    limits: {
      fieldNameSize: 100,
      fieldSize: 20_000,
      fields: 8,
      fileSize: maxUploadBytes,
      files: 1,
      parts: 9,
    },
  });

  app.get('/api/health', async () => success({ status: 'ok' }));

  app.get('/api/assets', async (request) => {
    const query = parseAssetQuery(request.query);
    let assets = await assetsRepository.all();

    if (query.search) {
      assets = assets.filter((asset) =>
        [asset.name, asset.originalName, asset.category, asset.description, ...(asset.tags ?? [])]
          .filter(Boolean)
          .some((value) => String(value).toLocaleLowerCase().includes(query.search)),
      );
    }
    if (query.category) assets = assets.filter((asset) => asset.category === query.category);
    if (query.status) assets = assets.filter((asset) => asset.status === query.status);
    if (query.format) assets = assets.filter((asset) => asset.format === query.format);

    sortAssets(assets, query.sort, query.order);
    const total = assets.length;
    const data = assets.slice(query.offset, query.offset + query.limit);
    return success(data, { total, offset: query.offset, limit: query.limit });
  });

  app.get('/api/assets/:id', async (request) => {
    const assets = await assetsRepository.all();
    const asset = assets.find((item) => item.id === request.params.id);
    if (!asset) throw notFound('Asset', request.params.id);
    return success(asset);
  });

  app.post('/api/assets', async (request, reply) => {
    if (!request.isMultipart()) {
      throw new AppError(
        415,
        'UNSUPPORTED_MEDIA_TYPE',
        'Asset upload requires multipart/form-data',
      );
    }

    const fields = {};
    let uploadedPath;
    let uploadedFile;

    try {
      for await (const part of request.parts()) {
        if (part.type === 'file') {
          if (part.fieldname !== 'file') {
            part.file.resume();
            throw validationError('The uploaded USD must use the file field', {
              field: part.fieldname,
            });
          }
          if (uploadedFile) {
            part.file.resume();
            throw validationError('Exactly one USD file can be uploaded', { field: 'file' });
          }
          const originalName = basename(part.filename || '');
          const format = extname(originalName).slice(1).toLocaleLowerCase();
          if (!allowedFormats.has(format)) {
            part.file.resume();
            throw new AppError(
              415,
              'UNSUPPORTED_FORMAT',
              'Only .usd, .usda, .usdc, and .usdz files are supported',
              { field: 'file' },
            );
          }

          const storedName = `${randomUUID()}.${format}`;
          uploadedPath = normalizePathInside(storageDir, join(storageDir, storedName));
          await pipeline(part.file, createWriteStream(uploadedPath, { flags: 'wx' }));
          if (part.file.truncated) {
            throw new AppError(413, 'FILE_TOO_LARGE', 'USD file cannot exceed 100 MiB');
          }
          await verifyUsdFile(uploadedPath, format);
          const fileStats = await stat(uploadedPath);
          uploadedFile = {
            originalName,
            format,
            storedName,
            size: fileStats.size,
          };
        } else {
          if (!['name', 'category', 'tags', 'description'].includes(part.fieldname)) {
            throw validationError('Upload contains an unsupported field', {
              field: part.fieldname,
            });
          }
          if (Object.hasOwn(fields, part.fieldname)) {
            throw validationError('Upload contains a duplicate field', { field: part.fieldname });
          }
          fields[part.fieldname] = part.value;
        }
      }

      if (!uploadedFile) {
        throw validationError('A USD/USDZ file is required', { field: 'file' });
      }

      const now = new Date().toISOString();
      const asset = {
        id: `asset-${randomUUID()}`,
        name: requiredString(fields.name ?? uploadedFile.originalName.replace(/\.[^.]+$/, ''), 'name', {
          max: 120,
        }),
        originalName: uploadedFile.originalName,
        format: uploadedFile.format,
        category: requiredString(fields.category ?? '未分类', 'category', { max: 60 }),
        tags: parseTags(fields.tags),
        description: optionalString(fields.description, 'description'),
        status: 'pending',
        fileUrl: `/uploads/${uploadedFile.storedName}`,
        thumbnailUrl: '/thumbnails/usd-placeholder.svg',
        size: uploadedFile.size,
        createdAt: now,
        updatedAt: now,
        reviewComment: '',
      };

      await assetsRepository.mutate((assets) => {
        assets.push(asset);
        return asset;
      });
      uploadedPath = undefined;
      return reply.code(201).send(success(asset));
    } catch (error) {
      if (uploadedPath) await unlink(uploadedPath).catch(() => undefined);
      throw error;
    }
  });

  app.patch('/api/assets/:id', async (request) => {
    const patch = validateAssetPatch(request.body);
    const updated = await assetsRepository.mutate((assets) => {
      const index = assets.findIndex((asset) => asset.id === request.params.id);
      if (index === -1) throw notFound('Asset', request.params.id);
      assets[index] = { ...assets[index], ...patch, updatedAt: new Date().toISOString() };
      return assets[index];
    });
    return success(updated);
  });

  app.patch('/api/assets/:id/review', async (request) => {
    const patch = validateReviewPatch(request.body);
    const updated = await runCompositionConsistentMutation(async () => {
      const assets = await assetsRepository.all();
      const current = assets.find((asset) => asset.id === request.params.id);
      if (!current) throw notFound('Asset', request.params.id);

      if (current.status === 'approved' && patch.status !== 'approved') {
        const compositions = await compositionsRepository.all();
        const compositionIds = compositions
          .filter((composition) =>
            composition.assets.some((item) => item.assetId === current.id),
          )
          .map((composition) => composition.id);
        if (compositionIds.length > 0) {
          throw new AppError(
            409,
            'ASSET_IN_USE',
            'Asset is used by a saved composition and must remain approved',
            { assetId: current.id, compositionIds },
          );
        }
      }

      return assetsRepository.mutate((draft) => {
        const index = draft.findIndex((asset) => asset.id === request.params.id);
        if (index === -1) throw notFound('Asset', request.params.id);
        draft[index] = { ...draft[index], ...patch, updatedAt: new Date().toISOString() };
        return draft[index];
      });
    });
    return success(updated);
  });

  app.delete('/api/assets/:id', async (request, reply) => {
    const removed = await runCompositionConsistentMutation(async () => {
      const deleted = await assetsRepository.mutate((assets) => {
        const index = assets.findIndex((asset) => asset.id === request.params.id);
        if (index === -1) throw notFound('Asset', request.params.id);
        return assets.splice(index, 1)[0];
      });

      await compositionsRepository.mutate((compositions) => {
        for (let index = compositions.length - 1; index >= 0; index -= 1) {
          compositions[index].assets = compositions[index].assets.filter(
            (item) => item.assetId !== deleted.id,
          );
          if (compositions[index].assets.length < 2) compositions.splice(index, 1);
        }
      });
      return deleted;
    });

    if (typeof removed.fileUrl === 'string' && removed.fileUrl.startsWith('/uploads/')) {
      const fileName = basename(removed.fileUrl);
      const filePath = normalizePathInside(storageDir, join(storageDir, fileName));
      await unlink(filePath).catch((error) => {
        if (error?.code !== 'ENOENT') throw error;
      });
    }
    return reply.code(204).send();
  });

  app.get('/api/dashboard', async () => {
    const assets = await assetsRepository.all();
    const totals = { total: assets.length, pending: 0, approved: 0, rejected: 0 };
    const categoryCounts = new Map();
    for (const asset of assets) {
      if (Object.hasOwn(totals, asset.status)) totals[asset.status] += 1;
      categoryCounts.set(asset.category, (categoryCounts.get(asset.category) ?? 0) + 1);
    }
    const byCategory = [...categoryCounts.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((left, right) => right.value - left.value || left.name.localeCompare(right.name, 'zh-CN'));
    const byStatus = ['pending', 'approved', 'rejected'].map((name) => ({
      name,
      value: totals[name],
    }));
    const recentAssets = sortAssets([...assets], 'createdAt', 'desc').slice(0, 5);
    return success({ ...totals, byCategory, byStatus, recentAssets });
  });

  app.get('/api/compositions', async () => {
    const compositions = await compositionsRepository.all();
    compositions.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    return success(compositions, { total: compositions.length });
  });

  app.post('/api/compositions', async (request, reply) => {
    const input = validateCompositionPatch(request.body);
    const composition = await runCompositionConsistentMutation(async () => {
      await assertApprovedCompositionAssets(input.assets, assetsRepository);
      const now = new Date().toISOString();
      const created = {
        id: `composition-${randomUUID()}`,
        ...input,
        createdAt: now,
        updatedAt: now,
      };
      await compositionsRepository.mutate((compositions) => {
        compositions.push(created);
      });
      return created;
    });
    return reply.code(201).send(success(composition));
  });

  app.patch('/api/compositions/:id', async (request) => {
    const patch = validateCompositionPatch(request.body, { partial: true });
    const updated = await runCompositionConsistentMutation(async () => {
      if (patch.assets) await assertApprovedCompositionAssets(patch.assets, assetsRepository);
      return compositionsRepository.mutate((compositions) => {
        const index = compositions.findIndex((item) => item.id === request.params.id);
        if (index === -1) throw notFound('Composition', request.params.id);
        compositions[index] = {
          ...compositions[index],
          ...patch,
          updatedAt: new Date().toISOString(),
        };
        return compositions[index];
      });
    });
    return success(updated);
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          ...(error.details === undefined ? {} : { details: error.details }),
        },
      });
    }

    if (
      error?.code === 'FST_REQ_FILE_TOO_LARGE' ||
      error?.code === 'FST_FILES_LIMIT' ||
      error?.code === 'FST_PARTS_LIMIT'
    ) {
      const statusCode = error.code === 'FST_REQ_FILE_TOO_LARGE' ? 413 : 400;
      return reply.code(statusCode).send({
        error: {
          code: statusCode === 413 ? 'FILE_TOO_LARGE' : 'MULTIPART_LIMIT',
          message: statusCode === 413 ? 'USD file cannot exceed 100 MiB' : 'Multipart limit exceeded',
        },
      });
    }

    if (
      error?.code === 'FST_ERR_CTP_INVALID_JSON_BODY' ||
      error?.statusCode === 400
    ) {
      return reply.code(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Request body is invalid' },
      });
    }

    request.log.error(error);
    return reply.code(500).send({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected server error occurred' },
    });
  });

  await registerStaticFiles(app, { storageDir, publicDir, distDir });
  return app;
}

export default buildApp;
