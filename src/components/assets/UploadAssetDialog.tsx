import { FileUp, ShieldCheck, UploadCloud } from 'lucide-react';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { ASSET_CATEGORIES } from '../../domain/models';
import { useStudioStore } from '../../state/studioStore';
import { formatBytes } from '../../utils/format';
import { Modal } from '../ui/Modal';
import {
  AssetMetadataForm,
  type AssetMetadataFormValue,
  normalizeTagText,
} from './AssetMetadataForm';

const EMPTY_METADATA: AssetMetadataFormValue = {
  name: '',
  category: ASSET_CATEGORIES[0],
  tagsText: '',
  description: '',
};

export function UploadAssetDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const uploadAsset = useStudioStore((state) => state.uploadAsset);
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [metadata, setMetadata] = useState<AssetMetadataFormValue>(EMPTY_METADATA);
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (open) return;
    setFile(null);
    setMetadata(EMPTY_METADATA);
    setSaving(false);
  }, [open]);

  const choose = (next: File | null) => {
    if (!next) return;
    setFile(next);
    if (!metadata.name) {
      setMetadata((current) => ({
        ...current,
        name: next.name.replace(/\.(usd|usda|usdc|usdz)$/i, ''),
      }));
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!file || !metadata.name.trim()) return;
    setSaving(true);
    try {
      await uploadAsset({
        name: metadata.name.trim(),
        category: metadata.category,
        tags: normalizeTagText(metadata.tagsText),
        description: metadata.description,
        file,
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
      open={open}
      onClose={onClose}
      title="上传仿真资产"
      eyebrow="上传资产"
      description="文件将保存至 Fastify 本地存储，元数据刷新后仍会保留。"
      wide
    >
      <form className="upload-form" onSubmit={submit}>
        <button
          className={`drop-zone ${dragging ? 'drop-zone-active' : ''} ${file ? 'drop-zone-ready' : ''}`}
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            choose(event.dataTransfer.files[0] ?? null);
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".usd,.usda,.usdc,.usdz"
            hidden
            onChange={(event) => choose(event.target.files?.[0] ?? null)}
          />
          {file ? <FileUp size={31} /> : <UploadCloud size={34} />}
          <strong>{file ? file.name : '拖放 USD / USDZ 到这里'}</strong>
          <span>{file ? `${formatBytes(file.size)} · 等待上传` : '或点击选择文件，支持 .usd / .usda / .usdc / .usdz'}</span>
        </button>

        <AssetMetadataForm value={metadata} disabled={saving} namePrefix="upload" onChange={setMetadata} />

        <div className="form-assurance">
          <ShieldCheck size={17} />
          <span>新资产默认进入 <strong>pending</strong>；服务端会校验扩展名、文件签名与大小。</span>
        </div>
        <div className="dialog-actions">
          <button className="button button-ghost" type="button" onClick={onClose}>取消</button>
          <button className="button button-primary" type="submit" disabled={!file || !metadata.name.trim() || saving}>
            {saving ? '正在持久化…' : '上传并登记'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
