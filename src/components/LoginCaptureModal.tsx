import { Check } from "lucide-react";
import { ProfileLoginCapture } from "../shared/types";
import { copyForLanguage } from "../i18n";

type UiCopy = ReturnType<typeof copyForLanguage>;
type LoginFlowStatus = "idle" | "ready" | "waiting" | "error" | "saved";

interface LoginModalState {
  open: boolean;
  captureId?: string;
  authorizationUrl?: string;
  status: LoginFlowStatus;
  message?: string;
  capture?: ProfileLoginCapture;
  profileName?: string;
}

interface LoginCaptureModalProps {
  loginModal: LoginModalState;
  copy: UiCopy;
  onAddAnother: () => void;
  onDone: () => void;
  onOpenLoginPage: () => void;
  onSave: () => void;
  onCancel: () => void;
  onChangeProfileName: (name: string) => void;
}

export function LoginCaptureModal({
  loginModal,
  copy,
  onAddAnother,
  onDone,
  onOpenLoginPage,
  onSave,
  onCancel,
  onChangeProfileName
}: LoginCaptureModalProps) {
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Add account login flow">
      <div className="modal-card">
        <div className="modal-steps" aria-hidden="true">
          <span className="modal-step-dot active" />
          <span className={`modal-step-dot ${loginModal.capture || loginModal.status === "saved" ? "active" : ""}`} />
        </div>
        {loginModal.status === "saved" ? (
          <>
            <div className="login-saved-icon" aria-hidden="true">
              <Check size={28} strokeWidth={2.5} />
            </div>
            <h3>Account added!</h3>
            <p className="login-saved-name">{loginModal.message}</p>
            <p className="modal-status ready">Add another account, or click Done to finish.</p>
            <div className="modal-actions login-saved-actions">
              <button onClick={onAddAnother}>Add Another</button>
              <button onClick={onDone}>{copy.login.done}</button>
            </div>
          </>
        ) : (
          <>
            <h3>{copy.login.title}</h3>
            {loginModal.capture && (
              <>
                <p className="modal-authenticated-email">
                  Authenticated as {loginModal.capture.accountEmail ?? "your account"}
                </p>
                <label className="modal-field">
                  <span>{copy.login.profileName}</span>
                  <input
                    value={loginModal.profileName ?? ""}
                    onChange={(event) => onChangeProfileName(event.target.value)}
                    autoFocus
                  />
                  <small className="modal-field-helper">How this account appears in your list</small>
                </label>
              </>
            )}
            {!loginModal.capture && (
              <>
                <p>{copy.login.description}</p>
                {!(loginModal.status === "ready" && loginModal.authorizationUrl) && (
                  <p className={`modal-status ${loginModal.status}`}>{loginModal.message}</p>
                )}
                {loginModal.authorizationUrl && (
                  <p className="modal-url">Ready - click Open Login Page to continue.</p>
                )}
              </>
            )}
            <div className="modal-actions">
              {loginModal.capture ? (
                <button onClick={onSave}>{copy.login.save}</button>
              ) : (
                <button onClick={onOpenLoginPage} disabled={loginModal.status === "waiting"}>
                  {copy.login.open}
                </button>
              )}
              <button onClick={onCancel} className="danger">{copy.actions.cancel}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
