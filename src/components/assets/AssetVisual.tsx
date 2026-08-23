import { Box, Bot, Camera, Factory, Gauge, Hand, Warehouse } from 'lucide-react';
import type { Asset } from '../../domain/models';

function categoryIcon(category: string) {
  if (category.includes('机器人')) return Bot;
  if (category.includes('传感')) return Camera;
  if (category.includes('末端')) return Hand;
  if (category.includes('工业')) return Factory;
  if (category.includes('场景')) return Warehouse;
  if (category.includes('数据')) return Gauge;
  return Box;
}

export function AssetVisual({ asset, compact = false }: { asset: Asset; compact?: boolean }) {
  const Icon = categoryIcon(asset.category);
  return (
    <div className={`asset-visual ${compact ? 'asset-visual-compact' : ''}`}>
      {asset.thumbnailUrl ? (
        <img src={asset.thumbnailUrl} alt={`${asset.name} 缩略图`} loading="lazy" />
      ) : (
        <div className="asset-placeholder">
          <Icon size={compact ? 28 : 44} strokeWidth={1.25} />
        </div>
      )}
      <span className="format-chip">.{asset.format.toUpperCase()}</span>
    </div>
  );
}
