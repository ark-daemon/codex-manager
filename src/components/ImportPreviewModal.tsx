import { ProfileImportPreview } from "../shared/types";
import { copyForLanguage, formatMessage } from "../i18n";

type UiCopy = ReturnType<typeof copyForLanguage>;

interface ImportPreviewModalProps {
  preview: ProfileImportPreview;
  copy: UiCopy;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ImportPreviewModal({
  preview,
  copy,
  onConfirm,
  onCancel
}: ImportPreviewModalProps) {
  const count = preview.profiles.length;
  const titleTemplate = count === 1 ? copy.importPreview.title : copy.importPreview.titlePlural;
  const confirmTemplate = count === 1 ? copy.importPreview.confirm : copy.importPreview.confirmPlural;
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={copy.importPreview.dialogLabel}>
      <div className="modal-card import-preview-modal">
        <h3>{formatMessage(titleTemplate, { count })}</h3>
        <p className="import-preview-subtitle">
          {copy.importPreview.subtitle}
        </p>
        <ul className="import-preview-list">
          {preview.profiles.map((p, i) => (
            <li key={i} className="import-preview-entry">
              <span className="import-preview-name">{p.name}</span>
              {p.email && <span className="import-preview-email">{p.email}</span>}
            </li>
          ))}
        </ul>
        <div className="modal-actions">
          <button onClick={onConfirm}>{formatMessage(confirmTemplate, { count })}</button>
          <button onClick={onCancel} className="danger">{copy.actions.cancel}</button>
        </div>
      </div>
    </div>
  );
}
