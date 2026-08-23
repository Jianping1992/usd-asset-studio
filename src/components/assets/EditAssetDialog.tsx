import { type FormEvent, useEffect, useState } from 'react';
import type { Asset } from '../../domain/models';
import { useStudioStore } from '../../state/studioStore';
import { Modal } from '../ui/Modal';
import {
  AssetMetadataForm,
  type AssetMetadataFormValue,
  normalizeTagText,
} from './AssetMetadataForm';

export function EditAssetDialog({ asset, onClose }: { asset: Asset | null; onClose: () => void }) {
  const updateAsset = useStudioStore((state) => state.updateAsset);
  const [value, setValue] = useState<AssetMetadataFormValue>({
    name: '',
    category: '',
    tagsText: '',
    description: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!asset) return;
    setValue({
      name: asset.name,
      category: asset.category,
      tagsText: asset.tags.join(', '),
      description: asset.description,
    });
  }, [asset]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!asset || !value.name.trim()) return;
    setSaving(true);
    try {
      await updateAsset(asset.id, {
        name: value.name.trim(),
        category: value.category,
        tags: normalizeTagText(value.tagsText),
        description: value.description,
      });
      onClose();
    } catch {
      // The store owns user-facing API error toasts.
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={Boolean(asset)}
      onClose={onClose}
      title="编辑资产元数据"
      eyebrow="资产元数据"
      description={asset ? `原始文件：${asset.originalName}` : undefined}
      wide
    >
      <form onSubmit={submit}>
        <AssetMetadataForm value={value} disabled={saving} namePrefix="edit" onChange={setValue} />
        <div className="dialog-actions">
          <button className="button button-ghost" type="button" onClick={onClose}>取消</button>
          <button className="button button-primary" type="submit" disabled={!value.name.trim() || saving}>
            {saving ? '保存中…' : '保存元数据'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
