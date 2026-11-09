import { useState } from 'react';
import type { Profile } from '../shared/types';
import { hasPermission } from '../auth/permissions';
import { StateBlock } from '../components/StateBlock';
import { useLoad } from '../query/useLoad';
import { documentsService } from '../services/documentsService';
import { documentUrl } from '../shared/documentPresentation';
import { DocumentEditor } from './DocumentEditor';

export function EquipmentDocuments({ equipment, profile }: {
  equipment: { id: string; company_id: string };
  profile: Profile | null | undefined;
}) {
  if (!profile || !hasPermission(profile, 'documents.read')) return null;
  return <EquipmentDocumentList key={equipment.id} equipment={equipment} profile={profile} />;
}

function EquipmentDocumentList({ equipment, profile }: {
  equipment: { id: string; company_id: string };
  profile: Profile;
}) {
  const [adding, setAdding] = useState(false);
  const documents = useLoad(() => documentsService.linked('Equipo', equipment.id), [equipment.id], []);
  const canAdd = profile.company_id === equipment.company_id && hasPermission(profile, 'documents.create');

  return <section className="card">
    <header className="actions">
      <h3>Documentos del equipo</h3>
      {canAdd && <button type="button" onClick={() => setAdding(true)}>Añadir documento</button>}
    </header>
    <StateBlock loading={documents.loading} error={documents.error} retry={documents.reload}>
      {documents.data.length === 0 && <p className="large-note">Este equipo aún no tiene documentos vinculados.</p>}
      <div className="compact-list">
        {documents.data.map(document => {
          const url = documentUrl(document);
          return <article className="record-surface" key={document.id}>
            <strong>{document.title}</strong>
            <p>{document.type}</p>
            {url ? <a href={url} target="_blank" rel="noopener noreferrer">Abrir documento</a> : <p>Archivo no disponible</p>}
          </article>;
        })}
      </div>
    </StateBlock>
    {adding && canAdd && <DocumentEditor
      profile={profile}
      relatedType="Equipo"
      relatedId={equipment.id}
      onClose={() => setAdding(false)}
      onSaved={() => { setAdding(false); void documents.reload(); }}
    />}
  </section>;
}
