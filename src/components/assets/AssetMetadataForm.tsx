import { ASSET_CATEGORIES, type AssetMetadataInput } from '../../domain/models';

export type AssetMetadataFormValue = Omit<AssetMetadataInput, 'tags'> & {
  tagsText: string;
};

export function normalizeTagText(value: string): string[] {
  const tags: string[] = [];
  const seen = new Set<string>();

  for (const part of value.split(/[,，]/)) {
    const tag = part.trim();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
    if (tags.length === 12) break;
  }

  return tags;
}

interface AssetMetadataFormProps {
  value: AssetMetadataFormValue;
  disabled?: boolean;
  namePrefix?: string;
  onChange: (value: AssetMetadataFormValue) => void;
}

export function AssetMetadataForm({ value, disabled, namePrefix = 'asset', onChange }: AssetMetadataFormProps) {
  const patch = <K extends keyof AssetMetadataFormValue>(key: K, next: AssetMetadataFormValue[K]) => {
    onChange({ ...value, [key]: next });
  };

  return (
    <div className="form-grid">
      <label className="field field-span-2">
        <span>资产名称</span>
        <input
          name={`${namePrefix}-name`}
          value={value.name}
          disabled={disabled}
          maxLength={100}
          placeholder="例如：AMR 移动底盘"
          onChange={(event) => patch('name', event.target.value)}
          required
        />
      </label>
      <label className="field">
        <span>业务分类</span>
        <select
          name={`${namePrefix}-category`}
          value={value.category}
          disabled={disabled}
          onChange={(event) => patch('category', event.target.value)}
        >
          {ASSET_CATEGORIES.map((category) => <option key={category}>{category}</option>)}
        </select>
      </label>
      <label className="field">
        <span>标签 <small>用逗号分隔</small></span>
        <input
          name={`${namePrefix}-tags`}
          value={value.tagsText}
          disabled={disabled}
          maxLength={240}
          placeholder="ROS 2, Isaac Sim, AMR"
          onChange={(event) => patch('tagsText', event.target.value)}
        />
      </label>
      <label className="field field-span-2">
        <span>资产描述</span>
        <textarea
          name={`${namePrefix}-description`}
          value={value.description}
          disabled={disabled}
          maxLength={1000}
          rows={4}
          placeholder="说明资产在机器人仿真、训练或数据采集中的用途…"
          onChange={(event) => patch('description', event.target.value)}
        />
      </label>
    </div>
  );
}
