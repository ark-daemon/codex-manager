import { ProfileImportPreview } from "../shared/types";
import { copyForLanguage } from "../i18n";

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
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Import preview">
      <div className="modal-card import-preview-modal">
        <h3>Import {count} profile{count === 1 ? "" : "s"}?</h3>
        <p className="import-preview-subtitle">
          Found in the export file. All profiles will be set to <strong>READY</strong> - click <strong>USE</strong> on any profile to activate it.
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
          <button onClick={onConfirm}>Import {count} profile{count === 1 ? "" : "s"}</button>
          <button onClick={onCancel} className="danger">{copy.actions.cancel}</button>
        </div>
      </div>
    </div>
  );
}
