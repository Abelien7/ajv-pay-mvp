import { FormEvent, useEffect, useState } from 'react';
import { adminApi } from './adminApi';
import type { AdminCredentials, CardFeature, ListItem, NewsPost } from './types';

/**
 * Espace superadmin pour piloter le contenu du site vitrine (actualités,
 * pays couverts, réseaux de paiement, piliers AJV Card) sans jamais repasser
 * par le code — le site public lit ces mêmes données via /site-content/*
 * (voir Landing.tsx).
 */
export function AdminContentPanel({ credentials }: { credentials: AdminCredentials }) {
  const [section, setSection] = useState<'news' | 'countries' | 'networks' | 'ajv-card'>('news');

  return (
    <div>
      <div className="content-tabs">
        <button
          className={`content-tab ${section === 'news' ? 'content-tab-active' : ''}`}
          onClick={() => setSection('news')}
        >
          Actualités
        </button>
        <button
          className={`content-tab ${section === 'countries' ? 'content-tab-active' : ''}`}
          onClick={() => setSection('countries')}
        >
          Pays couverts
        </button>
        <button
          className={`content-tab ${section === 'networks' ? 'content-tab-active' : ''}`}
          onClick={() => setSection('networks')}
        >
          Réseaux de paiement
        </button>
        <button
          className={`content-tab ${section === 'ajv-card' ? 'content-tab-active' : ''}`}
          onClick={() => setSection('ajv-card')}
        >
          AJV Card
        </button>
      </div>

      {section === 'news' && <NewsSection credentials={credentials} />}
      {section === 'ajv-card' && <CardFeatureSection credentials={credentials} />}
      {section === 'countries' && (
        <ListItemSection
          credentials={credentials}
          title="Pays couverts"
          singular="pays"
          list={adminApi.listCountries}
          create={adminApi.createCountry}
          update={adminApi.updateCountry}
          remove={adminApi.deleteCountry}
        />
      )}
      {section === 'networks' && (
        <ListItemSection
          credentials={credentials}
          title="Réseaux de paiement"
          singular="réseau"
          list={adminApi.listNetworks}
          create={adminApi.createNetwork}
          update={adminApi.updateNetwork}
          remove={adminApi.deleteNetwork}
        />
      )}
    </div>
  );
}

