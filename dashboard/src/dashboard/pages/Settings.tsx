import { FormEvent, useState } from 'react';
import { dashboardApi } from '../../dashboardApi';
import { useMerchant } from '../MerchantContext';

export function Settings() {
  const { me, reload } = useMerchant();
  const [webhookUrlInput, setWebhookUrlInput] = useState(me?.webhook_url ?? '');
  const [savingWebhook, setSavingWebhook] = useState(false);
  const [webhookError, setWebhookError] = useState<string | null>(null);
  const [webhookSuccess, setWebhookSuccess] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  async function handleSaveWebhookUrl(e: FormEvent) {
    e.preventDefault();
    setSavingWebhook(true);
    setWebhookError(null);
    setWebhookSuccess(null);
    try {
      await dashboardApi.updateWebhookUrl(webhookUrlInput);
      await reload();
      setWebhookSuccess('URL de webhook enregistrée.');
    } catch (err) {
      setWebhookError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setSavingWebhook(false);
    }
  }

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    setSavingPassword(true);
    setPasswordError(null);
    setPasswordSuccess(null);
    try {
      await dashboardApi.changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setPasswordSuccess('Mot de passe modifié avec succès.');
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <div className="stack">
      <h1 className="page-title">Paramètres</h1>

      <div className="card">
        <h2 className="section-title">Webhook</h2>
        <p className="subtitle" style={{ margin: '0 0 16px' }}>
          URL appelée par AJV Pay à chaque paiement confirmé ou échoué.
        </p>
        {webhookError && <p className="error-banner">Erreur : {webhookError}</p>}
        {webhookSuccess && <p className="success-banner">{webhookSuccess}</p>}
        <form onSubmit={handleSaveWebhookUrl} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <label className="field" style={{ flex: 1 }}>
            URL de webhook
            <input
              value={webhookUrlInput}
              onChange={(e) => setWebhookUrlInput(e.target.value)}
              placeholder="https://votre-site.com/webhooks/ajvpay"
            />
          </label>
          <button type="submit" disabled={savingWebhook} className="btn btn-primary">
            {savingWebhook ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </form>
      </div>

      <div className="card">
        <h2 className="section-title">Mot de passe</h2>
        {passwordError && <p className="error-banner">Erreur : {passwordError}</p>}
        {passwordSuccess && <p className="success-banner">{passwordSuccess}</p>}
        <form onSubmit={handleChangePassword} className="form-stack" style={{ maxWidth: 360 }}>
          <label className="field">
            Mot de passe actuel
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </label>
          <label className="field">
            Nouveau mot de passe
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={8}
              required
            />
          </label>
          <button type="submit" disabled={savingPassword} className="btn btn-primary">
            {savingPassword ? 'Modification…' : 'Modifier le mot de passe'}
          </button>
        </form>
      </div>
    </div>
  );
}
