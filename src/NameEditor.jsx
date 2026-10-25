import React, {useState} from 'react';

export default function NameEditor({name,onSave,disabled}) {
  const [editing,setEditing]=useState(false);
  const [draft,setDraft]=useState(name);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  async function save(e) {
    e.preventDefault();
    const next=draft.trim();
    if (!next) return;
    if (next===name) { setEditing(false); return; }
    setSaving(true); setError('');
    try { await onSave(next); setEditing(false); }
    catch(err) { setError(err.message); }
    finally { setSaving(false); }
  }
  if (!editing) return <span className="editable-name"><span>{name}</span><button type="button" className="edit-name" disabled={disabled} aria-label={'Editar nombre de '+name} onClick={()=>{setDraft(name);setError('');setEditing(true);}}>✎</button></span>;
  return <form className="name-editor" onSubmit={save}><input aria-label="Editar nombre" autoFocus value={draft} onChange={e=>setDraft(e.target.value)} maxLength={80} disabled={saving}/><button type="submit" className="edit-name" disabled={saving||!draft.trim()} aria-label="Guardar nombre">✓</button><button type="button" className="edit-name" disabled={saving} aria-label="Cancelar edición" onClick={()=>setEditing(false)}>×</button>{error&&<span className="edit-error" role="alert">{error}</span>}</form>;
}
