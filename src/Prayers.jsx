import React, {useEffect, useState} from 'react';
import NameEditor from './NameEditor.jsx';

const days = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];

export default function Prayers({api}) {
  const [prayers,setPrayers] = useState([]);
  const [name,setName] = useState('');
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  useEffect(()=>{api('prayers').then(setPrayers).catch(e=>setError(e.message)).finally(()=>setLoading(false));},[]);
  async function change(action) {
    if (busy) return;
    setBusy(true); setError('');
    try { await action(); } catch(e) { setError(e.message); } finally { setBusy(false); }
  }
  function add(e) {
    e.preventDefault();
    if (!name.trim()) return;
    change(async()=>{const prayer=await api('prayers',{name});setPrayers(old=>[...old,prayer]);setName('');});
  }
  async function rename(prayer,name) {
    const result=await api('rename',{kind:'prayer',id:prayer.id,name});
    setPrayers(old=>old.map(p=>p.id===prayer.id?{...p,name:result.name}:p));
  }
  function toggle(prayer,day) {
    change(async()=>{
      const result=await api('prayer-toggle',{id:prayer.id,day});
      setPrayers(old=>old.map(p=>p.id===prayer.id?{
        ...p,
        days:result.marked?[...p.days,day]:p.days.filter(d=>d!==day),
        total:p.total+(result.marked?1:0)
      }:p));
    });
  }
  function reset() {
    if (!window.confirm('¿Comenzar una nueva semana? Se desmarcarán los siete días y se conservará el historial.')) return;
    change(async()=>{await api('prayer-reset',{});setPrayers(old=>old.map(p=>({...p,days:[]})));});
  }
  function remove(prayer) {
    if (!window.confirm(`¿Eliminar «${prayer.name}» y su historial?`)) return;
    change(async()=>{await api('prayer-delete',{id:prayer.id});setPrayers(old=>old.filter(p=>p.id!==prayer.id));});
  }
  const weekly=prayers.reduce((sum,p)=>sum+p.days.length,0);
  return <>
    <section className="stats prayer-stats" aria-label="Resumen de oraciones"><article><span>Peticiones</span><strong>{prayers.length}</strong></article><article><span>Marcas de esta semana</span><strong>{weekly}<small>de {prayers.length*7} posibles</small></strong></article><article className="overall"><span>Progreso semanal <b>{prayers.length?Math.round(weekly/(prayers.length*7)*100):0}%</b></span><div className="progress-track"><i style={{width:(prayers.length?weekly/(prayers.length*7)*100:0)+'%'}}/></div><small>El acumulado se muestra en cada petición.</small></article></section>
    <section className="tracker prayers-page"><div className="tracker-heading"><div><h2>Mis oraciones</h2><p>Marca los días que ores por cada petición. Al desmarcar, el historial conserva esa oración.</p></div><span className="live-label">7 días por semana</span></div>
      {error&&<p role="alert" className="error">{error}</p>}
      {loading?<p role="status">Cargando tus oraciones…</p>:<div className="prayer-table-wrap"><table><colgroup><col className="activity-col"/>{days.map(day=><col key={day}/>)}</colgroup><thead><tr><th className="section-title" scope="col">PETICIONES <small>Acumulado individual</small></th>{days.map(day=><th key={day} scope="col"><abbr title={day}>{day.slice(0,3)}</abbr></th>)}</tr></thead><tbody>{prayers.map(prayer=><tr key={prayer.id}><th scope="row"><div className="activity"><span><NameEditor name={prayer.name} onSave={value=>rename(prayer,value)} disabled={busy}/><small>{prayer.days.length}/7 esta semana</small><strong className="prayer-count">{prayer.total} {prayer.total===1?'oración acumulada':'oraciones acumuladas'}</strong></span><button className="delete" disabled={busy} aria-label={'Eliminar '+prayer.name} onClick={()=>remove(prayer)}>×</button></div></th>{days.map((day,index)=>{const marked=prayer.days.includes(index+1);return <td key={day}><button className={'circle '+(marked?'checked':'')} style={{'--progress-color':'#249765'}} disabled={busy} aria-pressed={marked} aria-label={`${prayer.name}, ${day}`} onClick={()=>toggle(prayer,index+1)}>{marked?'✓':''}</button></td>;})}</tr>)}</tbody></table>{!prayers.length&&<p className="prayers-empty">Añade tu primera petición para comenzar a registrar tus oraciones.</p>}</div>}
      <form onSubmit={add}><label className="name-input"><span className="sr-only">Nueva petición de oración</span><input value={name} onChange={e=>setName(e.target.value)} maxLength={80} placeholder="Nueva petición de oración" disabled={busy||loading} required/></label><button className="primary" disabled={busy||loading||!name.trim()}>Añadir petición</button></form>
      <div className="bottom"><span>El historial acumulado se guarda automáticamente.</span><button className="reset" disabled={busy||!weekly} onClick={reset}>↻ Reiniciar semana</button></div>
    </section>
  </>;
}
