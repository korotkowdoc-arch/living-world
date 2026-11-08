/** LIVING WORLD companion: branch-aware, replayable economic and inventory ledger.
 * Source of truth is confirmed scene ancestry, never a global mutable wallet.
 * Amounts are integer minor units with explicit currency & scale; unknown != zero.
 */
const str=(v,n=200)=>typeof v==='string'&&v.trim().length>0&&v.trim().length<=n;
const validPerson=v=>str(v,120);
const fail=m=>{throw Error(m);};
const text=v=>typeof v==='string'?v.trim():'';
export const ECONOMY_ACTIONS=['opening','credit','debit','transfer','reconcile'];
export const ITEM_ACTIONS=['acquire','gift','loan','return','move','consume','destroy','repair'];
export function validateCompanionDelta(input={}){
  if(!input||typeof input!=='object'||Array.isArray(input))fail('Изменения ресурсов должны быть объектом.');
  const econ=input.economy??[],items=input.items??[], newcomers=input.new_characters??[];
  if(!Array.isArray(econ)||econ.length>35)fail('economy: до 35 операций в сцене.');
  if(!Array.isArray(items)||items.length>40)fail('items: до 40 операций в сцене.');
  if(!Array.isArray(newcomers)||newcomers.length>15)fail('new_characters: до 15 персонажей в сцене.');
  const allIDs=new Set();
  const unique=id=>{if(!str(id,64)||!/^[a-z0-9][a-z0-9_-]*$/i.test(id))fail('У каждого события должен быть короткий id из букв, цифр, _ или -.');if(allIDs.has(id))fail('ID события в пределах сцены повторяется: '+id);allIDs.add(id);};
  const economy=econ.map(e=>{
    if(!e||typeof e!=='object'||Array.isArray(e))fail('Некорректная денежная операция.');
    const {id,action,account,currency,amount,scale=0,to,reason,source}=e;
    unique(id);
    if(!ECONOMY_ACTIONS.includes(action))fail('Неизвестная денежная операция: '+action);
    if(!validPerson(account)||!str(currency,20)||!/^[A-Za-zА-Яа-яЁё0-9_-]+$/u.test(currency))fail('Для денег укажи счёт и валюту.');
    if(!Number.isSafeInteger(amount)||amount<0||(!['opening','reconcile'].includes(action)&&amount===0))fail('Денежная сумма должна быть положительным целым числом минимальных единиц.');
    if(!Number.isInteger(scale)||scale<0||scale>4)fail('Некорректная точность валюты.');
    if(action==='transfer'&&(!validPerson(to)||to===account))fail('Для перевода укажи другого получателя.');
    if(action!=='transfer'&&to!==undefined)fail('Получатель допустим только для перевода.');
    if(!str(reason,400)||!str(source,600))fail('Каждой операции нужны причина и подтверждение из сцены.');
    return {id,action,account:text(account),currency:text(currency).toUpperCase(),amount,scale,...(to?{to:text(to)}:{}),reason:text(reason),source:text(source)};
  });
  const possessions=items.map(e=>{
    if(!e||typeof e!=='object'||Array.isArray(e))fail('Некорректная операция с вещью.');
    const {id,action,item_id,label,owner,holder,recipient,location,condition,reason,source}=e;
    unique(id);
    if(!ITEM_ACTIONS.includes(action)||!str(item_id,100)||!/^[a-z0-9][a-z0-9_.-]*$/i.test(item_id))fail('Нужны действие и устойчивый ID предмета.');
    if(action==='acquire'&&(!str(label,200)||!validPerson(owner)))fail('При появлении предмета укажи название и владельца.');
    if(['gift','loan','return'].includes(action)&&!validPerson(recipient))fail('Передача требует получателя.');
    if(action==='move'&&!validPerson(holder)&&!str(location,200))fail('Перемещение требует нового держателя или места.');
    if(action==='repair'&&!str(condition,200))fail('Изменение состояния требует нового описания состояния.');
    if(!str(reason,400)||!str(source,600))fail('Каждой передаче нужны причина и подтверждение из сцены.');
    return {id,action,item_id:text(item_id),...(label?{label:text(label)}:{}),...(owner?{owner:text(owner)}:{}),...(holder?{holder:text(holder)}:{}),...(recipient?{recipient:text(recipient)}:{}),...(location?{location:text(location)}:{}),...(condition?{condition:text(condition)}:{}),reason:text(reason),source:text(source)};
  });
  const names=new Set();
  const new_characters=newcomers.map(p=>{
    if(!p||typeof p!=='object'||Array.isArray(p)||!validPerson(p.name))fail('Новый персонаж требует имени.');
    const key=p.name.toLocaleLowerCase('ru');
    if(names.has(key))fail('Новый персонаж указан дважды.');names.add(key);
    if(!str(p.description,1800)||!str(p.causal_link,1800)||!str(p.goals,1800)||!str(p.knowledge,1800))fail('Новому персонажу нужны описание, канал появления, цели и доступные знания.');
    return Object.fromEntries(Object.entries(p).filter(([k])=>['name','description','causal_link','goals','knowledge','personality','relationships','location','health','mood','status','inventory'].includes(k)).map(([k,v])=>[k,text(v).slice(0,3000)]));
  });
  return {economy,items:possessions,new_characters};
}
export function extractCompanionChanges(delta={}){
  return validateCompanionDelta({economy:delta.economy??[],items:delta.items??[],new_characters:delta.new_characters??[]});
}
/** Build exactly the current branch from a complete set of world scene rows.
 * Throws instead of silently presenting a partial / false account history.
 */