function NewsSection({ credentials }: { credentials: AdminCredentials }) {
  const [items, setItems] = useState<NewsPost[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [creating, setCreating] = useState(false);

  async function load() {
    try {
      setItems(await adminApi.listNews(credentials));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await adminApi.createNews(credentials, { title, body, imageUrl: imageUrl || undefined });
      setTitle('');
      setBody('');
      setImageUrl('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Création impossible');
    } finally {
      setCreating(false);
    }
  }

  async function togglePublish(item: NewsPost) {
    setBusyId(item.id);
    try {
      await adminApi.updateNews(credentials, item.id, { isPublished: !item.is_published });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Modification impossible');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(item: NewsPost) {
    if (!window.confirm(`Supprimer l'actualité « ${item.title} » ?`)) return;
    setBusyId(item.id);
    try {
      await adminApi.deleteNews(credentials, item.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Suppression impossible');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      {error && <p className="error-banner">Erreur : {error}</p>}

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 className="section-title" style={{ marginTop: 0 }}>Nouvelle actualité</h3>
        <form onSubmit={handleCreate} className="form-stack">
          <label className="field">
            Titre
            <input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </label>
          <label className="field">
            Contenu
            <textarea value={body} onChange={(e) => setBody(e.target.value)} required rows={3} />
          </label>
          <label className="field">
            URL d'image (optionnel — un lien déjà hébergé ailleurs)
            <input
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://…"
            />
          </label>
          <button type="submit" disabled={creating} className="btn btn-primary btn-block">
            {creating ? 'Publication…' : 'Ajouter (en brouillon)'}
          </button>
        </form>
      </div>

      {items.length === 0 ? (
        <div className="card">
          <p className="empty-state">Aucune actualité pour le moment.</p>
        </div>
      ) : (
        <div className="stack">
          {items.map((item) => (
            <div key={item.id} className="card">
              <div className="payment-card-top">
                <div>
                  <strong>{item.title}</strong>{' '}
                  <span className={`badge ${item.is_published ? 'badge-succeeded' : 'badge-processing'}`}>
                    {item.is_published ? 'Publié' : 'Brouillon'}
                  </span>
                </div>
                <span className="payment-meta">{new Date(item.created_at).toLocaleString('fr-FR')}</span>
              </div>
              <p style={{ margin: '8px 0' }}>{item.body}</p>
              {item.image_url && <p className="payment-meta">Image : {item.image_url}</p>}
              <div className="actions-row">
                <button
                  onClick={() => togglePublish(item)}
                  disabled={busyId === item.id}
                  className="btn btn-secondary btn-sm"
                >
                  {item.is_published ? 'Repasser en brouillon' : 'Publier'}
                </button>
                <button
                  onClick={() => handleDelete(item)}
                  disabled={busyId === item.id}
                  className="btn btn-danger btn-sm"
                >
                  Supprimer
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CardFeatureSection({ credentials }: { credentials: AdminCredentials }) {
  const [items, setItems] = useState<CardFeature[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [creating, setCreating] = useState(false);

  async function load() {
    try {
      setItems(await adminApi.listCardFeatures(credentials));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await adminApi.createCardFeature(credentials, { title, body, displayOrder: items.length });
      setTitle('');
      setBody('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Création impossible');
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(item: CardFeature) {
    setBusyId(item.id);
    try {
      await adminApi.updateCardFeature(credentials, item.id, { isActive: !item.is_active });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Modification impossible');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(item: CardFeature) {
    if (!window.confirm(`Supprimer le pilier « ${item.title} » ?`)) return;
    setBusyId(item.id);
    try {
      await adminApi.deleteCardFeature(credentials, item.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Suppression impossible');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      {error && <p className="error-banner">Erreur : {error}</p>}
      <p className="empty-state" style={{ marginBottom: 16 }}>
        Ces piliers s'affichent dans la section « AJV Card » de la vitrine publique. Un pilier
        désactivé disparaît du site mais reste modifiable ici.
      </p>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 className="section-title" style={{ marginTop: 0 }}>Nouveau pilier</h3>
        <form onSubmit={handleCreate} className="form-stack">
          <label className="field">
            Titre
            <input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </label>
          <label className="field">
            Description
            <textarea value={body} onChange={(e) => setBody(e.target.value)} required rows={3} />
          </label>
          <button type="submit" disabled={creating} className="btn btn-primary btn-block">
            {creating ? 'Ajout…' : 'Ajouter'}
          </button>
        </form>
      </div>

      {items.length === 0 ? (
        <div className="card">
          <p className="empty-state">Aucun pilier pour le moment.</p>
        </div>
      ) : (
        <div className="stack">
          {items.map((item) => (
            <div key={item.id} className="card">
              <div className="payment-card-top">
                <div>
                  <strong>{item.title}</strong>{' '}
                  <span className={`badge ${item.is_active ? 'badge-succeeded' : 'badge-processing'}`}>
                    {item.is_active ? 'Actif' : 'Inactif'}
                  </span>
                </div>
              </div>
              <p style={{ margin: '8px 0' }}>{item.body}</p>
              <div className="actions-row">
                <button
                  onClick={() => toggleActive(item)}
                  disabled={busyId === item.id}
                  className="btn btn-secondary btn-sm"
                >
                  {item.is_active ? 'Désactiver' : 'Activer'}
                </button>
                <button
                  onClick={() => handleDelete(item)}
                  disabled={busyId === item.id}
                  className="btn btn-danger btn-sm"
                >
                  Supprimer
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ListItemSection({
  credentials,
  title,
  singular,
  list,
  create,
  update,
  remove,
}: {
  credentials: AdminCredentials;
  title: string;
  singular: string;
  list: (creds: AdminCredentials) => Promise<ListItem[]>;
  create: (creds: AdminCredentials, payload: { name?: string }) => Promise<ListItem>;
  update: (creds: AdminCredentials, id: string, payload: { isActive?: boolean }) => Promise<ListItem>;
  remove: (creds: AdminCredentials, id: string) => Promise<unknown>;
}) {
  const [items, setItems] = useState<ListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  async function load() {
    try {
      setItems(await list(credentials));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await create(credentials, { name });
      setName('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Création impossible');
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(item: ListItem) {
    setBusyId(item.id);
    try {
      await update(credentials, item.id, { isActive: !item.is_active });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Modification impossible');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(item: ListItem) {
    if (!window.confirm(`Supprimer « ${item.name} » ?`)) return;
    setBusyId(item.id);
    try {
      await remove(credentials, item.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Suppression impossible');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      {error && <p className="error-banner">Erreur : {error}</p>}

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 className="section-title" style={{ marginTop: 0 }}>Ajouter un {singular}</h3>
        <form onSubmit={handleCreate} className="form-row" style={{ display: 'flex', gap: 8 }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={`Nom du ${singular}`}
            required
            style={{ flex: 1 }}
          />
          <button type="submit" disabled={creating} className="btn btn-primary">
            {creating ? '…' : 'Ajouter'}
          </button>
        </form>
      </div>

      {items.length === 0 ? (
        <div className="card">
          <p className="empty-state">Aucun {singular} pour le moment.</p>
        </div>
      ) : (
        <div className="stack">
          {items.map((item) => (
            <div key={item.id} className="card payment-card-top">
              <div>
                <strong>{item.name}</strong>{' '}
                <span className={`badge ${item.is_active ? 'badge-succeeded' : 'badge-processing'}`}>
                  {item.is_active ? 'Actif' : 'Inactif'}
                </span>
              </div>
              <div className="actions-row">
                <button
                  onClick={() => toggleActive(item)}
                  disabled={busyId === item.id}
                  className="btn btn-secondary btn-sm"
                >
                  {item.is_active ? 'Désactiver' : 'Activer'}
                </button>
                <button
                  onClick={() => handleDelete(item)}
                  disabled={busyId === item.id}
                  className="btn btn-danger btn-sm"
                >
                  Supprimer
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
