import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../server/app.mjs';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));

function multipartPayload({ filename, content, fields = {} }) {
  const boundary = `----usd-asset-studio-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const chunks = [];
  for (const [name, rawValue] of Object.entries(fields)) {
    const value = Array.isArray(rawValue) ? JSON.stringify(rawValue) : String(rawValue);
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
      ),
    );
  }
  chunks.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
    ),
    Buffer.isBuffer(content) ? content : Buffer.from(content),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  );
  const body = Buffer.concat(chunks);
  return {
    body,
    headers: {
      'content-type': `multipart/form-data; boundary=${boundary}`,
      'content-length': String(body.length),
    },
  };
}

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), 'usd-asset-studio-api-'));
  const dataDir = join(root, 'data');
  const storageDir = join(root, 'assets');
  const appOptions = {
    dataDir,
    storageDir,
    publicDir: join(projectRoot, 'public'),
    distDir: join(root, 'missing-dist'),
    logger: false,
  };
  return { root, dataDir, storageDir, appOptions, app: await buildApp(appOptions) };
}

async function uploadAsset(app, { filename, name, category, tags, description }) {
  const multipart = multipartPayload({
    filename,
    content: `#usda 1.0\n(\n    defaultPrim = "Demo"\n)\ndef Xform "Demo" {}\n`,
    fields: { name, category, tags, description },
  });
  const response = await app.inject({
    method: 'POST',
    url: '/api/assets',
    headers: multipart.headers,
    payload: multipart.body,
  });
  assert.equal(response.statusCode, 201, response.body);
  return response.json().data;
}