export function activeLineage(allScenes,headId,max=50000){
  if(!headId)return [];
  const byId=new Map(allScenes.map(s=>[s.id,s]));
  const seen=new Set(),ordered=[];
  let id=headId;
  while(id){
    if(seen.has(id))fail('В истории обнаружен цикл.');
    if(ordered.length>=max)fail('История слишком длинная для полного восстановления.');
    const scene=byId.get(id);
    if(!scene)fail('Невозможно восстановить историю: отсутствует сцена '+id+'.');
    seen.add(id);ordered.push(scene);id=scene.parent_scene_id;
  }
  return ordered.reverse();
}
const accountKey=(name,currency,scale)=>JSON.stringify([name,currency,scale]);
function newAccount(person,currency,scale){return {person,currency,scale,known:false,balance:null,observed_delta:0,entries:[]};}
function requireItem(items,id,action){const item=items.get(id);if(!item||!item.exists)fail('Нельзя выполнить '+action+': предмет '+id+' отсутствует в этой ветке.');return item;}
export function projectCompanion(scenes,{getDelta,strict=false}={}){
  const read=getDelta??(scene=>scene.changes??scene.delta??{});
  const accounts=new Map(),items=new Map(),characters=new Map(),audit=[],issues=[],seenOps=new Set();
  const acc=(person,currency,scale)=>{
    const key=accountKey(person,currency,scale);
    if(!accounts.has(key))accounts.set(key,newAccount(person,currency,scale));
    return accounts.get(key);
  };
  const applyMoney=(e,record)=>{
    const a=acc(e.account,e.currency,e.scale);
    const key=accountKey(e.account,e.currency,e.scale);
    if(e.action==='opening'){
      if(a.known||a.entries.length)fail('Начальный баланс должен быть первым подтверждённым событием для '+e.account+' ('+e.currency+').');
      a.known=true;a.balance=e.amount;
    }else if(e.action==='reconcile'){
      // Explicitly observed current balance, not a duplicate income or retroactive opening.
      a.known=true;a.balance=e.amount;
    }else{
      const debit=e.action==='debit'||e.action==='transfer';
      if(debit&&a.known&&a.balance<e.amount)fail('Недостаточно подтверждённых денег у '+e.account+' для '+e.id+'.');
      const delta=debit?-e.amount:e.amount;
      a.observed_delta+=delta;
      if(a.known)a.balance+=delta;
      if(e.action==='transfer'){
        const b=acc(e.to,e.currency,e.scale);
        b.observed_delta+=e.amount;
        if(b.known)b.balance+=e.amount;
        b.entries.push({...record,side:'received',amount:e.amount});
      }
    }
    a.entries.push(record);
  };
  const applyItem=(e,record)=>{
    if(e.action==='acquire'){
      if(items.has(e.item_id))fail('Предмет '+e.item_id+' уже был введён в мир этой ветки.');
      const person=e.owner;
      items.set(e.item_id,{id:e.item_id,label:e.label,owner:person,holder:e.holder||person,location:e.location||'',condition:e.condition||'',exists:true,history:[record]});
      return;
    }
    const item=requireItem(items,e.item_id,e.action);
    if(e.action==='gift'){
      if(e.owner&&item.owner!==e.owner)fail('Даритель не владеет предметом '+e.item_id+'.');
      item.owner=e.recipient;item.holder=e.recipient;
      item.location=e.location??item.location;
    }else if(e.action==='loan'){
      if(e.holder&&item.holder!==e.holder)fail('Предмет '+e.item_id+' находится не у указанного держателя.');
      item.holder=e.recipient;item.location=e.location??item.location;
    }else if(e.action==='return'){
      if(e.recipient!==item.owner&&e.owner!==item.owner)fail('Возврат должен соответствовать владельцу вещи '+e.item_id+'.');
      item.holder=e.recipient;item.location=e.location??item.location;
    }else if(e.action==='move'){
      if(e.holder)item.holder=e.holder;
      if(e.location)item.location=e.location;
    }else if(e.action==='consume'||e.action==='destroy'){
      item.exists=false;item.holder=null;item.location=e.location??item.location;
    }else if(e.action==='repair'){item.condition=e.condition;}
    item.history.push(record);
  };
  for(const scene of scenes){
    let changes;
    try{changes=extractCompanionChanges(read(scene));}
    catch(error){issues.push({scene_id:scene.id,error:error.message});if(strict)throw error;continue;}
    for(const [category,events] of [['economy',changes.economy],['items',changes.items]]){
      for(const e of events){
        const id=scene.id+':'+e.id;
        if(seenOps.has(id)){issues.push({scene_id:scene.id,error:'Повтор события '+id});if(strict)fail('Повтор события '+id);continue;}
        const record={event_id:id,scene_id:scene.id,world_time:scene.world_time,category,...e};
        try{
          if(category==='economy')applyMoney(e,record);else applyItem(e,record);
          seenOps.add(id);audit.push(record);
        }catch(error){issues.push({scene_id:scene.id,event_id:id,error:error.message});if(strict)throw error;}
      }
    }
    for(const c of changes.new_characters){
      const key=c.name.toLocaleLowerCase('ru');
      if(characters.has(key)){issues.push({scene_id:scene.id,error:'Персонаж '+c.name+' создан дважды.'});if(strict)fail('Персонаж создан дважды.');continue;}
      characters.set(key,{...c,created_scene_id:scene.id,created_at:scene.world_time});
    }
  }
  return {accounts:Array.from(accounts.values()),items:Array.from(items.values()),new_characters:Array.from(characters.values()),audit,issues,scanned_scenes:scenes.length,complete:true};
}
export function formatAmount(account){
  if(!account)return 'неизвестно';
  const div=10**account.scale;
  const fmt=n=>(n/div).toLocaleString('ru-RU',{minimumFractionDigits:account.scale,maximumFractionDigits:account.scale});
  return account.known?fmt(account.balance)+' '+account.currency:'неизвестно (учтённое изменение '+(account.observed_delta>=0?'+':'')+fmt(account.observed_delta)+' '+account.currency+')';
}
