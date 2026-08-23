import type {
  Asset,
  AssetFilters,
  AssetMetadataInput,
  DashboardData,
  ReviewInput,
  SceneAssetTransform,
  SceneComposition,
  UploadAssetInput,
} from '../domain/models';

interface ApiEnvelope<T> {
  data: T;
  meta?: { total: number };
}

interface ApiErrorEnvelope {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(message: string, status: number, code = 'REQUEST_FAILED', details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<ApiEnvelope<T>> {
  const headers = new Headers(init?.headers);
  if (init?.body && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(path, { ...init, headers });
  const payload = (await response.json().catch(() => ({}))) as ApiEnvelope<T> & ApiErrorEnvelope;

  if (!response.ok) {
    throw new ApiError(
      payload.error?.message ?? `请求失败 (${response.status})`,
      response.status,
      payload.error?.code,
      payload.error?.details,
    );
  }

  return payload;
}

function toQuery(filters: AssetFilters = {}) {
  const query = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value));
  });
  const encoded = query.toString();
  return encoded ? `?${encoded}` : '';
}

export const api = {
  async listAssets(filters?: AssetFilters) {
    const response = await request<Asset[]>(`/api/assets${toQuery(filters)}`);
    return { assets: response.data, total: response.meta?.total ?? response.data.length };
  },

  async getAsset(id: string) {
    return (await request<Asset>(`/api/assets/${encodeURIComponent(id)}`)).data;
  },

  async uploadAsset(input: UploadAssetInput) {
    const form = new FormData();
    // Metadata goes first so streaming multipart parsers can see it before the file part.
    form.append('name', input.name);
    form.append('category', input.category);
    form.append('tags', JSON.stringify(input.tags));
    form.append('description', input.description);
    form.append('file', input.file, input.file.name);
    return (await request<Asset>('/api/assets', { method: 'POST', body: form })).data;
  },

  async updateAsset(id: string, input: AssetMetadataInput) {
    return (
      await request<Asset>(`/api/assets/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      })
    ).data;
  },

  async reviewAsset(id: string, input: ReviewInput) {
    return (
      await request<Asset>(`/api/assets/${encodeURIComponent(id)}/review`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      })
    ).data;
  },

  async deleteAsset(id: string) {
    await request<{ id: string }>(`/api/assets/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  async getDashboard() {
    return (await request<DashboardData>('/api/dashboard')).data;
  },

  async listCompositions() {
    return (await request<SceneComposition[]>('/api/compositions')).data;
  },

  async createComposition(input: { name: string; assets: SceneAssetTransform[] }) {
    return (
      await request<SceneComposition>('/api/compositions', {
        method: 'POST',
        body: JSON.stringify(input),
      })
    ).data;
  },

  async updateComposition(id: string, input: { name: string; assets: SceneAssetTransform[] }) {
    return (
      await request<SceneComposition>(`/api/compositions/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      })
    ).data;
  },
};
