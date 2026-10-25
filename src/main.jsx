import React, {useEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import './style.css';
import './goals.css';
import Goals from './Goals.jsx';
import Prayers from './Prayers.jsx';
import NameEditor from './NameEditor.jsx';

const progressColors = ['#cbd5e1','#e05252','#e66f42','#e69a26','#d8b62b','#9baa32','#58a448','#249765'];
const weekdays = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
async function api(path, data) {
  const response = await fetch('/api/'+path, data === undefined ? {} : {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || 'No se pudo guardar.');
  return value;
}
function App(){
  const [tab,setTab]=useState('routine');
  const [items,setItems]=useState([]), [loading,setLoading]=useState(true), [error,setError]=useState('');
  const [name,setName]=useState(''), [category,setCategory]=useState('habit'), [busy,setBusy]=useState(false);
  const [reset,setReset]=useState(false), [deleting,setDeleting]=useState(null);
  const lock=useRef(false), dialog=useRef(null), previousFocus=useRef(null);
  const modal=Boolean(reset||deleting);
  useEffect(()=>{api('activities').then(setItems).catch(()=>setError('No pudimos conectar con el servidor. Recarga para volver a intentar.')).finally(()=>setLoading(false));},[]);
  useEffect(()=>{if(modal){previousFocus.current=document.activeElement;dialog.current?.focus();}else previousFocus.current?.focus();},[modal]);
  async function mutate(action){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await action();}catch(e){setError(e.message);}finally{lock.current=false;setBusy(false);}}
  function toggle(item,day){mutate(async()=>{await api('toggle',{id:item.id,day});const marked=item.days.includes(day);const days=marked?item.days.filter(d=>d!==day):[...item.days,day];setItems(old=>old.map(i=>i.id===item.id?{...i,days}:i));});}
  async function rename(item,name){const result=await api('rename',{kind:'activity',id:item.id,name});setItems(old=>old.map(i=>i.id===item.id?{...i,name:result.name}:i));}
  function add(e){e.preventDefault();if(!name.trim())return;mutate(async()=>{const item=await api('activities',{name,category});setItems(old=>[...old,item]);setName('');});}
  function close(){if(busy)return;setReset(false);setDeleting(null);}
  function trap(e){if(e.key==='Escape')close();if(e.key==='Tab'){const nodes=dialog.current.querySelectorAll('button:not(:disabled)');if(!nodes.length){e.preventDefault();return;}const first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){e.preventDefault();last.focus();}else if(!e.shiftKey&&(document.activeElement===last||document.activeElement===dialog.current)){e.preventDefault();first.focus();}}}
  const total=items.reduce((sum,item)=>sum+item.days.length,0);
  const percent=items.length?Math.round(total/(items.length*7)*100):0;
  const complete=items.filter(item=>item.days.length===7).length;
  const daily=weekdays.map((day,index)=>items.filter(item=>item.days.includes(index+1)).length);
  const best=Math.max(...daily);
  return <><header className="app-header"><a href="/" className="brand"><span>✓</span> Mi rutina</a><span className="header-caption">CONTROL DE HÁBITOS Y SEGUIMIENTO</span><span className="saved">● Guardado en tu equipo</span></header><main className="sheet"><div className="page-heading"><div><span className="eyebrow">PEQUEÑOS PASOS, TODOS LOS DÍAS</span><h1>Tu semana, en equilibrio.</h1><p>Un espacio para tus hábitos, tus compromisos y todo lo que quieres mejorar.</p></div><span className="week-tag">Lunes — Domingo <b>7 días para avanzar</b></span></div>
  <nav className="tabs" aria-label="Secciones"><button className={tab==='routine'?'active':''} aria-current={tab==='routine'?'page':undefined} onClick={()=>setTab('routine')}>Mi rutina</button><button className={tab==='goals'?'active':''} aria-current={tab==='goals'?'page':undefined} onClick={()=>setTab('goals')}>Mis metas</button><button className={tab==='prayers'?'active':''} aria-current={tab==='prayers'?'page':undefined} onClick={()=>setTab('prayers')}>Oraciones</button></nav>
  {tab==='goals'?<Goals api={api}/>:tab==='prayers'?<Prayers api={api}/>:<>
  {error&&<p role="alert" className="error">{error}</p>}
  <section className="stats" aria-label="Resumen semanal"><article><span>Actividades en tu rutina</span><strong>{items.length}<small>{items.filter(i=>i.category==='habit').length} hábitos · {items.filter(i=>i.category==='responsibility').length} responsabilidades</small></strong></article><article><span>Marcas completadas</span><strong>{total}<small>de {items.length*7} esta semana</small></strong></article><article><span>Semana completa</span><strong>{complete}<small>{complete===1?'actividad con sus 7 días':'actividades con sus 7 días'}</small></strong></article><article className="overall"><span>Progreso semanal <b>{percent}%</b></span><div className="progress-track"><i style={{width:percent+'%'}}/></div><small>Cada marca suma.</small></article></section>
  <div className="dashboard"><section className="tracker"><div className="tracker-heading"><div><h2>Mi registro semanal</h2><p>Pulsa para marcar o desmarcar cada día.</p></div><span className="live-label">● Semana en curso</span></div>
  {loading?<p role="status">Cargando tu rutina…</p>:<div className="boards">{[['habit','HÁBITOS'],['responsibility','RESPONSABILIDADES']].map(([type,label])=>{
    const group=items.filter(item=>item.category===type);
    return <section className="board" key={type} aria-label={label}><table><colgroup><col className="activity-col"/>{weekdays.map(day=><col key={day}/>)}</colgroup><thead><tr><th className={'section-title '+type}>{label}<small>{group.length} actividades</small></th>{weekdays.map(day=><th key={day} scope="col"><abbr title={day}>{day.slice(0,3)}</abbr></th>)}</tr></thead><tbody>{Array.from({length:Math.max(3,group.length)},(_,row)=>{
      const item=group[row];
      return <tr key={item?.id??'empty-'+row} style={{'--progress-color':progressColors[item?.days.length??0]}}><th scope="row">{item?<div className="activity"><span><NameEditor name={item.name} onSave={value=>rename(item,value)} disabled={busy}/><small>{item.days.length}/7 días <i className="mini-track"><i style={{width:item.days.length/7*100+'%'}}/></i></small></span><button className="delete" aria-label={'Eliminar '+item.name} disabled={busy} onClick={()=>setDeleting(item)}>×</button></div>:<button className="empty-name" aria-label={'Añadir '+(type==='habit'?'hábito':'responsabilidad')} onClick={()=>{setCategory(type);document.getElementById('activity-name').focus();}}>+ Añadir actividad</button>}</th>{weekdays.map((day,index)=><td key={day}>{item?<button disabled={busy} className={'circle '+(item.days.includes(index+1)?'checked':'')} aria-label={`${item.name}, ${day}`} aria-pressed={item.days.includes(index+1)} onClick={()=>toggle(item,index+1)}>{item.days.includes(index+1)?'✓':''}</button>:<span className="circle placeholder" aria-hidden="true"/>}</td>)}</tr>;
    })}</tbody></table></section>;
  })}</div>}
  <form onSubmit={add}><label className="name-input"><span className="sr-only">Nombre de la actividad</span><input id="activity-name" value={name} onChange={e=>setName(e.target.value)} maxLength={80} placeholder="Nueva actividad" required disabled={loading}/></label><label><span className="sr-only">Categoría</span><select value={category} onChange={e=>setCategory(e.target.value)}><option value="habit">Hábito</option><option value="responsibility">Responsabilidad</option></select></label><button className="primary" disabled={busy||loading||!name.trim()}>Añadir</button></form>
  <div className="bottom"><span>Tu progreso se guarda automáticamente.</span><button className="reset" disabled={busy||!items.some(i=>i.days.length)} onClick={()=>setReset(true)}>↻ Reiniciar progreso</button></div></section>
  <aside><section className="insight-card"><span className="eyebrow">TU CONSTANCIA, EN COLOR</span><h2>Cada día te acerca.</h2><p>Todas las marcas de una actividad cambian juntas según sus días completados.</p><div className="color-scale">{progressColors.slice(1).map((color,index)=><div key={color}><span style={{background:color}}>✓</span><small>{index+1}</small></div>)}</div><div className="scale-labels"><span>Primer paso</span><span>Semana completa</span></div></section><section className="insight-card"><h2>Tu ritmo diario</h2><p>Actividades completadas por día</p><div className="day-chart">{weekdays.map((day,index)=><div key={day}><strong>{daily[index]}</strong><div className="chart-track"><i style={{height:items.length?daily[index]/items.length*100+'%':'0%'}}/></div><span>{day.slice(0,1)}</span></div>)}</div><div className="chart-note">{best?<>Mayor actividad: <b>{weekdays.filter((_,i)=>daily[i]===best).map(d=>d.slice(0,3)).join(', ')}</b></>:'Tu primera marca inicia el seguimiento.'}</div></section><section className="focus-card"><span>◎</span><div><h2>{complete?'La constancia se nota.':'Avanza a tu ritmo.'}</h2><p>{complete?`${complete} de tus actividades ya completaron los 7 días.`:'No hace falta hacerlo todo hoy. Un día a la vez también es avanzar.'}</p></div></section></aside></div></>}<footer>Mi rutina <span>Una semana. Pequeños pasos. Progreso real.</span></footer></main>
  {modal&&<div className="overlay" onClick={e=>{if(e.target===e.currentTarget)close();}}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" ref={dialog} tabIndex="-1" onKeyDown={trap}><h2 id="modal-title">{reset?'¿Reiniciar la semana?':'¿Eliminar esta actividad?'}</h2><p>{reset?'Se borrarán las marcas. Tus hábitos y responsabilidades se conservarán.':`Se eliminará «${deleting.name}» junto con sus marcas.`} Esta acción no se puede deshacer.</p>{error&&<p role="alert" className="error">{error}</p>}<div className="actions"><button onClick={close} disabled={busy}>Cancelar</button><button className="primary" disabled={busy} onClick={()=>mutate(async()=>{if(reset){await api('reset',{});setItems(old=>old.map(i=>({...i,days:[]})));setReset(false);}else{await api('delete',{id:deleting.id});setItems(old=>old.filter(i=>i.id!==deleting.id));setDeleting(null);}})}>{busy?'Guardando…':reset?'Sí, reiniciar':'Eliminar actividad'}</button></div></section></div>}</>;
}
createRoot(document.getElementById('root')).render(<App/>);
