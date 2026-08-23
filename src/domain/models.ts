export type AssetStatus = 'pending' | 'approved' | 'rejected';
export type AssetFormat = 'usd' | 'usda' | 'usdc' | 'usdz';
export type Vec3 = [number, number, number];

export interface Asset {
  id: string;
  name: string;
  originalName: string;
  format: AssetFormat;
  category: string;
  tags: string[];
  description: string;
  status: AssetStatus;
  fileUrl: string;
  thumbnailUrl: string | null;
  size: number;
  createdAt: string;
  updatedAt: string;
  reviewComment: string;
}

export interface AssetFilters {
  search?: string;
  category?: string;
  status?: AssetStatus | '';
  sort?: 'createdAt' | 'updatedAt' | 'name' | 'size';
  order?: 'asc' | 'desc';
}

export interface AssetMetadataInput {
  name: string;
  category: string;
  tags: string[];
  description: string;
}

export interface UploadAssetInput extends AssetMetadataInput {
  file: File;
}

export interface ReviewInput {
  status: AssetStatus;
  reviewComment: string;
}

export interface SceneAssetTransform {
  assetId: string;
  position: Vec3;
  /** Euler XYZ angles, stored in degrees for a readable JSON composition. */
  rotation: Vec3;
  scale: Vec3;
}

export interface SceneComposition {
  id: string;
  name: string;
  assets: SceneAssetTransform[];
  createdAt: string;
  updatedAt: string;
}

export interface DashboardSlice {
  name: string;
  value: number;
}

export interface DashboardData {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  byCategory: DashboardSlice[];
  byStatus: DashboardSlice[];
  recentAssets?: Asset[];
}

export const EMPTY_DASHBOARD: DashboardData = {
  total: 0,
  pending: 0,
  approved: 0,
  rejected: 0,
  byCategory: [],
  byStatus: [],
};

export const ASSET_CATEGORIES = [
  '机器人本体',
  '末端执行器',
  '传感器',
  '仿真场景',
  '工业设施',
  '数据采集道具',
  '其他',
] as const;

export const STATUS_LABELS: Record<AssetStatus, string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已驳回',
};
