import { create } from 'zustand';
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
import { EMPTY_DASHBOARD } from '../domain/models';
import { ApiError, api } from '../services/api';

interface Notice {
  id: number;
  tone: 'success' | 'error' | 'info';
  message: string;
}

interface StudioState {
  assets: Asset[];
  assetTotal: number;
  dashboard: DashboardData;
  compositions: SceneComposition[];
  loading: boolean;
  notice: Notice | null;
  filters: AssetFilters;
  setFilters: (filters: AssetFilters) => void;
  clearNotice: () => void;
  refreshAssets: (filters?: AssetFilters) => Promise<void>;
  refreshDashboard: () => Promise<void>;
  refreshCompositions: () => Promise<void>;
  bootstrap: () => Promise<void>;
  uploadAsset: (input: UploadAssetInput) => Promise<Asset>;
  updateAsset: (id: string, input: AssetMetadataInput) => Promise<Asset>;
  reviewAsset: (id: string, input: ReviewInput) => Promise<Asset>;
  deleteAsset: (id: string) => Promise<void>;
  saveComposition: (
    input: { name: string; assets: SceneAssetTransform[] },
    id?: string,
  ) => Promise<SceneComposition>;
}

let noticeSequence = 0;

function errorMessage(error: unknown) {
  if (error instanceof ApiError && error.code === 'ASSET_IN_USE') {
    return '该资产已被保存的场景组合引用，请先调整或删除组合后再修改审核状态';
  }
  return error instanceof Error ? error.message : '发生未知错误，请重试';
}

export const useStudioStore = create<StudioState>((set, get) => ({
  assets: [],
  assetTotal: 0,
  dashboard: EMPTY_DASHBOARD,
  compositions: [],
  loading: false,
  notice: null,
  filters: { sort: 'createdAt', order: 'desc' },

  setFilters: (filters) => set({ filters }),
  clearNotice: () => set({ notice: null }),

  refreshAssets: async (nextFilters) => {
    const filters = nextFilters ?? get().filters;
    set({ loading: true, filters });
    try {
      const result = await api.listAssets(filters);
      set({ assets: result.assets, assetTotal: result.total, loading: false });
    } catch (error) {
      set({
        loading: false,
        notice: { id: ++noticeSequence, tone: 'error', message: errorMessage(error) },
      });
      throw error;
    }
  },

  refreshDashboard: async () => {
    try {
      set({ dashboard: await api.getDashboard() });
    } catch (error) {
      set({ notice: { id: ++noticeSequence, tone: 'error', message: errorMessage(error) } });
      throw error;
    }
  },

  refreshCompositions: async () => {
    try {
      set({ compositions: await api.listCompositions() });
    } catch (error) {
      set({ notice: { id: ++noticeSequence, tone: 'error', message: errorMessage(error) } });
      throw error;
    }
  },

  bootstrap: async () => {
    set({ loading: true });
    const results = await Promise.allSettled([
      get().refreshAssets(),
      get().refreshDashboard(),
      get().refreshCompositions(),
    ]);
    set({ loading: false });
    if (results.every((result) => result.status === 'rejected')) {
      set({
        notice: {
          id: ++noticeSequence,
          tone: 'error',
          message: '无法连接本地数据服务，请确认 Fastify 已启动',
        },
      });
    }
  },

  uploadAsset: async (input) => {
    try {
      const asset = await api.uploadAsset(input);
      await Promise.all([get().refreshAssets(), get().refreshDashboard()]);
      set({
        notice: { id: ++noticeSequence, tone: 'success', message: `${asset.name} 已上传并进入待审核队列` },
      });
      return asset;
    } catch (error) {
      set({ notice: { id: ++noticeSequence, tone: 'error', message: errorMessage(error) } });
      throw error;
    }
  },

  updateAsset: async (id, input) => {
    try {
      const asset = await api.updateAsset(id, input);
      await Promise.all([get().refreshAssets(), get().refreshDashboard()]);
      set({ notice: { id: ++noticeSequence, tone: 'success', message: '资产元数据已保存' } });
      return asset;
    } catch (error) {
      set({ notice: { id: ++noticeSequence, tone: 'error', message: errorMessage(error) } });
      throw error;
    }
  },

  reviewAsset: async (id, input) => {
    try {
      const asset = await api.reviewAsset(id, input);
      await Promise.all([get().refreshAssets(), get().refreshDashboard()]);
      set({
        notice: {
          id: ++noticeSequence,
          tone: 'success',
          message: `${asset.name} 的审核状态已更新`,
        },
      });
      return asset;
    } catch (error) {
      set({ notice: { id: ++noticeSequence, tone: 'error', message: errorMessage(error) } });
      throw error;
    }
  },

  deleteAsset: async (id) => {
    try {
      await api.deleteAsset(id);
      await Promise.all([get().refreshAssets(), get().refreshDashboard(), get().refreshCompositions()]);
      set({ notice: { id: ++noticeSequence, tone: 'success', message: '资产已删除' } });
    } catch (error) {
      set({ notice: { id: ++noticeSequence, tone: 'error', message: errorMessage(error) } });
      throw error;
    }
  },

  saveComposition: async (input, id) => {
    try {
      const composition = id
        ? await api.updateComposition(id, input)
        : await api.createComposition(input);
      await get().refreshCompositions();
      set({ notice: { id: ++noticeSequence, tone: 'success', message: '场景组合配置已持久化' } });
      return composition;
    } catch (error) {
      set({ notice: { id: ++noticeSequence, tone: 'error', message: errorMessage(error) } });
      throw error;
    }
  },
}));