test('upload, persistence, search, metadata, review, dashboard, and composition workflow', async (t) => {
  const fixture = await createFixture();
  t.after(async () => {
    await fixture.app.close().catch(() => undefined);
    await rm(fixture.root, { recursive: true, force: true });
  });

  const robot = await uploadAsset(fixture.app, {
    filename: 'picker-robot.usda',
    name: 'Picker Robot Alpha',
    category: '机器人',
    tags: ['Isaac Sim', '抓取'],
    description: 'Warehouse picking robot',
  });
  const rack = await uploadAsset(fixture.app, {
    filename: 'rack.usd',
    name: 'Warehouse Rack Beta',
    category: '场景',
    tags: ['仓储', 'Sim2Real'],
    description: 'A semantic warehouse rack',
  });

  assert.equal(robot.status, 'pending');
  assert.equal(robot.format, 'usda');
  assert.equal(rack.format, 'usd');
  assert.match(robot.fileUrl, /^\/uploads\/[\da-f-]+\.usda$/);
  assert.equal((await stat(join(fixture.storageDir, robot.fileUrl.split('/').at(-1)))).isFile(), true);

  const staticResponse = await fixture.app.inject({ method: 'GET', url: robot.fileUrl });
  assert.equal(staticResponse.statusCode, 200);
  assert.match(staticResponse.body, /^#usda 1\.0/);
  assert.equal(staticResponse.headers['cross-origin-opener-policy'], 'same-origin');
  assert.equal(staticResponse.headers['cross-origin-embedder-policy'], 'require-corp');
  assert.equal(staticResponse.headers['cross-origin-resource-policy'], 'same-origin');

  // Closing and rebuilding the app exercises actual JSON persistence rather
  // than relying on the in-memory repository snapshot.
  await fixture.app.close();
  fixture.app = await buildApp(fixture.appOptions);

  const persisted = await fixture.app.inject({ method: 'GET', url: '/api/assets' });
  assert.equal(persisted.statusCode, 200);
  assert.equal(persisted.json().meta.total, 2);
  assert.deepEqual(
    new Set(persisted.json().data.map((asset) => asset.id)),
    new Set([robot.id, rack.id]),
  );
  const detail = await fixture.app.inject({ method: 'GET', url: `/api/assets/${robot.id}` });
  assert.equal(detail.statusCode, 200);
  assert.equal(detail.json().data.originalName, 'picker-robot.usda');
  const persistedJson = JSON.parse(await readFile(join(fixture.dataDir, 'assets.json'), 'utf8'));
  assert.equal(persistedJson.length, 2);

  const search = await fixture.app.inject({
    method: 'GET',
    url: '/api/assets?search=alpha&category=%E6%9C%BA%E5%99%A8%E4%BA%BA&status=pending',
  });
  assert.equal(search.statusCode, 200);
  assert.equal(search.json().meta.total, 1);
  assert.equal(search.json().data[0].id, robot.id);

  const edit = await fixture.app.inject({
    method: 'PATCH',
    url: `/api/assets/${robot.id}`,
    payload: {
      name: 'Picker Robot Alpha v2',
      category: '移动机器人',
      tags: ['VLA', 'Sim2Real'],
      description: 'Metadata updated through the real REST API',
    },
  });
  assert.equal(edit.statusCode, 200, edit.body);
  assert.equal(edit.json().data.name, 'Picker Robot Alpha v2');
  assert.deepEqual(edit.json().data.tags, ['VLA', 'Sim2Real']);

  const approveRobot = await fixture.app.inject({
    method: 'PATCH',
    url: `/api/assets/${robot.id}/review`,
    payload: { status: 'approved', reviewComment: 'Geometry and scale verified' },
  });
  assert.equal(approveRobot.statusCode, 200, approveRobot.body);
  assert.equal(approveRobot.json().data.status, 'approved');

  const rejectRack = await fixture.app.inject({
    method: 'PATCH',
    url: `/api/assets/${rack.id}/review`,
    payload: { status: 'rejected', reviewComment: 'Needs semantic labels' },
  });
  assert.equal(rejectRack.statusCode, 200, rejectRack.body);
  assert.equal(rejectRack.json().data.status, 'rejected');

  const rejectedDashboard = await fixture.app.inject({ method: 'GET', url: '/api/dashboard' });
  assert.equal(rejectedDashboard.statusCode, 200);
  assert.deepEqual(
    {
      total: rejectedDashboard.json().data.total,
      pending: rejectedDashboard.json().data.pending,
      approved: rejectedDashboard.json().data.approved,
      rejected: rejectedDashboard.json().data.rejected,
    },
    { total: 2, pending: 0, approved: 1, rejected: 1 },
  );
  assert.equal(rejectedDashboard.json().data.recentAssets.length, 2);

  const resetRack = await fixture.app.inject({
    method: 'PATCH',
    url: `/api/assets/${rack.id}/review`,
    payload: { status: 'pending', reviewComment: 'Semantic labels added; re-review requested' },
  });
  assert.equal(resetRack.json().data.status, 'pending');
  const approveRack = await fixture.app.inject({
    method: 'PATCH',
    url: `/api/assets/${rack.id}/review`,
    payload: { status: 'approved', reviewComment: 'Approved after revision' },
  });
  assert.equal(approveRack.json().data.status, 'approved');

  const createComposition = await fixture.app.inject({
    method: 'POST',
    url: '/api/compositions',
    payload: {
      name: 'Picking Cell',
      assets: [
        {
          assetId: robot.id,
          position: [0, 0, 0],
          rotation: [0, 90, 0],
          scale: [1, 1, 1],
        },
        {
          assetId: rack.id,
          position: [2.4, 0, -1],
          rotation: [0, 0, 0],
          scale: [1.2, 1.2, 1.2],
        },
      ],
    },
  });
  assert.equal(createComposition.statusCode, 201, createComposition.body);
  const composition = createComposition.json().data;
  assert.equal(composition.assets.length, 2);

  const updateComposition = await fixture.app.inject({
    method: 'PATCH',
    url: `/api/compositions/${composition.id}`,
    payload: {
      name: 'Picking Cell — tuned',
      assets: [
        { ...composition.assets[0], position: [0.5, 0, 0], rotation: [0, 45, 0] },
        composition.assets[1],
      ],
    },
  });
  assert.equal(updateComposition.statusCode, 200, updateComposition.body);
  assert.deepEqual(updateComposition.json().data.assets[0].rotation, [0, 45, 0]);

  await fixture.app.close();
  fixture.app = await buildApp(fixture.appOptions);
  const savedCompositions = await fixture.app.inject({ method: 'GET', url: '/api/compositions' });
  assert.equal(savedCompositions.statusCode, 200);
  assert.equal(savedCompositions.json().meta.total, 1);
  assert.equal(savedCompositions.json().data[0].name, 'Picking Cell — tuned');
  assert.deepEqual(savedCompositions.json().data[0].assets[0].position, [0.5, 0, 0]);
});

test('saved compositions prevent referenced assets from leaving approved review state', async (t) => {
  const fixture = await createFixture();
  t.after(async () => {
    await fixture.app.close().catch(() => undefined);
    await rm(fixture.root, { recursive: true, force: true });
  });

  const robot = await uploadAsset(fixture.app, {
    filename: 'review-lock-robot.usda',
    name: 'Review Lock Robot',
    category: '机器人',
    tags: ['review'],
    description: 'Referenced asset review consistency test',
  });
  const fixtureAsset = await uploadAsset(fixture.app, {
    filename: 'review-lock-fixture.usda',
    name: 'Review Lock Fixture',
    category: '工装',
    tags: ['review'],
    description: 'Second approved composition asset',
  });
  const unreferenced = await uploadAsset(fixture.app, {
    filename: 'unreferenced.usda',
    name: 'Unreferenced Asset',
    category: '传感器',
    tags: ['review'],
    description: 'Review transitions remain available when not in a composition',
  });

  for (const asset of [robot, fixtureAsset]) {
    const approve = await fixture.app.inject({
      method: 'PATCH',
      url: `/api/assets/${asset.id}/review`,
      payload: { status: 'approved', reviewComment: 'Approved for composition' },
    });
    assert.equal(approve.statusCode, 200, approve.body);
  }

  const createComposition = await fixture.app.inject({
    method: 'POST',
    url: '/api/compositions',
    payload: {
      name: 'Review consistency scene',
      assets: [
        {
          assetId: robot.id,
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        },
        {
          assetId: fixtureAsset.id,
          position: [1, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        },
      ],
    },
  });
  assert.equal(createComposition.statusCode, 201, createComposition.body);
  const composition = createComposition.json().data;

  const approvedAssetResponse = await fixture.app.inject({
    method: 'GET',
    url: `/api/assets/${robot.id}`,
  });
  const approvedAssetSnapshot = approvedAssetResponse.json().data;

  for (const status of ['rejected', 'pending']) {
    const blocked = await fixture.app.inject({
      method: 'PATCH',
      url: `/api/assets/${robot.id}/review`,
      payload: { status, reviewComment: `Should not become ${status}` },
    });
    assert.equal(blocked.statusCode, 409, blocked.body);
    assert.equal(blocked.json().error.code, 'ASSET_IN_USE');
    assert.equal(blocked.json().error.details.assetId, robot.id);
    assert.deepEqual(blocked.json().error.details.compositionIds, [composition.id]);
  }

  const assetAfterBlockedReviews = await fixture.app.inject({
    method: 'GET',
    url: `/api/assets/${robot.id}`,
  });
  assert.deepEqual(assetAfterBlockedReviews.json().data, approvedAssetSnapshot);

  const compositionsAfterBlockedReviews = await fixture.app.inject({
    method: 'GET',
    url: '/api/compositions',
  });
  assert.equal(compositionsAfterBlockedReviews.json().meta.total, 1);
  assert.deepEqual(compositionsAfterBlockedReviews.json().data[0], composition);

  const transitions = [
    ['approved', 'Pending to approved'],
    ['rejected', 'Approved to rejected'],
    ['approved', 'Rejected to approved'],
    ['pending', 'Approved to pending'],
  ];
  for (const [status, reviewComment] of transitions) {
    const review = await fixture.app.inject({
      method: 'PATCH',
      url: `/api/assets/${unreferenced.id}/review`,
      payload: { status, reviewComment },
    });
    assert.equal(review.statusCode, 200, review.body);
    assert.equal(review.json().data.status, status);
    assert.equal(review.json().data.reviewComment, reviewComment);
  }
});

test('strict validation returns structured errors and delete removes the stored upload', async (t) => {
  const fixture = await createFixture();
  t.after(async () => {
    await fixture.app.close().catch(() => undefined);
    await rm(fixture.root, { recursive: true, force: true });
  });

  const wrongFormat = multipartPayload({
    filename: 'robot.obj',
    content: 'v 0 0 0',
    fields: { name: 'Not USD' },
  });
  const wrongFormatResponse = await fixture.app.inject({
    method: 'POST',
    url: '/api/assets',
    headers: wrongFormat.headers,
    payload: wrongFormat.body,
  });
  assert.equal(wrongFormatResponse.statusCode, 415);
  assert.deepEqual(wrongFormatResponse.json().error.code, 'UNSUPPORTED_FORMAT');

  const invalidSignature = multipartPayload({
    filename: 'fake.usdz',
    content: 'this is not a zip archive',
  });
  const invalidSignatureResponse = await fixture.app.inject({
    method: 'POST',
    url: '/api/assets',
    headers: invalidSignature.headers,
    payload: invalidSignature.body,
  });
  assert.equal(invalidSignatureResponse.statusCode, 415);
  assert.equal(invalidSignatureResponse.json().error.code, 'INVALID_USD_FILE');

  const asset = await uploadAsset(fixture.app, {
    filename: 'delete-me.usda',
    name: 'Temporary robot',
    category: '机器人',
    tags: ['temporary'],
    description: 'Delete endpoint test',
  });
  const filePath = join(fixture.storageDir, asset.fileUrl.split('/').at(-1));
  assert.equal((await stat(filePath)).isFile(), true);

  const unknownField = await fixture.app.inject({
    method: 'PATCH',
    url: `/api/assets/${asset.id}`,
    payload: { internalUsdPrim: '/World/Robot' },
  });
  assert.equal(unknownField.statusCode, 400);
  assert.equal(unknownField.json().error.code, 'VALIDATION_ERROR');
  assert.deepEqual(unknownField.json().error.details.fields, ['internalUsdPrim']);

  const invalidReview = await fixture.app.inject({
    method: 'PATCH',
    url: `/api/assets/${asset.id}/review`,
    payload: { status: 'archived' },
  });
  assert.equal(invalidReview.statusCode, 400);
  assert.equal(invalidReview.json().error.code, 'VALIDATION_ERROR');

  const removeResponse = await fixture.app.inject({
    method: 'DELETE',
    url: `/api/assets/${asset.id}`,
  });
  assert.equal(removeResponse.statusCode, 204);
  await assert.rejects(stat(filePath), { code: 'ENOENT' });
  const missing = await fixture.app.inject({ method: 'GET', url: `/api/assets/${asset.id}` });
  assert.equal(missing.statusCode, 404);
  assert.equal(missing.json().error.code, 'NOT_FOUND');
});

test('production static hosting serves Vite assets and preserves structured API 404s', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'usd-asset-studio-static-'));
  const distDir = join(root, 'dist');
  await mkdir(join(distDir, 'assets'), { recursive: true });
  await writeFile(
    join(distDir, 'index.html'),
    '<!doctype html><html><body><div id="root">studio</div></body></html>',
  );
  await writeFile(join(distDir, 'assets', 'app.js'), 'globalThis.__STUDIO__ = true;');
  const app = await buildApp({
    dataDir: join(root, 'data'),
    storageDir: join(root, 'uploads'),
    publicDir: join(projectRoot, 'public'),
    distDir,
    logger: false,
  });
  t.after(async () => {
    await app.close();
    await rm(root, { recursive: true, force: true });
  });

  const asset = await app.inject({ method: 'GET', url: '/assets/app.js' });
  assert.equal(asset.statusCode, 200, asset.body);
  assert.match(asset.body, /__STUDIO__/);

  const clientRoute = await app.inject({
    method: 'GET',
    url: '/scene-composer/saved-scene',
    headers: { accept: 'text/html' },
  });
  assert.equal(clientRoute.statusCode, 200, clientRoute.body);
  assert.match(clientRoute.body, /<div id="root">studio<\/div>/);

  const api404 = await app.inject({
    method: 'GET',
    url: '/api/does-not-exist',
    headers: { accept: 'text/html' },
  });
  assert.equal(api404.statusCode, 404);
  assert.equal(api404.json().error.code, 'NOT_FOUND');
});
