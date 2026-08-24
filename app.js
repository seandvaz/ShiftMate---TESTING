
(() => {
  'use strict';

  const defaults={rateSource:'agreement',employmentRole:'STO',toCommencementDate:'',fcoAppointmentDate:'',stoPromotionDate:'',previousRoleBeforeSto:'FCO',classificationOverride:true,classification:'STO3',manualBaseRate:44.37,baseRate:44.37,wdMult:1,satMult:1.5,sunMult:2,addHoursMult:1.84,weekendOtMult:2,publicHolidayWorkedMult:2.5,hdRate:4.87,maRate:4.87,nightRate:5.77,lease:0,gesb:0,postTax:0,annualLeaveLoadingRate:12.55,extraTax:0,employeeName:'',serviceNumber:'',customPublicHolidays:'',homeLine:'ARMADALE',rosterLineNumber:4,rosterLineAnchorDate:'2026-08-09',otTarget:1};
  const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
  const money=n=>new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format(Number(n)||0);
  const localISO=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const parseDate=s=>new Date(s+'T00:00:00');
  const emptyDay=()=>({code:'',type:'Rostered',hd:false,start:'',finish:'',earlyStartHours:0,additionalHours:0,leaveHours:'',annualLeaveHours:0,phBenefit:'lieu',offline:false,workedRosterLine:'',offlineReason:'directed',partner:'',personalLeaveReason:'illness',entered:false});
  const rangeLabel=start=>{
    const a=parseDate(start),b=new Date(a);b.setDate(a.getDate()+13);
    return `${a.toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'})} – ${b.toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'})}`;
  };
  const periodEndDate=start=>addRosterDays(parseDate(start),13);
  const peLabel=start=>{
    const d=periodEndDate(start);
    return `PE${String(d.getDate()).padStart(2,'0')}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getFullYear()).slice(-2)}`;
  };
  const cycleDateRange=start=>{
    const a=parseDate(start),b=periodEndDate(start);
    return `${a.toLocaleDateString('en-AU',{day:'numeric',month:'short'})} – ${b.toLocaleDateString('en-AU',{day:'numeric',month:'short'})}`;
  };

  const paydayFor=start=>{
    const s=parseDate(start),end=new Date(s);end.setDate(s.getDate()+13);
    const next=new Date(end);next.setDate(end.getDate()+1);
    const offset=(3-next.getDay()+7)%7;
    const pay=new Date(next);pay.setDate(next.getDate()+offset+7);
    return pay;
  };
  const financialYearFor=date=>{
    const d=new Date(date),startYear=d.getMonth()>=6?d.getFullYear():d.getFullYear()-1;
    return {startYear,label:`${startYear}–${String(startYear+1).slice(-2)}`};
  };
  const cycleInFinancialYear=(cycle,startYear)=>{
    const d=parseDate(cycle.startDate);
    const fyStart=new Date(startYear,6,1);
    const fyEnd=new Date(startYear+1,5,30,23,59,59,999);
    return d>=fyStart&&d<=fyEnd;
  };

  const startOfRosterDay=d=>{const x=new Date(d);x.setHours(0,0,0,0);return x};
  const addRosterDays=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x};
  const sundayOfRosterWeek=d=>{
    const x=startOfRosterDay(d);
    x.setDate(x.getDate()-x.getDay());
    return x;
  };
  const displayRosterStart=row=>{
    if(!row?.code)return'';
    const data=SHIFT_DATA[row.code];
    if(data?.leaveType)return'';
    return row.start||'';
  };
  const rosterVisualKind=entry=>{
    if(!entry)return'not-working';
    const row=entry.row||{};
    if(!row.code||row.type==='Off'||SHIFT_DATA[row.code]?.leaveType)return'not-working';
    return'working';
  };
  function rosterTimeline(){
    const map=new Map();
    const addCycle=(cycle,priority)=>{
      if(!cycle?.startDate||!Array.isArray(cycle.days))return;
      const start=parseDate(cycle.startDate);
      cycle.days.forEach((row,i)=>{
        const date=addRosterDays(start,i),key=localISO(date),existing=map.get(key);
        if(!existing||priority>=existing.priority){
          map.set(key,{date,key,row:{...emptyDay(),...row},cycle,priority});
        }
      });
    };
    AppStorage.loadCycles().forEach(c=>addCycle(c,1));
    addCycle(current,2);
    return map;
  }
  function rosterDisplayCode(entry){
    if(!entry?.row?.code)return'';
    if(entry.row.type==='Off'||SHIFT_DATA[entry.row.code]?.leaveType)return'';
    return entry.row.code;
  }
  function projectionRoleForSettings(settings=current.settings){
    const c=String(settings?.classification||'').toUpperCase();
    if(/^STO/.test(c))return'SENIOR_TRANSIT';
    if(/^SUP/.test(c))return'SUPERVISOR';
    return'TRANSIT';
  }
  function actualShiftPeriod(entry,date){
    const row=entry?.row||{},data=SHIFT_DATA[row.code];
    if(!row.code||row.type==='Off'||data?.leaveType)return'Off';
    let start=row.start;
    if(!start&&data?.times)start=data.times[PayCalc.dayGroup(date.getDay())]?.[0]||'';
    const hour=Number(String(start||'00:00').split(':')[0]);
    return hour<12?'Morn':'Arvo';
  }
  function homeFortnightStart(){
    const today=startOfRosterDay(new Date()),entries=rosterTimeline();
    for(const e of entries.values()){
      const st=parseDate(e.cycle?.startDate||'');
      if(!e.cycle?.startDate)continue;
      const en=addRosterDays(st,13);
      if(today>=st&&today<=en)return st;
    }
    const profile=currentProjectionProfile();
    if(profile)return projectionFortnightStartForProfile(today,profile);
    return sundayOfRosterWeek(today);
  }
  function visualDayState(date,entries=rosterTimeline()){
    const key=localISO(date),entry=entries.get(key),candidate=rosterProjectionForDate(date);
    const actualFortnight=candidate?.fortnightStart?projectionFortnightHasActual(candidate.fortnightStart,entries):Boolean(entry?.row&&(entry.row.entered||entry.row.code));
    if(actualFortnight){
      const period=actualShiftPeriod(entry,date);
      return {actual:true,projected:false,entry,period,label:rosterDisplayCode(entry),working:period!=='Off'};
    }
    if(candidate){
      return {actual:false,projected:true,entry:null,period:candidate.shiftType,label:candidate.working?(candidate.shiftType==='Morning'?'Morn':'Arvo'):'',working:candidate.working,projection:candidate};
    }
    const period=actualShiftPeriod(entry,date);
    return {actual:Boolean(entry),projected:false,entry,period,label:rosterDisplayCode(entry),working:period!=='Off'};
  }
  function renderFortnightStrip(){
    const wrap=$('#homeWeekStrip');if(!wrap)return;
    const start=homeFortnightStart(),entries=rosterTimeline(),todayKey=localISO(new Date());
    const end=addRosterDays(start,13),range=$('#homeFortnightRange');
    if(range)range.textContent=`${start.toLocaleDateString('en-AU',{day:'numeric',month:'short'})} – ${end.toLocaleDateString('en-AU',{day:'numeric',month:'short'})}`;
    wrap.innerHTML='';
    for(let week=0;week<2;week++){
      const page=document.createElement('div');page.className='fortnight-week';page.dataset.week=String(week);
      for(let j=0;j<7;j++){
        const i=week*7+j,date=addRosterDays(start,i),key=localISO(date),entry=entries.get(key),button=document.createElement('button');
        button.type='button';button.dataset.key=key;
        const period=actualShiftPeriod(entry,date),label=rosterDisplayCode(entry);
        const periodClass=period==='Morn'||period==='Morning'?'shift-morn':period==='Arvo'?'shift-arvo':'shift-off';
        button.className=`week-day actual ${periodClass} ${key===todayKey?'today':''}`;
        button.innerHTML=`${key===todayKey?'<span class="today-marker">TODAY</span>':''}<span class="week-dow">${date.toLocaleDateString('en-AU',{weekday:'short'})}</span>
          <span class="week-date">${date.getDate()}</span><strong>${label||''}</strong>`;
        button.onclick=()=>{calendarCursor=new Date(date.getFullYear(),date.getMonth(),1);go('calendar');renderCalendar(key)};
        page.appendChild(button);
      }
      wrap.appendChild(page);
    }

  }
  function projectionFortnightHasActual(start,entries=rosterTimeline()){
    for(let i=0;i<14;i++){
      const entry=entries.get(localISO(addRosterDays(start,i)));
      if(entry?.row && (entry.row.entered||entry.row.code))return true;
    }
    return false;
  }
  function projectedFortnightNetEstimate(start){
    const settings=projectedSettingsForDate(start);
    const days=Array.from({length:14},()=>({...emptyDay(),type:'Off'}));
    let shiftCount=0;
    for(let i=0;i<14;i++){
      const date=addRosterDays(start,i),p=rosterProjectionForDate(date);
      if(!p?.working)continue;
      const codes=projectedCandidateCodes(date,p.shiftType);
      if(!codes.length)continue;
      const candidates=codes.map(code=>({code,gross:projectedDayGross(date,code)})).sort((a,b)=>a.gross-b.gross);
      const code=candidates[Math.floor((candidates.length-1)/2)].code;
      days[i]={...emptyDay(),code,type:'Rostered',entered:true,phBenefit:'lieu',start:p.start||'',finish:p.finish||''};
      shiftCount++;
    }
    const result=PayCalc.calculate({startDate:localISO(start),settings,days});
    return {net:result.net,gross:result.gross,shiftCount};
  }
  function hideCalendarPaySummary(){
    const detail=$('#calendarProjectionPay');
    if(detail){detail.hidden=true;detail.innerHTML=''}
  }
  function clearCalendarSelection(){
    $$('.calendar-day').forEach(el=>el.classList.remove('selected'));
    hideCalendarPaySummary();
    const detail=$('#calendarDetail');if(detail)detail.hidden=true;
    const what=$('#whatIfPanel');if(what)what.hidden=true;whatIfState={key:'',action:'',swapFrom:''};
  }
  function renderProjectedPaySummary(date){
    const detail=$('#calendarProjectionPay');if(!detail)return;
    const entries=rosterTimeline(),start=projectionFortnightStart(date);
    if(!start||projectionFortnightHasActual(start,entries)){hideCalendarPaySummary();return}
    const end=addRosterDays(start,13),est=projectedFortnightNetEstimate(start);
    detail.hidden=false;
    detail.innerHTML=`<span class="eyebrow">Projected pay · ${start.toLocaleDateString('en-AU',{day:'numeric',month:'short'})} – ${end.toLocaleDateString('en-AU',{day:'numeric',month:'short'})}</span>
      <div class="projected-net-row"><span>Projected net payment</span><strong>${money(est.net)}</strong></div>
      <small>Planning estimate based on the projected Morn/Arvo pattern.</small>`;
  }
  function renderActualPaySummary(entry){
    const detail=$('#calendarProjectionPay');if(!detail||!entry?.cycle){hideCalendarPaySummary();return}
    const cycle=entry.cycle,start=parseDate(cycle.startDate),end=addRosterDays(start,13),result=cycleResult(cycle);
    detail.hidden=false;
    detail.innerHTML=`<span class="eyebrow">Rostered pay · ${start.toLocaleDateString('en-AU',{day:'numeric',month:'short'})} – ${end.toLocaleDateString('en-AU',{day:'numeric',month:'short'})}</span>
      <div class="projected-net-row"><span>Estimated net payment</span><strong>${money(result?.net||cycle.summary?.net||0)}</strong></div>`;
  }
  function renderOtPaySnapshot(date,otRec,entry,projection){
    const detail=$('#calendarProjectionPay');if(!detail||!otRec)return;
    const entries=rosterTimeline(),state=visualDayState(date,entries);
    const actualCycle=state.entry?.cycle||entry?.cycle||null;
    const start=actualCycle?.startDate?parseDate(actualCycle.startDate):(state.projection?.fortnightStart||projectionFortnightStartForProfile(date));
    if(!start){hideCalendarPaySummary();return}
    const end=addRosterDays(start,13),isProjected=!actualCycle;
    const baselineNet=Number(otRec.baselineNet)||0;
    const withOtNet=Number(otRec.singleNet)||baselineNet+(Number(otRec.singleNetGain)||0);
    const gain=withOtNet-baselineNet;
    detail.hidden=false;
    detail.innerHTML=`<span class="eyebrow">${isProjected?'Projected':'Rostered'} pay · ${start.toLocaleDateString('en-AU',{day:'numeric',month:'short'})} – ${end.toLocaleDateString('en-AU',{day:'numeric',month:'short'})}</span>
      <div class="ot-pay-compare">
        <div class="ot-pay-base"><span>${isProjected?'Projected':'Estimated'} net payment</span><strong>${money(baselineNet)}</strong></div>
        <div class="ot-pay-with ${otRec.stars===2?'best':'good'}"><span>With OT · ${date.toLocaleDateString('en-AU',{weekday:'short',day:'numeric',month:'short'})}${isProjected?' · Projected':''}</span><strong>${money(withOtNet)}</strong><b>+${money(gain)} net</b></div>
      </div>
      ${isProjected?'<small>Planning estimate based on the projected roster and the same pay calculation used for actual rosters.</small>':''}`;
  }
  function publicHolidayName(date){return PayCalc.waPublicHolidays(date.getFullYear(),current.settings.customPublicHolidays).get(localISO(date))||''}
  let otRecommendationCache=new Map();
  function overtimeCandidateCodes(date){
    const group=PayCalc.dayGroup(date.getDay()),home=current.settings.homeLine;
    return [...new Set(Object.entries(SHIFT_DATA).filter(([code,data])=>{
      if(!data||data.leaveType||data.line!==home||data.allowance!=='Morn/Aft'||/HIGHER DUTIES/i.test(data.name||''))return false;
      return Boolean(data.times?.[group]);
    }).map(([code])=>code))];
  }
  function projectedBaselineCycle(start){
    const settings=projectedSettingsForDate(start),days=Array.from({length:14},()=>({...emptyDay(),type:'Off'}));
    for(let i=0;i<14;i++){
      const date=addRosterDays(start,i),p=rosterProjectionForDate(date);if(!p?.working)continue;
      const codes=projectedCandidateCodes(date,p.shiftType);if(!codes.length)continue;
      const candidates=codes.map(code=>({code,gross:projectedDayGross(date,code)})).sort((a,b)=>a.gross-b.gross);
      const code=candidates[Math.floor((candidates.length-1)/2)].code;
      days[i]={...emptyDay(),code,type:'Rostered',entered:true,phBenefit:'lieu',start:p.start||'',finish:p.finish||''};
    }
    return {startDate:localISO(start),settings,days};
  }
  function combinations(items,count){
    const out=[];
    const walk=(from,pick)=>{
      if(pick.length===count){out.push([...pick]);return}
      for(let i=from;i<=items.length-(count-pick.length);i++){pick.push(items[i]);walk(i+1,pick);pick.pop()}
    };
    if(count>0&&count<=items.length)walk(0,[]);
    return out;
  }
  function applyOtCandidates(baseline,candidates){
    const trial=JSON.parse(JSON.stringify(baseline));
    trial.days=Array.from({length:14},(_,idx)=>({...emptyDay(),...(trial.days?.[idx]||{})}));
    candidates.forEach(c=>{trial.days[c.dayIndex]={...emptyDay(),code:c.code,type:'Picked-up OT',entered:true,phBenefit:'lieu'}});
    return trial;
  }
  function restPreservationForCombo(baseline,combo){
    const picked=new Set(combo.map(c=>c.dayIndex));
    const originalOff=Array.from({length:14},(_,i)=>!baseline.days?.[i]?.code||baseline.days?.[i]?.type==='Off');
    const remaining=originalOff.map((off,i)=>off&&!picked.has(i));
    let longest=0,run=0,blocks=0,brokenAdjacencies=0;
    for(let i=0;i<14;i++){
      if(remaining[i]){run++;longest=Math.max(longest,run);if(i===0||!remaining[i-1])blocks++}else run=0;
    }
    picked.forEach(i=>{
      if(originalOff[i-1])brokenAdjacencies++;
      if(originalOff[i+1])brokenAdjacencies++;
    });
    return {longest,blocks,brokenAdjacencies};
  }
  function compareOtCombos(a,b){
    const netDiff=b.net-a.net;
    if(Math.abs(netDiff)>=0.01)return netDiff;
    if(b.rest.longest!==a.rest.longest)return b.rest.longest-a.rest.longest;
    if(a.rest.brokenAdjacencies!==b.rest.brokenAdjacencies)return a.rest.brokenAdjacencies-b.rest.brokenAdjacencies;
    if(a.rest.blocks!==b.rest.blocks)return a.rest.blocks-b.rest.blocks;
    return 0;
  }
  function sameOtTier(a,b){
    return Boolean(a&&b&&Math.abs(a.net-b.net)<0.01&&a.rest.longest===b.rest.longest&&a.rest.brokenAdjacencies===b.rest.brokenAdjacencies&&a.rest.blocks===b.rest.blocks);
  }
  function overtimeRankingForFortnight(date,entries=rosterTimeline()){
    const state=visualDayState(date,entries);
    const actualCycle=state.entry?.cycle||null;
    const start=actualCycle?.startDate?parseDate(actualCycle.startDate):(state.projection?.fortnightStart||projectionFortnightStartForProfile(date));
    if(!start)return new Map();
    const requestedTarget=Math.min(5,Math.max(1,Number(current.settings.otTarget)||1));
    const cacheKey=`${localISO(start)}|${actualCycle?.id||'projected'}|${current.settings.homeLine}|${current.settings.classification}|${current.settings.employmentRole}|${current.settings.rosterLineNumber}|${current.settings.baseRate}|${current.settings.lease}|${current.settings.gesb}|${current.settings.postTax}|${current.settings.extraTax}|${requestedTarget}`;
    if(otRecommendationCache.has(cacheKey))return otRecommendationCache.get(cacheKey);
    const baseline=actualCycle?JSON.parse(JSON.stringify(actualCycle)):projectedBaselineCycle(start);
    // OT simulations always use the user's CURRENT employment settings and the
    // agreement rate effective for this fortnight. This prevents a saved cycle's
    // historical classification/rate snapshot from driving recommendations after
    // Current level has changed in Settings.
    baseline.settings=projectedSettingsForDate(start);
    const baselineResult=PayCalc.calculate(baseline),dayCandidates=[];
    for(let i=0;i<14;i++){
      const d=addRosterDays(start,i),dayState=visualDayState(d,entries);if(dayState.working)continue;
      const codes=overtimeCandidateCodes(d);if(!codes.length)continue;
      let best=null;
      for(const code of codes){
        const trial=applyOtCandidates(baseline,[{dayIndex:i,code}]);
        const result=PayCalc.calculate(trial);
        const candidate={dateKey:localISO(d),dayIndex:i,code,baselineNet:baselineResult.net,singleNet:result.net,singleGross:result.gross,singleNetGain:result.net-baselineResult.net,singleGrossGain:result.gross-baselineResult.gross};
        if(!best||candidate.singleGrossGain>best.singleGrossGain+0.005||(Math.abs(candidate.singleGrossGain-best.singleGrossGain)<0.005&&candidate.singleNetGain>best.singleNetGain))best=candidate;
      }
      if(best)dayCandidates.push(best);
    }
    const target=Math.min(requestedTarget,dayCandidates.length),ranking=new Map();
    if(!target){otRecommendationCache.set(cacheKey,ranking);return ranking}
    const comboResults=combinations(dayCandidates,target).map(combo=>{
      const result=PayCalc.calculate(applyOtCandidates(baseline,combo));
      return {combo,result,net:result.net,gross:result.gross,rest:restPreservationForCombo(baseline,combo)};
    }).sort(compareOtCombos);
    const bestCombo=comboResults[0]||null;
    const bestTier=bestCombo?comboResults.filter(c=>sameOtTier(c,bestCombo)):[];
    const secondCombo=comboResults.find(c=>!sameOtTier(c,bestCombo))||null;
    const secondTier=secondCombo?comboResults.filter(c=>sameOtTier(c,secondCombo)):[];
    const annotate=(comboResult,stars)=>{
      if(!comboResult)return;
      comboResult.combo.forEach(candidate=>{
        const existing=ranking.get(candidate.dateKey);
        if(existing&&existing.stars>=stars)return;
        const without=comboResult.combo.filter(x=>x.dateKey!==candidate.dateKey);
        const withoutNet=PayCalc.calculate(applyOtCandidates(baseline,without)).net;
        ranking.set(candidate.dateKey,{...candidate,stars,target,comboNet:comboResult.net,comboGross:comboResult.gross,netGain:comboResult.net-withoutNet,grossGain:candidate.singleGrossGain});
      });
    };
    bestTier.forEach(c=>annotate(c,2));
    secondTier.forEach(c=>annotate(c,1));
    otRecommendationCache.set(cacheKey,ranking);return ranking;
  }
  function otRecommendationForDate(date,entries=rosterTimeline()){
    const state=visualDayState(date,entries);if(state.working)return null;
    return overtimeRankingForFortnight(date,entries).get(localISO(date))||null;
  }
  function otAnalysisForDate(date,entries=rosterTimeline()){
    const state=visualDayState(date,entries);if(state.working)return null;
    const ranked=otRecommendationForDate(date,entries);if(ranked)return ranked;
    const actualCycle=state.entry?.cycle||null;
    const start=actualCycle?.startDate?parseDate(actualCycle.startDate):(state.projection?.fortnightStart||projectionFortnightStartForProfile(date));
    if(!start)return null;
    const baseline=actualCycle?JSON.parse(JSON.stringify(actualCycle)):projectedBaselineCycle(start);
    baseline.settings=projectedSettingsForDate(start);
    const dayIndex=Math.round((startOfRosterDay(date)-startOfRosterDay(start))/86400000);
    if(dayIndex<0||dayIndex>13)return null;
    const baseResult=PayCalc.calculate(baseline);let best=null;
    for(const code of overtimeCandidateCodes(date)){
      const result=PayCalc.calculate(applyOtCandidates(baseline,[{dayIndex,code}]));
      const candidate={dateKey:localISO(date),dayIndex,code,stars:0,baselineNet:baseResult.net,singleNet:result.net,singleGross:result.gross,singleNetGain:result.net-baseResult.net,singleGrossGain:result.gross-baseResult.gross};
      if(!best||candidate.singleNet>best.singleNet)best=candidate;
    }
    return best;
  }
  function otStarsForDate(date,entries=rosterTimeline()){
    return otRecommendationForDate(date,entries)?.stars||0;
  }
  function updateOtTargetNote(){
    const note=$('#otTargetNote'),target=Math.min(5,Math.max(1,Number(current.settings.otTarget)||1));
    if(note)note.textContent=`Recommendations optimised for ${target} OT shift${target===1?'':'s'} per fortnight`;
  }
  function scrollCalendarToTarget(target,behavior='smooth'){
    const wrap=$('#calendarMonths');if(!wrap||!target)return;
    const wr=wrap.getBoundingClientRect(),tr=target.getBoundingClientRect();
    const targetTop=wrap.scrollTop+(tr.top-wr.top)-Math.max(8,(wrap.clientHeight-target.offsetHeight)/2);
    wrap.scrollTo({top:Math.max(0,targetTop),behavior});
  }
  function sizeCalendarViewport(){
    const screen=$('#calendar'),nav=document.querySelector('.bottom-nav');
    if(!screen||!nav||!screen.classList.contains('active'))return;
    const top=screen.getBoundingClientRect().top,navTop=nav.getBoundingClientRect().top;
    const available=Math.floor(navTop-top-10);
    screen.style.height=`${Math.max(360,available)}px`;
  }
  let whatIfState={key:'',action:'',swapFrom:''};
  function calendarCycleForDate(date,entries=rosterTimeline()){
    const state=visualDayState(date,entries),actual=state.entry?.cycle||null;
    const start=actual?.startDate?parseDate(actual.startDate):(state.projection?.fortnightStart||projectionFortnightStartForProfile(date));
    if(!start)return null;
    const baseline=actual?JSON.parse(JSON.stringify(actual)):projectedBaselineCycle(start);
    return {baseline,start,state,dayIndex:Math.round((startOfRosterDay(date)-startOfRosterDay(start))/86400000)};
  }
  function simulateWhatIf(date,action,code='',swapDate=null){
    const info=calendarCycleForDate(date);if(!info||info.dayIndex<0||info.dayIndex>13)return null;
    const baseline=info.baseline,baseResult=PayCalc.calculate(baseline),trial=JSON.parse(JSON.stringify(baseline));
    trial.days=Array.from({length:14},(_,i)=>({...emptyDay(),...(trial.days?.[i]||{})}));
    if(action==='ot'){
      const codes=overtimeCandidateCodes(date);let best=null;
      for(const c of codes){const t=JSON.parse(JSON.stringify(trial));t.days[info.dayIndex]={...emptyDay(),code:c,type:'Picked-up OT',entered:true,phBenefit:'lieu'};const r=PayCalc.calculate(t);if(!best||r.net>best.result.net)best={trial:t,result:r,code:c}}
      if(!best)return null;return {...best,baseResult};
    }
    if(action==='off')trial.days[info.dayIndex]={...emptyDay(),type:'Off',entered:true};
    if(action==='change'&&code)trial.days[info.dayIndex]={...trial.days[info.dayIndex],code,type:'Rostered',entered:true};
    if(action==='swap'&&swapDate){const j=Math.round((startOfRosterDay(swapDate)-startOfRosterDay(info.start))/86400000);if(j<0||j>13)return null;[trial.days[info.dayIndex],trial.days[j]]=[trial.days[j],trial.days[info.dayIndex]]}
    const result=PayCalc.calculate(trial);return {trial,result,baseResult,code};
  }
  function renderWhatIfPanel(date,entry,projection){
    const panel=$('#whatIfPanel');if(!panel)return;
    const key=localISO(date),state=visualDayState(date),working=state.working;
    panel.hidden=false;whatIfState.key=key;
    const candidates=overtimeCandidateCodes(date).slice(0,30);
    const currentCode=entry?.row?.code||'';
    panel.innerHTML=`<div class="context-head"><span class="eyebrow">What if · ${date.toLocaleDateString('en-AU',{weekday:'short',day:'numeric',month:'short'})}</span><button class="context-close" type="button" data-what-close>×</button></div>
      <div class="what-if-actions">
        ${!working?'<button type="button" data-what="ot">Add OT</button>':''}
        ${working?'<button type="button" data-what="off">Make off</button>':''}
        ${working?'<button type="button" data-what="change">Change shift</button>':''}
        ${working?'<button type="button" data-what="swap">Swap</button>':''}
      </div><div class="what-if-result"><small>Hypothetical only — your roster will not be changed.</small></div>`;
    panel.querySelector('[data-what-close]').onclick=()=>{panel.hidden=true;whatIfState={key:'',action:'',swapFrom:''}};
    panel.querySelectorAll('[data-what]').forEach(btn=>btn.onclick=()=>{
      const action=btn.dataset.what,resultBox=panel.querySelector('.what-if-result');whatIfState.action=action;
      if(action==='change'){
        resultBox.innerHTML=`<label>Try shift<select id="whatIfShift"><option value="">Select shift</option>${candidates.map(c=>`<option value="${c}" ${c===currentCode?'selected':''}>${c}</option>`).join('')}</select></label><div id="whatIfCalc"></div><small>Hypothetical only — your roster will not be changed.</small>`;
        const sel=resultBox.querySelector('#whatIfShift'),calc=resultBox.querySelector('#whatIfCalc');
        sel.onchange=()=>{if(!sel.value){calc.innerHTML='';return}const sim=simulateWhatIf(date,'change',sel.value);if(sim)calc.innerHTML=whatIfResultMarkup(sim)};return;
      }
      if(action==='swap'){whatIfState.swapFrom=key;resultBox.innerHTML='<strong>Select another day in this fortnight to compare the swap.</strong><small>Nothing will be written to your roster.</small>';return}
      const sim=simulateWhatIf(date,action);if(sim)resultBox.innerHTML=whatIfResultMarkup(sim);
    });
  }
  function whatIfResultMarkup(sim){const delta=sim.result.net-sim.baseResult.net,sign=delta>=0?'+':'−';return `<div class="what-if-money"><span>Estimated net change</span><strong class="${delta>=0?'positive':'negative'}">${sign}${money(Math.abs(delta))}</strong></div><div class="what-if-new-net"><span>Fortnight net</span><b>${money(sim.result.net)}</b></div><small>Hypothetical only — your roster will not be changed.</small>`}
  function earliestSavedActualDate(){
    let earliest=null;
    const scan=cycle=>{
      if(!cycle?.startDate||!Array.isArray(cycle.days))return;
      const start=parseDate(cycle.startDate);
      cycle.days.forEach((row,i)=>{
        if(!(row?.entered??Boolean(row?.code)))return;
        const d=addRosterDays(start,i);
        if(!earliest||d<earliest)earliest=d;
      });
    };
    AppStorage.loadCycles().forEach(scan);scan(current);
    return earliest;
  }
  const monthDiff=(a,b)=>(b.getFullYear()-a.getFullYear())*12+(b.getMonth()-a.getMonth());

  function renderCalendar(selectedKey=''){
    sizeCalendarViewport();
    const wrap=$('#calendarMonths');if(!wrap)return;
    otRecommendationCache=new Map();
    const entries=rosterTimeline(),today=startOfRosterDay(new Date()),todayKey=localISO(today);
    const profile=currentProjectionProfile(),status=$('#calendarProjectionStatus');updateOtTargetNote();
    if(status){
      if(profile){status.hidden=true;status.textContent=''}
      else{
        status.hidden=false;status.textContent=`Projected roster unavailable for ${current.settings.homeLine||'this home line'} at ${current.settings.classification||'the selected level'}. Actual rosters are unaffected.`;
      }
    }
    const focus=selectedKey?parseDate(selectedKey):calendarCursor;
    const focusMonth=new Date(focus.getFullYear(),focus.getMonth(),1);
    const earliest=earliestSavedActualDate();
    const earliestMonth=earliest?new Date(earliest.getFullYear(),earliest.getMonth(),1):focusMonth;
    const firstMonth=earliestMonth<focusMonth?earliestMonth:focusMonth;
    const futureBase=new Date(Math.max(focusMonth.getTime(),new Date(new Date().getFullYear(),new Date().getMonth(),1).getTime()));
    const lastMonth=new Date(futureBase.getFullYear(),futureBase.getMonth()+17,1);
    const monthCount=Math.max(18,monthDiff(firstMonth,lastMonth)+1);
    wrap.innerHTML='';
    for(let offset=0;offset<monthCount;offset++){
      const monthDate=new Date(firstMonth.getFullYear(),firstMonth.getMonth()+offset,1);
      const year=monthDate.getFullYear(),month=monthDate.getMonth(),daysInMonth=new Date(year,month+1,0).getDate();
      const section=document.createElement('section');section.className='calendar-month-block';section.dataset.month=`${year}-${String(month+1).padStart(2,'0')}`;
      const header=document.createElement('h3');header.className='calendar-scroll-month';header.textContent=monthDate.toLocaleDateString('en-AU',monthDate.getFullYear()===new Date().getFullYear()?{month:'short'}:{month:'short',year:'numeric'});section.appendChild(header);
      const weekdays=document.createElement('div');weekdays.className='calendar-weekdays';weekdays.innerHTML='<span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span>';section.appendChild(weekdays);
      const grid=document.createElement('div');grid.className='calendar-grid';
      for(let i=0;i<monthDate.getDay();i++){const blank=document.createElement('div');blank.className='calendar-day blank';grid.appendChild(blank)}
      for(let day=1;day<=daysInMonth;day++){
        const date=new Date(year,month,day),key=localISO(date),entry=entries.get(key),row=entry?.row;
        const candidateProjection=date>=today?rosterProjectionForDate(date):null,fortnightStart=candidateProjection?.fortnightStart||null;
        const actualCycleStart=entry?.cycle?.startDate?parseDate(entry.cycle.startDate):null;
        const actualFortnight=(fortnightStart?projectionFortnightHasActual(fortnightStart,entries):false)||(actualCycleStart?projectionFortnightHasActual(actualCycleStart,entries):false);
        const projection=!actualFortnight?candidateProjection:null;
        const button=document.createElement('button');button.type='button';button.dataset.key=key;
        const state=visualDayState(date,entries),isActual=actualFortnight;
        let label=isActual?rosterDisplayCode(entry):(projection?.working?(projection.shiftType==='Morning'?'Morn':'Arvo'):'');
        const period=isActual?actualShiftPeriod(entry,date):(projection?.shiftType||'Off');
        const periodClass=period==='Morn'||period==='Morning'?'shift-morn':period==='Arvo'?'shift-arvo':'shift-off';
        const stars=otStarsForDate(date,entries),starText=stars===2?'★':stars===1?'☆':'';
        const otRec=otAnalysisForDate(date,entries);
        const cycleStartKey=entry?.cycle?.startDate||(candidateProjection?.fortnightStart?localISO(candidateProjection.fortnightStart):'');
        const cycleBoundary=cycleStartKey===key?'fortnight-start':'';
        button.className=`calendar-day ${isActual?'actual':'projected'} ${periodClass} ${cycleBoundary} ${key===todayKey?'today':''} ${key===selectedKey?'selected':''} ${otRec?'ot-recommended':''}`;
        const front=`${key===todayKey?'<span class="today-marker">TODAY</span>':''}${starText?`<span class="ot-stars ${stars===2?'ot-best':'ot-good'}" aria-label="${stars===2?'Best OT':'Good OT'}">${starText}</span>`:''}<span class="calendar-date">${day}</span><strong>${label}</strong>`;
        const back=otRec?`<span class="ot-flip-stars ${otRec.stars===2?'ot-best':'ot-good'}">${otRec.stars===2?'★':otRec.stars===1?'☆':'OT'}</span><strong>${otRec.stars===2?'Best OT':otRec.stars===1?'Good OT':'If OT'}</strong><b>+${money(otRec.singleNetGain)}</b><small>net</small>`:'';
        button.innerHTML=otRec?`<span class="calendar-flip-inner"><span class="calendar-day-face calendar-day-front">${front}</span><span class="calendar-day-face calendar-day-back">${back}</span></span>`:front;
        button.onclick=()=>{
          if(otRec){
            const wasFlipped=button.classList.contains('flipped');
            $$('.calendar-day.flipped').forEach(el=>el.classList.remove('flipped','selected'));
            const selectedData=SHIFT_DATA[row?.code];
            const isActualLeave=Boolean(isActual&&selectedData?.leaveType);
            if(wasFlipped){
              clearCalendarSelection();
              return;
            }
            button.classList.add('flipped','selected');
            if(isActualLeave)renderCalendarDetail(key,entry);else $('#calendarDetail').hidden=true;
            renderOtPaySnapshot(date,otRec,entry,projection);
            return;
          }
          $$('.calendar-day.flipped').forEach(el=>el.classList.remove('flipped','selected'));
          if(button.classList.contains('selected')){clearCalendarSelection();return}
          $$('.calendar-day').forEach(el=>el.classList.toggle('selected',el.dataset.key===key));
          if(projection){$('#calendarDetail').hidden=true;renderProjectedPaySummary(date)}
          else{renderCalendarDetail(key,entry);renderActualPaySummary(entry)}
        };
        if(cycleBoundary&&date.getDay()===0){const divider=document.createElement('div');divider.className='fortnight-divider';divider.setAttribute('aria-hidden','true');grid.appendChild(divider)}
        grid.appendChild(button);
      }
      section.appendChild(grid);wrap.appendChild(section);
    }
    $('#calendarDetail').hidden=true;hideCalendarPaySummary();
    requestAnimationFrame(()=>{
      if(!selectedKey){
        const todayTarget=wrap.querySelector(`[data-key="${todayKey}"]`);
        if(todayTarget)scrollCalendarToTarget(todayTarget,'auto');
        updateCalendarTodayButton();sizeCalendarViewport();return;
      }
      const target=wrap.querySelector(`[data-key="${selectedKey}"]`);
      if(target)scrollCalendarToTarget(target,'auto');
      updateCalendarTodayButton();
      sizeCalendarViewport();
    });
  }
  function updateCalendarTodayButton(){
    const wrap=$('#calendarMonths'),btn=$('#calendarTodayFloat');if(!wrap||!btn)return;
    const target=wrap.querySelector(`[data-key="${localISO(new Date())}"]`);if(!target){btn.hidden=true;return}
    const wr=wrap.getBoundingClientRect(),tr=target.getBoundingClientRect();
    btn.hidden=tr.top>=wr.top+8&&tr.bottom<=wr.bottom-8;
  }
  function saveCalendarPartner(entry,key,name){
    if(!entry?.cycle?.startDate)return;
    const start=parseDate(entry.cycle.startDate),idx=Math.round((startOfRosterDay(parseDate(key))-startOfRosterDay(start))/86400000);
    if(idx<0||idx>13)return;
    const clean=String(name||'').trim();
    if(current.startDate===entry.cycle.startDate){
      current.days[idx]={...emptyDay(),...(current.days[idx]||{}),partner:clean};
      AppStorage.saveCurrent(current);
    }
    if(entry.cycle.id){
      const cycles=AppStorage.loadCycles(),ci=cycles.findIndex(c=>c.id===entry.cycle.id);
      if(ci>=0){
        cycles[ci].days[idx]={...emptyDay(),...(cycles[ci].days[idx]||{}),partner:clean};
        cycles[ci].updatedAt=new Date().toISOString();
        AppStorage.saveCycles(cycles);
      }
    }
    refreshPartnerSuggestions();
  }

  let pendingLeaveDocument=null;
  const esc=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const fmtFormDate=d=>d.toLocaleDateString('en-AU',{day:'2-digit',month:'2-digit',year:'numeric'});
  function leaveBlockForEntry(key,entry){
    const selectedData=SHIFT_DATA[entry?.row?.code];if(!selectedData?.leaveType)return null;
    const entries=rosterTimeline(),selectedDate=parseDate(key),leaveType=selectedData.leaveType;
    const validActual=e=>Boolean(e&&(e.row?.entered??Boolean(e.row?.code)));
    const compatible=e=>{
      if(!validActual(e))return false;
      const d=SHIFT_DATA[e.row.code];
      return !e.row.code||e.row.type==='Off'||d?.leaveType===leaveType;
    };
    let left=new Date(selectedDate),right=new Date(selectedDate);
    for(let i=0;i<120;i++){const d=addRosterDays(left,-1),e=entries.get(localISO(d));if(!compatible(e))break;left=d}
    for(let i=0;i<120;i++){const d=addRosterDays(right,1),e=entries.get(localISO(d));if(!compatible(e))break;right=d}
    const leaveEntries=[];
    for(let d=new Date(left);d<=right;d=addRosterDays(d,1)){
      const e=entries.get(localISO(d)),data=SHIFT_DATA[e?.row?.code];
      if(validActual(e)&&data?.leaveType===leaveType)leaveEntries.push(e);
    }
    if(!leaveEntries.length)leaveEntries.push(entry);
    const first=leaveEntries[0],last=leaveEntries[leaveEntries.length-1];
    const hours=leaveEntries.reduce((sum,e)=>{const d=SHIFT_DATA[e.row.code];const h=e.row.leaveHours===''||e.row.leaveHours==null?(d?.defaultHours||10):Number(e.row.leaveHours);return sum+(Number(h)||0)},0);
    const reason=entry.row.personalLeaveReason||'illness';
    return {leaveType,leaveEntries,start:first.date,end:last.date,hours,reason};
  }
  const leaveLabel=type=>type==='annual'?'Annual Leave':type==='sick'?'Personal Leave':type==='lsl'?'Long Service Leave':type==='lwop'?'Leave Without Pay':'Other Leave';
  function leaveReasonForEntry(e){return e?.row?.personalLeaveReason||'illness'}
  function leaveHoursForEntry(e){
    const d=SHIFT_DATA[e?.row?.code];
    const h=e?.row?.leaveHours===''||e?.row?.leaveHours==null?(d?.defaultHours||10):Number(e.row.leaveHours);
    return Number(h)||0;
  }
  function leaveGroupsInRange(start,end){
    const entries=rosterTimeline(),groups=new Map();
    for(let d=new Date(start);d<=end;d=addRosterDays(d,1)){
      const e=entries.get(localISO(d));
      if(!e||(e.row?.entered??Boolean(e.row?.code))!==true)continue;
      const data=SHIFT_DATA[e.row.code];if(!data?.leaveType)continue;
      const type=data.leaveType,reason=type==='sick'?leaveReasonForEntry(e):'';
      const key=type==='sick'?`${type}:${reason}`:type;
      if(!groups.has(key))groups.set(key,{key,leaveType:type,reason,entries:[],hours:0,start:new Date(d),end:new Date(d)});
      const g=groups.get(key);g.entries.push(e);g.hours+=leaveHoursForEntry(e);g.end=new Date(d);
    }
    return [...groups.values()];
  }
  function renderLeaveHoursFields(){
    if(!pendingLeaveDocument)return;
    const sv=$('#leaveFormStart')?.value,ev=$('#leaveFormEnd')?.value;if(!sv||!ev)return;
    const start=parseDate(sv),end=parseDate(ev);if(end<start)return;
    const groups=leaveGroupsInRange(start,end),wrap=$('#leaveFormHoursFields');if(!wrap)return;
    pendingLeaveDocument={...pendingLeaveDocument,start,end,groups};
    wrap.innerHTML=groups.length?groups.map((g,i)=>`<label>${esc(leaveLabel(g.leaveType))}${g.leaveType==='sick'?` — ${esc(leaveFormRow(g))}`:''} hours<input class="leave-group-hours" data-group-key="${esc(g.key)}" type="number" min="0" step="0.1" inputmode="decimal" value="${g.hours.toFixed(1)}"></label>`).join(''):'<small>No saved leave entries were found in this date range.</small>';
    const summary=$('#leaveFormRangeSummary');
    if(summary){summary.innerHTML=groups.length>1?`<strong>${groups.length} separate leave forms required</strong><small>${groups.map(g=>`${esc(leaveLabel(g.leaveType))} · ${g.hours.toFixed(1)} hrs`).join(' &nbsp;•&nbsp; ')}</small>`:`<strong>Review leave details</strong><small>Dates and hours are calculated from saved leave entries and can be adjusted before generating the PDF.</small>`}
  }
  function openLeaveFormSheet(key,entry){
    const block=leaveBlockForEntry(key,entry);if(!block)return;
    pendingLeaveDocument=block;
    const sheet=$('#leaveFormSheet');
    $('#leaveFormSheetTitle').textContent=`${leaveLabel(block.leaveType)} application`;
    $('#leaveFormStart').value=localISO(block.start);$('#leaveFormEnd').value=localISO(block.end);
    $('#leaveFormComments').value='';$('#leaveContactable').value='yes';$('#leaveEvidence').value='no';
    renderLeaveHoursFields();sheet.hidden=false;
  }
  function leaveFormRow(block){
    if(block.leaveType==='annual')return 'Annual Leave';
    if(block.leaveType==='lsl')return 'Long Service Leave';
    if(block.leaveType==='sick')return block.reason==='care'?'Providing care/support to family':block.reason==='unanticipated'?'Unanticipated matter requiring immediate attention':'Illness or injury';
    return 'Other';
  }
  function generateLeaveForm(block){
    if(!block)return;
    const startValue=$('#leaveFormStart')?.value,endValue=$('#leaveFormEnd')?.value;
    if(!startValue||!endValue){toast('Enter the leave start and end dates');return}
    const adjustedStart=parseDate(startValue),adjustedEnd=parseDate(endValue);
    if(adjustedEnd<adjustedStart){toast('End date must be on or after start date');return}
    let groups=leaveGroupsInRange(adjustedStart,adjustedEnd);
    if(!groups.length){toast('No saved leave entries found in this date range');return}
    $$('.leave-group-hours').forEach(input=>{
      const g=groups.find(x=>x.key===input.dataset.groupKey),v=Number(input.value);
      if(g&&Number.isFinite(v))g.hours=Math.max(0,v);
    });

    const name=String(current.settings.employeeName||'').trim();
    const service=String(current.settings.serviceNumber||'').trim();
    const home=window.ROSTER_LINES?.[current.settings.homeLine]||current.settings.homeLine||'';
    const comments=String($('#leaveFormComments')?.value||'').trim();
    const contactable=$('#leaveContactable')?.value==='yes';
    const evidence=$('#leaveEvidence')?.value==='yes';
    const today=new Date();

    // Coordinates are percentages of the official 1414×2000 page supplied by Rosters.
    const pct=(v,total)=>`${(v/total*100).toFixed(4)}%`;
    const overlay=(x,y,w,h,value,cls='')=>value===undefined||value===null||value===''?'':`<div class="field ${cls}" style="left:${pct(x,1414)};top:${pct(y,2000)};width:${pct(w,1414)};height:${pct(h,2000)}">${esc(value)}</div>`;
    const mark=(x,y,on)=>on?`<div class="tick" style="left:${pct(x,1414)};top:${pct(y,2000)}">✓</div>`:'';

    const leaveRowY=g=>{
      if(g.leaveType==='annual')return 554;
      if(g.leaveType==='lsl')return 632;
      if(g.leaveType==='sick'){
        if(g.reason==='care')return 812;
        if(g.reason==='unanticipated')return 858;
        return 771;
      }
      // Other existing ShiftMate leave categories currently map to the official "Other" row.
      return 1238;
    };

    const pageFor=(g,index)=>{
      const first=g.entries[0]?.date||adjustedStart;
      const last=g.entries[g.entries.length-1]?.date||adjustedEnd;
      const y=leaveRowY(g);
      const fields=[
        overlay(198,267,1135,38,name,'strong'),
        overlay(1080,311,250,34,service,'strong'),
        overlay(263,359,560,34,home,'strong'),
        overlay(616,y,145,34,fmtFormDate(first)),
        overlay(786,y,157,34,fmtFormDate(last)),
        overlay(969,y,94,34,g.hours.toFixed(1)),
        overlay(1084,y,255,34,comments),
        overlay(391,1710,365,34,name),
        overlay(391,1801,365,34,fmtFormDate(today))
      ].join('');

      // Section 3 official boxes: contactable Yes/No and evidence Yes/No.
      const ticks=[
        mark(593,1366,contactable),
        mark(725,1342,!contactable),
        mark(593,1434,evidence),
        mark(725,1410,!evidence)
      ].join('');

      return `<section class="leave-page${index?' page-break':''}">
        <img class="leave-template" src="./leave-form-template.png" alt="">
        ${fields}${ticks}
      </section>`;
    };

    const html=`<!doctype html><html><head><meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <title>Leave Application - ${esc(name||'Transit Officer')}</title>
      <style>
        @page{size:A4;margin:0}
        *{box-sizing:border-box}
        html,body{margin:0;padding:0;background:#fff;font-family:Arial,sans-serif}
        .toolbar{padding:10px;background:#fff;position:sticky;top:0;z-index:5}
        .toolbar button{padding:7px 12px;margin-right:8px;border:0;border-radius:8px;background:#eee}
        .leave-page{position:relative;width:210mm;height:297mm;margin:0 auto;background:white;overflow:hidden}
        .leave-template{position:absolute;inset:0;width:100%;height:100%;display:block}
        .field{position:absolute;display:flex;align-items:center;padding:0 1px;color:#111;font-size:3.45mm;line-height:1;white-space:nowrap;overflow:hidden}
        .field.strong{font-weight:400}
        .tick{position:absolute;color:#111;font-size:3.4mm;font-weight:700;line-height:1}
        .page-break{break-before:page;page-break-before:always}
        @media print{
          .toolbar{display:none!important}
          .leave-page{margin:0;break-after:page;page-break-after:always}
          .leave-page:last-child{break-after:auto;page-break-after:auto}
        }
      </style></head><body>
      <div class="toolbar"><button onclick="window.print()">Print / Save PDF</button><button onclick="window.close()">Close</button></div>
      ${groups.map(pageFor).join('')}
      </body></html>`;

    const w=window.open('','_blank');
    if(!w){alert('Allow pop-ups for ShiftMate TEST to generate the leave form.');return}
    w.document.open();w.document.write(html);w.document.close();
    $('#leaveFormSheet').hidden=true;pendingLeaveDocument=null;
    toast(groups.length>1?`${groups.length} separate leave forms generated`:'Leave form generated');
  }

  function renderCalendarDetail(key,entry){
    const detail=$('#calendarDetail');if(!detail)return;
    $$('.calendar-day').forEach(el=>el.classList.toggle('selected',el.dataset.key===key));
    const date=parseDate(key),row=entry?.row||emptyDay(),data=SHIFT_DATA[row.code];
    const lineKey=row.offline?(row.workedRosterLine||data?.line):data?.line;
    const line=window.ROSTER_LINES?.[lineKey]||lineKey||'';
    detail.hidden=false;
    detail.innerHTML=`<span class="eyebrow">${date.toLocaleDateString('en-AU',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</span>
      <h2>${rosterDisplayCode(entry)}${data?.name&&!data?.leaveType?` — ${data.name}`:''}</h2>
      <div class="calendar-detail-grid">
        <div><span>Time</span><strong>${data?.leaveType?(data.name||'Leave'):(row.start&&row.finish?`${row.start}–${row.finish}`:'Off')}</strong></div>
        ${line&&line!=='LEAVE'?`<div><span>Line</span><strong>${line}</strong></div>`:''}
        ${(()=>{const v=rosterVariation(row,date);return v.early>0?`<div><span>Early start OT</span><strong>${v.early.toFixed(2)} hrs</strong></div>`:''})()}
        ${(()=>{const v=rosterVariation(row,date);return v.extension>0?`<div><span>Shift extension OT</span><strong>${v.extension.toFixed(2)} hrs</strong></div>`:''})()}
        ${(()=>{const v=rosterVariation(row,date);return v.forced>0?`<div><span>Built-in forced OT</span><strong>${v.forced.toFixed(2)} hrs</strong></div>`:''})()}
        ${row.code&&row.type!=='Off'&&!data?.leaveType?`<label class="calendar-partner-field"><span>Partner</span><input class="calendar-partner-input" type="text" list="partnerSuggestions" value="${String(row.partner||'').replace(/&/g,'&amp;').replace(/\"/g,'&quot;')}" placeholder="Add partner"></label>`:''}
        ${row.hd?`<div><span>Higher duties</span><strong>Yes</strong></div>`:''}
        ${row.offline?`<div><span>Offline shift</span><strong>Yes</strong></div>`:''}
      </div>
      ${data?.leaveType?'<button type="button" class="primary calendar-leave-form-button">Generate Leave Form</button>':''}`;
    const leaveButton=detail.querySelector('.calendar-leave-form-button');if(leaveButton)leaveButton.onclick=()=>openLeaveFormSheet(key,entry);
    const partnerInput=detail.querySelector('.calendar-partner-input');
    if(partnerInput){
      const persist=()=>saveCalendarPartner(entry,key,partnerInput.value);
      partnerInput.addEventListener('change',persist);
      partnerInput.addEventListener('blur',persist);
    }
  }


  // Projected-roster profiles are keyed by home line + roster family inferred from current level.
  // Current roster line independently selects the officer's position within that rotation.
  // Profiles are planning-only and never write to actual roster/pay data.
  const ROSTER_PROJECTION_PROFILES={
    'ARMADALE|TRANSIT':{
      label:'Armadale · Regular Transit',
      cycleAnchor:'2026-05-03',
      lineCount:72,
      dutyBase:3001,
      pattern:{
        1:['','','X','X','X','X','','','X','X','X','X','',''],
        2:['','','X','X','','','X','X','','','X','X','X','X'],
        3:['X','X','','','','','X','X','X','X','','','X','X'],
        4:['X','','','X','X','X','','','X','X','X','X','',''],
        5:['','','','','','','','','','','','','',''],
        6:['X','X','','','X','X','X','X','','','','X','X',''],
        7:['','X','X','X','X','X','','','','X','X','','','X'],
        8:['X','X','X','','','','X','X','X','','','','X','X'],
        9:['','','','','','','','','','','','','',''],
        10:['','','X','X','X','X','','','X','X','X','X','',''],
        11:['','','X','X','','','X','X','','','X','X','X','X'],
        12:['X','X','','','','','X','X','X','X','','','X','X'],
        13:['X','','','X','X','X','','','X','X','X','X','',''],
        14:['','','','','','','','','','','','','',''],
        15:['X','X','','','X','X','X','X','','','','X','X',''],
        16:['','X','X','X','X','X','','','','X','X','','','X'],
        17:['X','X','X','','','','X','X','X','','','','X','X'],
        18:['','','','','','','','','','','','','',''],
        19:['','','M','M','M','M','M','','','M','M','M','',''],
        20:['M','M','','','','M','M','M','M','','','','M','M'],
        21:['X','X','','','','','X','X','X','X','','','X','X'],
        22:['X','','','X','X','X','','','X','X','X','X','',''],
        23:['','','','','','','','','','','','','',''],
        24:['X','X','','','X','X','X','X','','','','X','X',''],
        25:['','X','X','X','X','X','','','','X','X','','','X'],
        26:['X','X','X','','','','X','X','X','','','','X','X'],
        27:['','','','','','','','','','','','','',''],
        28:['','','X','X','X','X','','','X','X','X','X','',''],
        29:['','','X','X','','','X','X','','','X','X','X','X'],
        30:['X','X','','','','','X','X','X','X','','','X','X'],
        31:['X','','','X','X','X','','','X','X','X','X','',''],
        32:['','','','','','','','','','','','','',''],
        33:['X','X','','','X','X','X','X','','','','X','X',''],
        34:['','X','X','X','X','X','','','','X','X','','','X'],
        35:['X','X','X','','','','X','X','X','','','','X','X'],
        36:['','','','','','','','','','','','','',''],
        37:['','','X','X','X','X','','','X','X','X','X','',''],
        38:['','','X','X','','','X','X','','','X','X','X','X'],
        39:['X','X','','','','','X','X','X','X','','','X','X'],
        40:['X','','','X','X','X','','','X','X','X','X','',''],
        41:['','','','','','','','','','','','','',''],
        42:['X','X','','','X','X','X','X','','','','X','X',''],
        43:['','X','X','X','X','X','','','','X','X','','','X'],
        44:['X','X','X','','','','X','X','X','','','','X','X'],
        45:['','','','','','','','','','','','','',''],
        46:['','','X','X','X','X','','','X','X','X','X','',''],
        47:['','','X','X','','','X','X','','','X','X','X','X'],
        48:['X','X','','','','','X','X','X','X','','','X','X'],
        49:['X','','','X','X','X','','','X','X','X','X','',''],
        50:['','','','','','','','','','','','','',''],
        51:['X','X','','','X','X','X','X','','','','X','X',''],
        52:['','X','X','X','X','X','','','','X','X','','','X'],
        53:['X','X','X','','','','X','X','X','','','','X','X'],
        54:['','','','','','','','','','','','','',''],
        55:['','','X','X','X','X','','','X','X','X','X','',''],
        56:['','','X','X','','','X','X','','','X','X','X','X'],
        57:['X','X','','','','','X','X','X','X','','','X','X'],
        58:['X','','','X','X','X','','','X','X','X','X','',''],
        59:['','','','','','','','','','','','','',''],
        60:['X','X','','','X','X','X','X','','','','X','X',''],
        61:['','X','X','X','X','X','','','','X','X','','','X'],
        62:['X','X','X','','','','X','X','X','','','','X','X'],
        63:['','','','','','','','','','','','','',''],
        64:['','','X','X','X','X','','','X','X','X','X','',''],
        65:['','','X','X','','','X','X','','','X','X','X','X'],
        66:['X','X','','','','','X','X','X','X','','','X','X'],
        67:['X','','','X','X','X','','','X','X','X','X','',''],
        68:['','','','','','','','','','','','','',''],
        69:['X','X','','','X','X','X','X','','','','X','X',''],
        70:['','X','X','X','X','X','','','','X','X','','','X'],
        71:['X','X','X','','','','X','X','X','','','','X','X'],
        72:['','','','','','','','','','','','','','']
      },
      times:{
        1:[null,null,['14:45','00:45'],['14:50','00:50'],['14:45','00:45'],['15:45','01:45'],null,null,['14:30','00:30'],['15:15','01:15'],['14:45','00:45'],['14:45','00:45'],null,null],
        2:[null,null,['15:00','01:00'],['14:30','00:30'],null,null,['15:45','01:45'],['14:45','00:45'],null,null,['15:15','01:15'],['14:30','00:30'],['16:45','02:45'],['15:45','01:45']],
        3:[['14:45','00:45'],['15:15','01:15'],null,null,null,null,['17:15','03:15'],['14:45','00:45'],['14:45','00:45'],['14:30','00:30'],null,null,['15:45','01:45'],['17:15','03:15']],
        4:[['15:30','01:30'],null,null,['15:00','01:00'],['14:30','00:30'],['16:45','02:45'],null,null,['14:45','00:45'],['15:00','01:00'],['14:45','00:45'],['14:45','00:45'],null,null],
        5:[null,null,null,null,null,null,null,null,null,null,null,null,null,null],
        6:[['14:45','00:45'],['14:45','00:45'],null,null,['14:50','00:50'],['15:30','01:30'],['16:45','02:45'],['14:50','00:50'],null,null,null,['15:15','01:15'],['15:45','01:45'],null],
        7:[null,['15:30','01:30'],['14:45','00:45'],['14:45','00:45'],['15:00','01:00'],['16:00','02:00'],null,null,null,['14:45','00:45'],['15:00','01:00'],null,null,['15:45','01:45']],
        8:[['14:45','00:45'],['14:30','00:30'],['15:15','01:15'],null,null,null,['15:30','01:30'],['14:45','00:45'],['14:50','00:50'],null,null,null,['16:45','02:45'],['15:45','01:45']],
        9:[null,null,null,null,null,null,null,null,null,null,null,null,null,null],
        10:[null,null,['14:50','00:50'],['14:45','00:45'],['14:45','00:45'],['17:00','03:00'],null,null,['14:45','00:45'],['15:15','01:15'],['14:45','00:45'],['15:00','01:00'],null,null],
        11:[null,null,['15:30','01:30'],['15:15','01:15'],null,null,['16:00','02:00'],['14:30','00:30'],null,null,['14:45','00:45'],['14:45','00:45'],['17:15','03:15'],['15:45','01:45']],
        12:[['14:50','00:50'],['14:45','00:45'],null,null,null,null,['17:15','03:15'],['14:50','00:50'],['14:30','00:30'],['14:45','00:45'],null,null,['15:45','01:45'],['16:00','02:00']],
        13:[['15:15','01:15'],null,null,['14:50','00:50'],['14:45','00:45'],['16:45','02:45'],null,null,['14:50','00:50'],['14:30','00:30'],['14:45','00:45'],['14:30','00:30'],null,null],
        14:[null,null,null,null,null,null,null,null,null,null,null,null,null,null],
        15:[['15:00','01:00'],['14:45','00:45'],null,null,['15:15','01:15'],['16:45','02:45'],['15:45','01:45'],['15:00','01:00'],null,null,null,['14:45','00:45'],['15:45','01:45'],null],
        16:[null,['14:45','00:45'],['15:15','01:15'],['15:30','01:30'],['15:15','01:15'],['16:15','02:15'],null,null,null,['14:50','00:50'],['14:30','00:30'],null,null,['15:45','01:45']],
        17:[['15:15','01:15'],['15:15','01:15'],['14:50','00:50'],null,null,null,['16:45','02:45'],['14:45','00:45'],['15:00','01:00'],null,null,null,['16:45','02:45'],['15:45','01:45']],
        18:[null,null,null,null,null,null,null,null,null,null,null,null,null,null],
        19:[null,null,['05:30','15:30'],['05:30','15:30'],['05:30','15:30'],['05:30','15:30'],['05:30','15:30'],null,null,['05:30','15:30'],['05:30','15:30'],['05:30','15:30'],null,null],
        20:[['05:30','15:30'],['05:30','15:30'],null,null,null,['05:30','15:30'],['05:30','15:30'],['05:30','15:30'],['05:30','15:30'],null,null,null,['05:30','15:30'],['05:30','15:30']],
        21:[['14:45','00:45'],['14:50','00:50'],null,null,null,null,['16:15','02:15'],['14:45','00:45'],['15:15','01:15'],['15:00','01:00'],null,null,['15:30','01:30'],['16:45','02:45']],
        22:[['15:15','01:15'],null,null,['14:45','00:45'],['14:50','00:50'],['17:15','03:15'],null,null,['15:15','01:15'],['14:45','00:45'],['15:00','01:00'],['14:50','00:50'],null,null],
        23:[null,null,null,null,null,null,null,null,null,null,null,null,null,null],
        24:[['14:45','00:45'],['14:50','00:50'],null,null,['14:45','00:45'],['16:00','02:00'],['16:45','02:45'],['15:15','01:15'],null,null,null,['15:00','01:00'],['16:00','02:00'],null],
        25:[null,['15:15','01:15'],['15:00','01:00'],['14:50','00:50'],['14:45','00:45'],['17:00','03:00'],null,null,null,['14:45','00:45'],['14:30','00:30'],null,null,['15:30','01:30']],
        26:[['14:45','00:45'],['14:45','00:45'],['14:45','00:45'],null,null,null,['16:15','02:15'],['14:45','00:45'],['14:45','00:45'],null,null,null,['17:00','03:00'],['16:00','02:00']],
        27:[null,null,null,null,null,null,null,null,null,null,null,null,null,null],
        28:[null,null,['14:30','00:30'],['14:45','00:45'],['14:50','00:50'],['16:30','02:30'],null,null,['14:45','00:45'],['14:45','00:45'],['14:50','00:50'],['15:15','01:15'],null,null],
        29:[null,null,['15:15','01:15'],['15:15','01:15'],null,null,['16:45','02:45'],['14:45','00:45'],null,null,['14:45','00:45'],['15:15','01:15'],['16:00','02:00'],['17:15','03:15']],
        30:[['14:30','00:30'],['14:45','00:45'],null,null,null,null,['17:15','03:15'],['15:15','01:15'],['14:45','00:45'],['15:15','01:15'],null,null,['17:15','03:15'],['16:45','02:45']],
        31:[['14:50','00:50'],null,null,['14:50','00:50'],['14:45','00:45'],['16:00','02:00'],null,null,['14:50','00:50'],['14:45','00:45'],['15:15','01:15'],['14:45','00:45'],null,null],
        32:[null,null,null,null,null,null,null,null,null,null,null,null,null,null],
        33:[['15:00','01:00'],['14:50','00:50'],null,null,['15:30','01:30'],['16:45','02:45'],['16:00','02:00'],['14:45','00:45'],null,null,null,['14:50','00:50'],['16:45','02:45'],null],
        34:[null,['14:30','00:30'],['14:50','00:50'],['14:45','00:45'],['15:15','01:15'],['16:15','02:15'],null,null,null,['14:50','00:50'],['14:45','00:45'],null,null,['16:45','02:45']],
        35:[['14:45','00:45'],['15:00','01:00'],['15:15','01:15'],null,null,null,['16:45','02:45'],['14:50','00:50'],['15:15','01:15'],null,null,null,['16:15','02:15'],['17:15','03:15']],
        36:[null,null,null,null,null,null,null,null,null,null,null,null,null,null],
        37:[null,null,['15:00','01:00'],['14:30','00:30'],['14:50','00:50'],['17:15','03:15'],null,null,['14:45','00:45'],['15:15','01:15'],['15:15','01:15'],['14:45','00:45'],null,null],
        38:[null,null,['14:45','00:45'],['14:45','00:45'],null,null,['16:30','02:30'],['14:45','00:45'],null,null,['14:45','00:45'],['15:15','01:15'],['16:15','02:15'],['16:15','02:15']],
        39:[['14:45','00:45'],['14:45','00:45'],null,null,null,null,['16:45','02:45'],['15:30','01:30'],['15:00','01:00'],['14:50','00:50'],null,null,['16:15','02:15'],['16:15','02:15']],
        40:[['15:15','01:15'],null,null,['15:00','01:00'],['14:30','00:30'],['17:00','03:00'],null,null,['14:45','00:45'],['15:00','01:00'],['14:50','00:50'],['14:45','00:45'],null,null],
        41:[null,null,null,null,null,null,null,null,null,null,null,null,null,null],
        42:[['14:30','00:30'],['14:45','00:45'],null,null,['14:45','00:45'],['15:30','01:30'],['16:00','02:00'],['14:45','00:45'],null,null,null,['14:50','00:50'],['17:00','03:00'],null],
        43:[null,['15:15','01:15'],['14:45','00:45'],['14:45','00:45'],['15:00','01:00'],['16:00','02:00'],null,null,null,['14:45','00:45'],['14:50','00:50'],null,null,['16:15','02:15']],
        44:[['15:00','01:00'],['14:30','00:30'],['14:45','00:45'],null,null,null,['15:30','01:30'],['15:15','01:15'],['15:30','01:30'],null,null,null,['16:00','02:00'],['17:15','03:15']],
        45:[null,null,null,null,null,null,null,null,null,null,null,null,null,null],
        46:[null,null,['14:30','00:30'],['14:45','00:45'],['14:45','00:45'],['17:00','03:00'],null,null,['14:45','00:45'],['14:50','00:50'],['15:00','01:00'],['15:00','01:00'],null,null],
        47:[null,null,['14:45','00:45'],['15:15','01:15'],null,null,['16:00','02:00'],['14:30','00:30'],null,null,['14:45','00:45'],['14:45','00:45'],['16:15','02:15'],['16:00','02:00']],
        48:[['14:30','00:30'],['15:00','01:00'],null,null,null,null,['17:15','03:15'],['14:50','00:50'],['14:30','00:30'],['15:30','01:30'],null,null,['16:45','02:45'],['16:15','02:15']],
        49:[['14:45','00:45'],null,null,['14:30','00:30'],['14:45','00:45'],['15:45','01:45'],null,null,['14:50','00:50'],['15:15','01:15'],['15:15','01:15'],['14:50','00:50'],null,null],
        50:[null,null,null,null,null,null,null,null,null,null,null,null,null,null],
        51:[['14:45','00:45'],['14:45','00:45'],null,null,['15:15','01:15'],['16:45','02:45'],['15:45','01:45'],['15:00','01:00'],null,null,null,['14:30','00:30'],['17:00','03:00'],null],
        52:[null,['15:00','01:00'],['14:45','00:45'],['15:00','01:00'],['14:30','00:30'],['16:15','02:15'],null,null,null,['14:45','00:45'],['15:30','01:30'],null,null,['17:15','03:15']],
        53:[['14:45','00:45'],['14:30','00:30'],['15:00','01:00'],null,null,null,['16:45','02:45'],['14:45','00:45'],['15:00','01:00'],null,null,null,['15:45','01:45'],['16:45','02:45']],
        54:[null,null,null,null,null,null,null,null,null,null,null,null,null,null],
        55:[null,null,['14:45','00:45'],['14:45','00:45'],['15:00','01:00'],['15:45','01:45'],null,null,['14:45','00:45'],['14:45','00:45'],['14:30','00:30'],['14:45','00:45'],null,null],
        56:[null,null,['14:30','00:30'],['15:00','01:00'],null,null,['16:15','02:15'],['14:45','00:45'],null,null,['14:50','00:50'],['15:30','01:30'],['16:45','02:45'],['17:15','03:15']],
        57:[['15:15','01:15'],['15:15','01:15'],null,null,null,null,['15:45','01:45'],['15:15','01:15'],['14:45','00:45'],['14:45','00:45'],null,null,['17:00','03:00'],['16:00','02:00']],
        58:[['14:45','00:45'],null,null,['14:45','00:45'],['14:45','00:45'],['15:45','01:45'],null,null,['15:15','01:15'],['14:45','00:45'],['14:45','00:45'],['14:30','00:30'],null,null],
        59:[null,null,null,null,null,null,null,null,null,null,null,null,null,null],
        60:[['14:50','00:50'],['14:45','00:45'],null,null,['15:00','01:00'],['15:45','01:45'],['17:15','03:15'],['14:30','00:30'],null,null,null,['14:45','00:45'],['15:30','01:30'],null],
        61:[null,['15:15','01:15'],['14:45','00:45'],['14:30','00:30'],['14:45','00:45'],['16:15','02:15'],null,null,null,['15:15','01:15'],['14:45','00:45'],null,null,['15:30','01:30']],
        62:[['14:50','00:50'],['15:00','01:00'],['14:45','00:45'],null,null,null,['15:45','01:45'],['15:15','01:15'],['14:30','00:30'],null,null,null,['16:30','02:30'],['16:45','02:45']],
        63:[null,null,null,null,null,null,null,null,null,null,null,null,null,null],
        64:[null,null,['14:45','00:45'],['14:45','00:45'],['14:30','00:30'],['16:45','02:45'],null,null,['14:45','00:45'],['15:00','01:00'],['15:15','01:15'],['14:45','00:45'],null,null],
        65:[null,null,['15:15','01:15'],['14:45','00:45'],null,null,['17:15','03:15'],['14:45','00:45'],null,null,['14:45','00:45'],['15:15','01:15'],['16:45','02:45'],['16:45','02:45']],
        66:[['15:00','01:00'],['14:50','00:50'],null,null,null,null,['16:15','02:15'],['15:00','01:00'],['14:45','00:45'],['14:30','00:30'],null,null,['16:15','02:15'],['16:45','02:45']],
        67:[['15:15','01:15'],null,null,['15:15','01:15'],['14:45','00:45'],['16:45','02:45'],null,null,['15:15','01:15'],['14:45','00:45'],['14:30','00:30'],['14:45','00:45'],null,null],
        68:[null,null,null,null,null,null,null,null,null,null,null,null,null,null],
        69:[['14:30','00:30'],['14:45','00:45'],null,null,['14:45','00:45'],['16:15','02:15'],['15:45','01:45'],['15:00','01:00'],null,null,null,['15:00','01:00'],['16:00','02:00'],null],
        70:[null,['14:45','00:45'],['14:50','00:50'],['15:15','01:15'],['15:15','01:15'],['16:45','02:45'],null,null,null,['14:45','00:45'],['15:00','01:00'],null,null,['16:30','02:30']],
        71:[['14:45','00:45'],['14:45','00:45'],['15:15','01:15'],null,null,null,['16:15','02:15'],['14:30','00:30'],['15:00','01:00'],null,null,null,['16:45','02:45'],['16:15','02:15']],
        72:[null,null,null,null,null,null,null,null,null,null,null,null,null,null]
      }
    },
    'ARMADALE|SENIOR_TRANSIT':{
      label:'Armadale · Senior Transit',
      cycleAnchor:'2026-08-09',
      lineCount:6,
      pattern:{
        1:['X','X','','','','X','X','X','X','X','X','','',''],
        2:['','','','X','X','X','X','X','','','X','X','X',''],
        3:['','M','M','M','M','','','','','','M','M','M','M'],
        4:['M','','','','M','M','M','M','M','','','','X','X'],
        5:['X','X','X','X','','','','','X','X','X','X','',''],
        6:['','X','X','X','X','X','','','','','','X','X','X']
      }
    }
  };
  const mod=(n,m)=>((n%m)+m)%m;
  function rosterTypeForSettings(settings=current.settings){
    return projectionRoleForSettings(settings);
  }
  function projectionProfileKey(settings=current.settings){return `${settings?.homeLine||''}|${rosterTypeForSettings(settings)}`}
  function currentProjectionProfile(){
    const raw=ROSTER_PROJECTION_PROFILES[projectionProfileKey()];if(!raw)return null;
    return {...raw,cycleAnchorDate:parseDate(raw.cycleAnchor)};
  }
  function projectionFortnightStartForProfile(date,profile=currentProjectionProfile()){
    if(!profile)return null;
    const d=startOfRosterDay(date),days=Math.floor((d-profile.cycleAnchorDate)/86400000),n=Math.floor(days/14);
    return addRosterDays(profile.cycleAnchorDate,n*14);
  }
  function normalisedRosterLineAnchor(profile=currentProjectionProfile()){
    if(!profile)return null;
    const raw=String(current.settings.rosterLineAnchorDate||'');
    const candidate=/^\d{4}-\d{2}-\d{2}$/.test(raw)?parseDate(raw):profile.cycleAnchorDate;
    return projectionFortnightStartForProfile(candidate,profile);
  }
  function rosterProjectionForDate(date){
    const profile=currentProjectionProfile();if(!profile)return null;
    const d=startOfRosterDay(date),fortnightStart=projectionFortnightStartForProfile(d,profile),anchor=normalisedRosterLineAnchor(profile);
    const offset=Math.round((fortnightStart-anchor)/(14*86400000));
    const anchorLine=Math.min(profile.lineCount,Math.max(1,Number(current.settings.rosterLineNumber)||1));
    const line=mod((anchorLine-1)+offset,profile.lineCount)+1;
    const day=Math.round((d-fortnightStart)/86400000),mark=profile.pattern[line]?.[day]||'';
    const sourceTimes=profile.times?.[line]?.[day]||null;
    return {profile,line,day:day+1,mark,working:Boolean(mark),shiftType:mark==='M'?'Morning':mark==='X'?'Arvo':'Off',
      start:sourceTimes?.[0]||'',finish:sourceTimes?.[1]||'',fortnightStart};
  }
  function projectionCurrentLineToday(){const p=rosterProjectionForDate(new Date());return p?.line||null}
  function projectedSettingsForDate(date){
    const settings={...current.settings};
    const resolved=PTA_AGREEMENT.resolve(settings,date);
    settings.baseRate=resolved.baseRate;
    settings.wdMult=resolved.rules.weekday;
    settings.satMult=resolved.rules.saturday;
    settings.sunMult=resolved.rules.sunday;
    settings.addHoursMult=resolved.rules.weekdayOvertime;
    settings.weekendOtMult=resolved.rules.weekendOvertime;
    settings.publicHolidayWorkedMult=resolved.rules.publicHolidayWorked+1;
    return settings;
  }
  function projectedCandidateCodes(date,shiftType){
    const group=PayCalc.dayGroup(date.getDay()),home=current.settings.homeLine;
    return [...new Set(Object.entries(SHIFT_DATA).filter(([code,data])=>{
      if(!data||data.leaveType||data.line!==home||data.allowance!=='Morn/Aft'||/HIGHER DUTIES/i.test(data.name||''))return false;
      const times=data.times?.[group];if(!times)return false;
      const startHour=Number(String(times[0]).split(':')[0]);
      return shiftType==='Morning'?startHour<12:startHour>=12;
    }).map(([code])=>code))];
  }
  function projectedDayGross(date,code){
    const settings=projectedSettingsForDate(date),baselineDays=Array.from({length:14},()=>({...emptyDay(),type:'Off'})),candidateDays=Array.from({length:14},()=>({...emptyDay(),type:'Off'}));
    candidateDays[0]={...emptyDay(),code,type:'Rostered',entered:true,phBenefit:'lieu'};
    const startDate=localISO(date);
    return Math.max(0,PayCalc.calculate({startDate,settings,days:candidateDays}).gross-PayCalc.calculate({startDate,settings,days:baselineDays}).gross);
  }
  function projectionFortnightStart(date){
    return rosterProjectionForDate(date)?.fortnightStart||null;
  }

  function cycleResult(cycle){
    if(!cycle)return null;
    if(cycle.startDate===current.startDate&&latestResult)return latestResult;
    return PayCalc.calculate(cycle);
  }

  function availableCycles(){
    const saved=AppStorage.loadCycles().map(c=>({...c}));
    if(current?.startDate&&!saved.some(c=>c.startDate===current.startDate)){
      const result=latestResult||PayCalc.calculate(current);
      saved.push({...JSON.parse(JSON.stringify(current)),id:'current-unsaved',
        summary:{gross:result.gross,taxable:result.taxable,tax:result.tax,hours:result.hours,net:result.net,netHourly:result.netHourly},
        actualDeposit:'',notes:'',updatedAt:new Date().toISOString()});
    }
    return saved;
  }

  function upcomingPayCycle(){
    const today=startOfRosterDay(new Date());
    const upcoming=availableCycles().filter(c=>paydayFor(c.startDate)>=today)
      .sort((a,b)=>paydayFor(a.startDate)-paydayFor(b.startDate));
    return upcoming[0]||availableCycles().sort((a,b)=>b.startDate.localeCompare(a.startDate))[0]||null;
  }

  function loadCycleIntoRoster(cycle){
    if(!cycle)return;
    current=JSON.parse(JSON.stringify({startDate:cycle.startDate,settings:cycle.settings,days:cycle.days}));
    current.days=current.days.map(row=>({...emptyDay(),...row,entered:Boolean(row.code)}));
    AppStorage.saveCurrent(current);
    buildRoster();
  }
  function cycleById(id){return availableCycles().find(c=>c.id===id)||null}
  function activeDashboardCycle(){
    return selectedPayCycleId?cycleById(selectedPayCycleId):upcomingPayCycle();
  }
  function renderHomeCycleSelector(){
    const select=$('#homeCycleSelect');if(!select)return;
    const cycles=availableCycles().sort((a,b)=>a.startDate.localeCompare(b.startDate));
    select.innerHTML=cycles.map(c=>`<option value="${c.id}">${peLabel(c.startDate)}</option>`).join('');
    let selected=activeDashboardCycle();
    if(!selected)selected=cycles[cycles.length-1]||null;
    if(selected){selectedPayCycleId=selected.id;select.value=selected.id}
    select.disabled=!cycles.length;
  }
  function selectAppCycle(id){
    const cycle=cycleById(id);if(!cycle)return;
    selectedPayCycleId=cycle.id;
    loadCycleIntoRoster(cycle);
    calendarCursor=new Date(parseDate(cycle.startDate).getFullYear(),parseDate(cycle.startDate).getMonth(),1);
    renderHomeDashboard();
    renderPayScreen();
    renderCalendar();
  }
  function renderHomeDashboard(){
    const cycle=activeDashboardCycle();
    if(cycle){
      const result=cycleResult(cycle);
      $('#homeCycleRange').textContent=cycleDateRange(cycle.startDate);
      $('#homeNet').textContent=money(result?.net||cycle.summary?.net||0);
      $('#homeCurrentPayday').textContent=`Payday ${paydayFor(cycle.startDate).toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'})}`;
      const entered=(cycle.days||[]).filter(d=>(d.entered??Boolean(d.code))&&d.code).length;
      $('#homeRosterStatus').textContent=`${entered} ${entered===1?'shift':'shifts'} entered • ${Number(result?.hours||cycle.summary?.hours||0).toFixed(1)} hrs`;
    }else{
      $('#homeCycleRange').textContent='No upcoming pay';$('#homeNet').textContent=money(0);
      $('#homeCurrentPayday').textContent='Payday —';$('#homeRosterStatus').textContent='No upcoming cycle saved';
    }
    renderHomeCycleSelector();
    renderFortnightStrip();
    renderHomeSettingsSummary();
  }
  function renderHomeSettingsSummary(){
    const wrap=$('#homeSettingsChips');if(!wrap)return;
    const lineNames=window.ROSTER_LINES||{};
    const homeLabel=lineNames[current.settings.homeLine]||current.settings.homeLine||'—';
    const rosterLine=Math.max(1,Number(current.settings.rosterLineNumber)||1);
    const deductions=['lease','gesb','postTax','extraTax'].filter(k=>Math.abs(Number(current.settings[k])||0)>0).length;
    const target=Math.min(5,Math.max(1,Number(current.settings.otTarget)||1));
    wrap.innerHTML=`<span class="setting-chip"><b>${current.settings.classification||'—'}</b></span>
      <span class="setting-chip"><small>Home</small><b>${homeLabel}</b></span>
      <span class="setting-chip state"><i class="status-lamp on"></i><small>Line</small><b>${rosterLine}</b></span>
      <span class="setting-chip state"><i class="status-lamp ${deductions?'on':'off'}"></i><small>Deductions</small><b>${deductions?`${deductions} active`:'Off'}</b></span>
      <span class="setting-chip"><small>OT target</small><b>${target}</b></span>`;
  }
  const leaveOrder=['A/L','Sick','LSL','LWOP'];
  const rosterLineOptions=(selected='')=>Object.entries(window.ROSTER_LINES||{}).map(([value,label])=>`<option value="${value}" ${value===selected?'selected':''}>${label}</option>`).join('');
  const opts=(selected,line,date=null)=>{
    const group=date?PayCalc.dayGroup(date.getDay()):null;
    const normal=Object.keys(SHIFT_DATA)
      .filter(code=>{
        const data=SHIFT_DATA[code];
        if(data.line!==line)return false;
        if(!group)return true;
        const times=data.times?.[group]||['',''];
        return Boolean(times[0]&&times[1]);
      })
      .sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
    const codes=['',...normal,...leaveOrder.filter(code=>SHIFT_DATA[code])];
    return codes.map(code=>`<option value="${code}" ${code===selected?'selected':''}>${code?`${code} — ${SHIFT_DATA[code].name}`:'Off / no shift'}</option>`).join('');
  };
  const toast=text=>{const el=$('#toast');el.textContent=text;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),1600)};

  let current=AppStorage.loadCurrent()||{
    startDate:localISO(new Date()),
    settings:{...defaults},
    days:Array.from({length:14},emptyDay)
  };
  let activeCycleId=null;
  let selectedPayCycleId=null;
  let latestResult=null;
  let calendarCursor=new Date();
  calendarCursor=new Date(calendarCursor.getFullYear(),calendarCursor.getMonth(),1);

  const stringSettings=new Set(['rateSource','employmentRole','toCommencementDate','fcoAppointmentDate','stoPromotionDate','previousRoleBeforeSto','classification','employeeName','serviceNumber','customPublicHolidays','homeLine','rosterLineAnchorDate']);
  const boolSettings=new Set(['classificationOverride']);
  const normaliseSettings=raw=>Object.fromEntries(Object.keys(defaults).map(k=>{
    if(stringSettings.has(k))return [k,String(raw?.[k]??defaults[k])];
    if(boolSettings.has(k))return [k,Boolean(raw?.[k]??defaults[k])];
    return [k,Number(raw?.[k]??defaults[k])];
  }));
  function resolveAgreementSettings(){
    const resolved=PTA_AGREEMENT.resolve(current.settings,current.startDate);
    current.settings.baseRate=resolved.baseRate;
    current.settings.wdMult=resolved.rules.weekday;
    current.settings.satMult=resolved.rules.saturday;
    current.settings.sunMult=resolved.rules.sunday;
    current.settings.addHoursMult=resolved.rules.weekdayOvertime;
    current.settings.weekendOtMult=resolved.rules.weekendOvertime;
    current.settings.publicHolidayWorkedMult=resolved.rules.publicHolidayWorked+1;
    current.resolvedAgreement=resolved;
    return resolved;
  }
  if(current.settings && current.settings.annualLeaveLoadingRate==null){
    current.settings.annualLeaveLoadingRate=12.55;
  }
  current.settings=normaliseSettings(current.settings);
  // V7.3: users select their current level directly. Agreement rates are automatic.
  current.settings.rateSource='agreement';
  current.settings.classificationOverride=true;
  resolveAgreementSettings();
  current.days=(current.days||[]).slice(0,14);
  while(current.days.length<14) current.days.push(emptyDay());
  current.days=current.days.map(row=>{
    const next={...emptyDay(),...row};
    if(row?.entered==null)next.entered=Boolean(row?.code);
    const data=SHIFT_DATA[next.code];
    if(!next.workedRosterLine){
      next.workedRosterLine=data?.line&&data.line!=='LEAVE'?data.line:(current?.settings?.homeLine||'');
    }
    next.offline=Boolean(next.workedRosterLine&&current?.settings?.homeLine&&next.workedRosterLine!==current.settings.homeLine);
    if(data&&data.line&&data.line!=='LEAVE'&&data.line!==current.settings.homeLine){
      next.offline=true;
      next.workedRosterLine=next.workedRosterLine||data.line;
    }
    return next;
  });

  function go(id){
    $$('.screen').forEach(s=>s.classList.toggle('active',s.id===id));
    $$('.nav-button').forEach(b=>b.classList.toggle('active',b.dataset.go===id));
    if(id==='saved') renderSaved();
    if(id==='home') renderHomeDashboard();
    if(id==='calendar'){renderCalendar();requestAnimationFrame(sizeCalendarViewport)}
    if(id==='pay') renderPayScreen();
    window.scrollTo({top:0,behavior:'smooth'});
  }

  function effectiveRosterLine(card){
    return card.querySelector('.worked-line').value||current.settings.homeLine;
  }

  function refreshShiftOptions(card,date,selected=''){
    const line=card.querySelector('.worked-line').value||current.settings.homeLine;
    const select=card.querySelector('.shift-code');

    const validSelected=selected&&SHIFT_DATA[selected]&&(
      SHIFT_DATA[selected].line==='LEAVE'||
      (SHIFT_DATA[selected].line===line&&(()=>{
        const times=SHIFT_DATA[selected].times?.[PayCalc.dayGroup(date.getDay())]||['',''];
        return Boolean(times[0]&&times[1]);
      })())
    );

    select.innerHTML=opts(validSelected?selected:'',line,date);
    select.value=validSelected?selected:'';

    const isOffline=line!==current.settings.homeLine;
    card.dataset.offline=String(isOffline);
    card.querySelector('.offline-reason-wrap').hidden=!isOffline;
  }

  const minutesOf=t=>{if(!t)return null;const [h,m]=t.split(':').map(Number);return h*60+m};
  const addClockMinutes=(t,delta)=>{
    const m=minutesOf(t);if(m==null)return t||'';
    const x=((m+delta)%1440+1440)%1440;
    return `${String(Math.floor(x/60)).padStart(2,'0')}:${String(x%60).padStart(2,'0')}`;
  };
  const operationalShiftType=code=>{
    const c=String(code||'').trim().toUpperCase();
    if(/^\d+[AM]$/.test(c))return 'delta';
    if(/^[A-Z]+$/.test(c))return 'station';
    if(/^\d+/.test(c))return 'tango';
    return 'other';
  };
  function rosterVariation(row,date){
    const data=SHIFT_DATA[row?.code];
    if(!data||data.leaveType||row?.type==='Picked-up OT'||!row?.start||!row?.finish)return {early:0,extension:0,forced:0};
    const nominal=data.times[PayCalc.dayGroup(date.getDay())]||['',''];
    if(!nominal[0]||!nominal[1])return {early:0,extension:0};
    const ns=minutesOf(nominal[0]), nf=minutesOf(nominal[1])+(minutesOf(nominal[1])<=ns?1440:0);
    let as=minutesOf(row.start), af=minutesOf(row.finish);
    if(af<=as)af+=1440;
    // Align an after-midnight actual start with the shift's logical day if needed.
    if(as<ns-720){as+=1440;af+=1440}
    const shiftType=operationalShiftType(row.code);
    const forced=(date.getDay()===5||date.getDay()===6) && (shiftType==='station'||shiftType==='delta') ? 1 : 0;
    return {
      early:Math.max(0,(ns-as)/60),
      extension:Math.max(0,(af-nf)/60),
      forced
    };
  }

  function applyShiftDefaults(card,date,force=false){
    const code=card.querySelector('.shift-code').value;
    const data=SHIFT_DATA[code];
    const start=card.querySelector('.start-time');
    const finish=card.querySelector('.finish-time');
    const type=card.querySelector('.shift-type');
    const hd=card.querySelector('.higher-duties');
    const label=card.querySelector('.shift-time');
    if(!data){
      start.value='';finish.value='';type.value='Off';hd.value='no';label.textContent='Off / no shift';return;
    }
    const times=data.times[PayCalc.dayGroup(date.getDay())]||['',''];
    if(force||!start.value||!finish.value){start.value=times[0];finish.value=times[1]}
    if(type.value==='Off') type.value='Rostered';
    if(data.autoHigherDuties) hd.value='yes';
    label.textContent=data.leaveType?`${data.name} • ${data.defaultHours||10} paid hours`:`${data.name} • ${start.value}–${finish.value}`;
    const selectedData=SHIFT_DATA[card.querySelector('.shift-code')?.value];
    const leaveField=card.querySelector('.leave-hours-field');
    const annualPartField=card.querySelector('.annual-leave-portion-field');
    const personalReasonField=card.querySelector('.personal-leave-reason-field');
    if(leaveField)leaveField.hidden=!selectedData?.leaveType;
    if(personalReasonField)personalReasonField.hidden=selectedData?.leaveType!=='sick';
    if(annualPartField)annualPartField.hidden=selectedData?.leaveType!=='sick';

  }

  function updateRosterCardState(card){
    const code=card.querySelector('.shift-code')?.value||'';
    const rowType=card.querySelector('.shift-type')?.value||'';
    const isOvertime=rowType==='Picked-up OT'||rowType==='Overtime';
    const hasRosterEntry=Boolean(code);
    card.dataset.entered=String(hasRosterEntry);
    card.classList.toggle('roster-unentered',!hasRosterEntry);
    card.classList.toggle('roster-entered',hasRosterEntry&&!isOvertime);
    card.classList.toggle('roster-overtime',hasRosterEntry&&isOvertime);
    const start=card.querySelector('.start-time')?.value||'';
    const hour=Number(start.split(':')[0]);
    card.classList.toggle('shift-morn',hasRosterEntry&&Number.isFinite(hour)&&hour<12);
    card.classList.toggle('shift-arvo',hasRosterEntry&&Number.isFinite(hour)&&hour>=12);
    card.classList.toggle('shift-off',!hasRosterEntry);
  }

  function refreshPartnerSuggestions(){
    const list=$('#partnerSuggestions');if(!list)return;
    const names=new Set();
    const collect=cycle=>(cycle?.days||[]).forEach(row=>{const name=String(row?.partner||'').trim();if(name)names.add(name)});
    collect(current);AppStorage.loadCycles().forEach(collect);
    list.innerHTML=[...names].sort((a,b)=>a.localeCompare(b)).map(name=>`<option value="${name.replace(/&/g,'&amp;').replace(/"/g,'&quot;')}"></option>`).join('');
  }

  function buildRoster(){
    refreshPartnerSuggestions();
    const agreement=resolveAgreementSettings();
    $('#startDate').value=current.startDate;
    $('#baseRate').value=current.settings.baseRate;
    if($('#rosterRateSource'))$('#rosterRateSource').textContent=`${agreement.classificationLabel} • ${money(agreement.weeklyRate)}/week • effective ${agreement.wageEffective||'manual'}`;
    if($('#homeStartDate'))$('#homeStartDate').value=current.startDate;
    if($('#homeBaseRate'))$('#homeBaseRate').value=current.settings.baseRate;
    $('#rosterRange').textContent=rangeLabel(current.startDate);

    const wrap=$('#dayList');wrap.innerHTML='';
    const start=parseDate(current.startDate);

    current.days.forEach((row,i)=>{
      const date=new Date(start);date.setDate(start.getDate()+i);
      const dataForMigration=SHIFT_DATA[row.code];
      if(dataForMigration&&!dataForMigration.leaveType&&row.type!=='Picked-up OT'){
        const nominal=dataForMigration.times[PayCalc.dayGroup(date.getDay())]||['',''];
        if(Number(row.earlyStartHours)>0&&row.start===nominal[0])row.start=addClockMinutes(row.start,-Math.round(Number(row.earlyStartHours)*60));
        if(Number(row.additionalHours)>0&&row.finish===nominal[1])row.finish=addClockMinutes(row.finish,Math.round(Number(row.additionalHours)*60));
        row.earlyStartHours=0;row.additionalHours=0;
      }
      const card=document.createElement('article');card.className='day-card';card.dataset.entered=String(Boolean(row.entered??row.code));
      const initialLine=row.workedRosterLine||SHIFT_DATA[row.code]?.line||current.settings.homeLine;
      card.dataset.workedRosterLine=initialLine;
      card.innerHTML=`<div class="day-head"><div><b>${date.toLocaleDateString('en-AU',{weekday:'long',day:'numeric',month:'short'})}</b><small>Day ${i+1}</small></div><span class="day-pay">$0.00</span></div>
      <div class="day-main">
        <label>Shift code<select class="shift-code">${opts(row.code,initialLine,date)}</select></label>
        <button type="button" class="details-button">Details</button>
      </div>
      <div class="shift-time">Choose a shift code to show the default time.</div>
      <div class="day-details">
        <div class="form-grid two">
          <label>Worked line<select class="worked-line">${rosterLineOptions(initialLine)}</select></label>
          <label class="offline-reason-wrap" ${initialLine!==current.settings.homeLine?'':'hidden'}>Offline arrangement<select class="offline-reason"><option value="directed" ${(row.offlineReason||'directed')==='directed'?'selected':''}>Directed / rostered offline</option><option value="cost-neutral" ${row.offlineReason==='cost-neutral'?'selected':''}>Mutual exchange / cost neutral</option></select></label>
          <label>Type<select class="shift-type">
            <option ${row.type==='Rostered'?'selected':''}>Rostered</option>
            <option ${row.type==='Picked-up OT'?'selected':''}>Picked-up OT</option>
            <option ${row.type==='Leave'?'selected':''}>Leave</option>
            <option ${row.type==='Off'?'selected':''}>Off</option>
          </select></label>
          <label>Partner<input class="shift-partner" type="text" list="partnerSuggestions" value="${String(row.partner||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;')}" placeholder="Optional"></label>
          <label>Higher duties<select class="higher-duties"><option value="no" ${row.hd?'':'selected'}>No</option><option value="yes" ${row.hd?'selected':''}>Yes</option></select></label>
          <label>Start<input class="start-time" type="time" value="${row.start||''}"></label>
          <label>Finish<input class="finish-time" type="time" value="${row.finish||''}"></label>
          <label class="personal-leave-reason-field">Personal leave reason<select class="personal-leave-reason"><option value="illness" ${(row.personalLeaveReason||'illness')==='illness'?'selected':''}>Illness or injury</option><option value="care" ${row.personalLeaveReason==='care'?'selected':''}>Providing care/support to family</option><option value="unanticipated" ${row.personalLeaveReason==='unanticipated'?'selected':''}>Unanticipated matter requiring immediate attention</option></select></label>
          <label class="leave-hours-field">Paid leave hours<input class="leave-hours" type="number" min="0" step="0.001" value="${row.leaveHours??''}" placeholder="Use shift hours"><small class="field-note">Optional override for partial-day leave.</small></label>
          <label class="annual-leave-portion-field">Annual leave portion (hrs)<input class="annual-leave-hours" type="number" min="0" step="0.001" value="${Number(row.annualLeaveHours)||0}"><small class="field-note">For a mixed sick/personal + annual leave day.</small></label>
          <label>Public holiday worked benefit<select class="ph-benefit"><option value="lieu" ${(row.phBenefit||'lieu')==='lieu'?'selected':''}>Leave in lieu</option><option value="cash" ${row.phBenefit==='cash'?'selected':''}>Cash payment</option></select><small class="field-note">Defaults to leave in lieu; change only if cash payment applies.</small></label>
        </div>
      </div>`;
      wrap.appendChild(card);

      card.querySelector('.details-button').onclick=()=>{card.classList.toggle('open');card.querySelector('.details-button').textContent=card.classList.contains('open')?'Close':'Details'};
      card.querySelector('.shift-code').onchange=()=>{applyShiftDefaults(card,date,true);updateRosterCardState(card);syncCurrentFromUI();recalculate()};
      card.querySelector('.worked-line').onchange=e=>{
        card.dataset.entered='true';
        card.dataset.workedRosterLine=e.target.value;
        card.dataset.offline=String(e.target.value!==current.settings.homeLine);
        refreshShiftOptions(card,date,'');
        applyShiftDefaults(card,date,true);
        updateRosterCardState(card);
        syncCurrentFromUI();
        recalculate();
      };
      card.querySelectorAll('.shift-type,.higher-duties,.ph-benefit,.offline-reason,.personal-leave-reason').forEach(el=>el.onchange=()=>{card.dataset.entered='true';updateRosterCardState(card);syncCurrentFromUI();recalculate()});
      card.querySelectorAll('.leave-hours,.annual-leave-hours,.shift-partner').forEach(el=>el.oninput=()=>{card.dataset.entered='true';updateRosterCardState(card);syncCurrentFromUI();recalculate()});
      const manualTime=()=>{
        const data=SHIFT_DATA[card.querySelector('.shift-code').value];
        const st=card.querySelector('.start-time').value||'--:--',fn=card.querySelector('.finish-time').value||'--:--';
        const tempRow={code:card.querySelector('.shift-code').value,type:card.querySelector('.shift-type').value,start:st,finish:fn};
        const variation=rosterVariation(tempRow,date);
        const bits=[];
        if(variation.early>0)bits.push(`${variation.early.toFixed(2)}h early OT`);
        if(variation.extension>0)bits.push(`${variation.extension.toFixed(2)}h extension OT`);
        if(variation.forced>0)bits.push(`${variation.forced.toFixed(2)}h forced OT`);
        const extra=bits.length?` • ${bits.join(' • ')}`:'';
        card.querySelector('.shift-time').textContent=data?`${data.name} • ${st}–${fn}${extra}`:`${st}–${fn}`;
        card.dataset.entered='true';updateRosterCardState(card);syncCurrentFromUI();recalculate();
      };
      card.querySelector('.start-time').oninput=manualTime;
      card.querySelector('.finish-time').oninput=manualTime;
      refreshShiftOptions(card,date,row.code||'');
      applyShiftDefaults(card,date,false);updateRosterCardState(card);
      if(row.code&&!SHIFT_DATA[row.code]?.leaveType){
        const variation=rosterVariation(row,date);
        const bits=[];
        if(variation.early>0)bits.push(`${variation.early.toFixed(2)}h early OT`);
        if(variation.extension>0)bits.push(`${variation.extension.toFixed(2)}h extension OT`);
        if(variation.forced>0)bits.push(`${variation.forced.toFixed(2)}h forced OT`);
        if(bits.length)card.querySelector('.shift-time').textContent+=` • ${bits.join(' • ')}`;
      }
    });
    recalculate();
  }

  function syncCurrentFromUI(){
    current.startDate=$('#startDate').value;
    resolveAgreementSettings();
    current.days=$$('.day-card').map(card=>({
      code:card.querySelector('.shift-code').value,
      type:card.querySelector('.shift-type').value,
      hd:card.querySelector('.higher-duties').value==='yes',
      start:card.querySelector('.start-time').value,
      finish:card.querySelector('.finish-time').value,
      earlyStartHours:0,
      additionalHours:0,
      leaveHours:card.querySelector('.leave-hours')?.value===''?'':Number(card.querySelector('.leave-hours')?.value),
      annualLeaveHours:Number(card.querySelector('.annual-leave-hours')?.value)||0,
      phBenefit:card.querySelector('.ph-benefit')?.value||'lieu',
      workedRosterLine:card.querySelector('.worked-line').value||current.settings.homeLine,
      offline:(card.querySelector('.worked-line').value||current.settings.homeLine)!==current.settings.homeLine,
      offlineReason:card.querySelector('.offline-reason').value||'directed',
      partner:card.querySelector('.shift-partner')?.value.trim()||'',
      personalLeaveReason:card.querySelector('.personal-leave-reason')?.value||'illness',
      entered:card.dataset.entered==='true'
    }));
  }

  function openRosterDay(dayIndex){
    go('roster');
    requestAnimationFrame(()=>{
      const cards=$$('.day-card');
      const card=cards[dayIndex];
      if(!card)return;
      card.classList.add('open');
      const button=card.querySelector('.details-button');
      if(button)button.textContent='Close';
      card.scrollIntoView({behavior:'smooth',block:'center'});
      card.classList.add('audit-highlight');
      setTimeout(()=>card.classList.remove('audit-highlight'),1400);
    });
  }

  function renderAllowanceBreakdown(details=[],cycleStart=current.startDate){
    const list=$('#allowanceBreakdownList');
    if(!list)return;
    list.innerHTML='';
    if(!details.length){
      list.innerHTML='<div class="allowance-empty">No allowances or higher duties in this pay cycle.</div>';
      return;
    }

    const order=['Night allowance','Morning allowance','Afternoon allowance','Higher duties'];
    const groups=details.reduce((out,item)=>{
      (out[item.type]??=[]).push(item);
      return out;
    },{});

    order.filter(type=>groups[type]?.length).forEach(type=>{
      const section=document.createElement('section');
      section.className='allowance-group';
      const total=groups[type].reduce((sum,item)=>sum+Number(item.amount||0),0);
      section.innerHTML=`<div class="allowance-group-head"><b>${type}</b><strong>${money(total)}</strong></div>`;

      groups[type].forEach(item=>{
        const date=parseDate(item.date);
        const row=document.createElement('button');
        row.type='button';
        row.className='allowance-audit-row';
        row.dataset.dayIndex=String(item.dayIndex);
        row.innerHTML=`<span>
          <b>${date.toLocaleDateString('en-AU',{weekday:'short',day:'numeric',month:'short'})}</b>
          <small>${item.code||'Shift'} • ${Number(item.hours||0).toFixed(1)} hrs</small>
        </span><strong>${money(item.amount)}</strong>`;
        if(cycleStart===current.startDate)row.onclick=()=>openRosterDay(item.dayIndex);else row.classList.add('read-only-audit');
        section.appendChild(row);
      });
      list.appendChild(section);
    });

    const total=details.reduce((sum,item)=>sum+Number(item.amount||0),0);
    const footer=document.createElement('div');
    footer.className='allowance-total';
    footer.innerHTML=`<span>Total allowances & higher duties</span><strong>${money(total)}</strong>`;
    list.appendChild(footer);
  }

  function renderPublicHolidayBreakdown(details=[]){
    const list=$('#publicHolidayBreakdownList');if(!list)return;list.innerHTML='';
    if(!details.length){list.innerHTML='<div class="allowance-empty">No public holiday entitlement in this pay cycle.</div>';return}
    details.forEach(item=>{const row=document.createElement('div');row.className='public-holiday-row';const d=parseDate(item.date);row.innerHTML=`<span><b>${item.name}</b><small>${d.toLocaleDateString('en-AU',{weekday:'short',day:'numeric',month:'short'})} • ${item.type}${item.leaveCredit?` • ${item.leaveCredit.toFixed(1)} hrs leave credited`:''}</small></span><strong>${money(item.amount)}</strong>`;list.appendChild(row)});
  }

  function recalculate(){
    syncCurrentFromUI();
    resolveAgreementSettings();
    latestResult=PayCalc.calculate(current);
    latestResult.dayTotals.forEach((row,i)=>{
      const card=$$('.day-card')[i];
      if(!card) return;
      card.querySelector('.day-pay').textContent=money(row.gross);
      card.classList.toggle('public-holiday-day',!!row.holidayName);
      let badge=card.querySelector('.public-holiday-badge');
      if(row.holidayName){if(!badge){badge=document.createElement('span');badge.className='public-holiday-badge';card.querySelector('.day-head>div').appendChild(badge)}badge.textContent=row.holidayName}else if(badge)badge.remove();
      if(row.start&&row.finish&&SHIFT_DATA[current.days[i].code]){
        const d=SHIFT_DATA[current.days[i].code];
        const date=parseDate(current.startDate);
        date.setDate(date.getDate()+i);
        const variation=rosterVariation(current.days[i],date);
        const earlyText=variation.early?` • ${variation.early.toFixed(2)}h early OT`:'';
        const addText=variation.extension?` • ${variation.extension.toFixed(2)}h extension OT`:'';
        const forcedText=variation.forced?` • ${variation.forced.toFixed(2)}h forced OT`:'';
        card.querySelector('.shift-time').textContent=d.leaveType
          ? `${d.name} • ${row.hours.toFixed(1)} paid hours`
          : `${d.name} • ${row.start}–${row.finish}${earlyText}${addText}${forcedText}`;
      }
    });
    $('#workedPay').textContent=money(latestResult.breakdown.workedPay);$('#publicHolidayPay').textContent=money(latestResult.breakdown.publicHolidayPay);renderPublicHolidayBreakdown(latestResult.publicHolidayDetails);$('#annualLeavePay').textContent=money(latestResult.breakdown.annualLeavePay);$('#sickLeavePay').textContent=money(latestResult.breakdown.sickLeavePay);$('#lslPay').textContent=money(latestResult.breakdown.lslPay);$('#lwopPay').textContent=money(latestResult.breakdown.lwopPay);$('#extrasPay').textContent=money(latestResult.breakdown.extrasPay);renderAllowanceBreakdown(latestResult.allowanceDetails);$('#additionalHoursPay').textContent=money(latestResult.breakdown.additionalHoursPay);$('#gross').textContent=money(latestResult.gross);
    $('#taxable').textContent=money(latestResult.taxable);
    $('#tax').textContent=money(latestResult.tax);
    $('#hours').textContent=latestResult.hours.toFixed(1);
    $('#net').textContent=money(latestResult.net);
    $('#netHourly').textContent=money(latestResult.netHourly);
    $('#rosterGross').textContent=money(latestResult.gross);
    $('#rosterTax').textContent=money(latestResult.tax);
    $('#rosterNet').textContent=money(latestResult.net);
    $('#rosterHours').textContent=latestResult.hours.toFixed(1);
    updateRosterSaveButton();
    const currentPayday=paydayFor(current.startDate).toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'});
    if($('#homePayday'))$('#homePayday').textContent=currentPayday;
    renderHomeDashboard();
    if($('#pay')?.classList.contains('active'))renderPayScreen();
  }

  function updateRosterSaveButton(){
    const button=$('#rosterSaveCycle');
    if(!button)return;
    const id=`cycle-${current.startDate}`;
    const exists=AppStorage.loadCycles().some(c=>c.id===id);
    button.textContent=exists?'Update Pay Cycle':'Save Pay Cycle';
  }

  function saveCurrent(){
    syncCurrentFromUI();
    AppStorage.saveCurrent(current);
    toast('Current roster saved');
  }

  function saveCycle(){
    saveCurrent();
    const cycles=AppStorage.loadCycles();
    const id=`cycle-${current.startDate}`;
    const index=cycles.findIndex(c=>c.id===id);
    const previous=index>=0?cycles[index]:{};
    const record={
      ...JSON.parse(JSON.stringify(current)),
      id,
      summary:{gross:latestResult.gross,taxable:latestResult.taxable,tax:latestResult.tax,hours:latestResult.hours,net:latestResult.net,netHourly:latestResult.netHourly},
      status:previous.status||'current',
      actualDeposit:previous.actualDeposit??'',
      notes:previous.notes||'',
      updatedAt:new Date().toISOString()
    };
    if(index>=0) cycles[index]=record; else cycles.push(record);
    AppStorage.saveCycles(cycles);
    toast(index>=0?'Pay cycle updated':'Pay cycle saved');
    renderHomeDashboard();
  }

  function startNextFortnight(){
    const proceed=confirm('Save this pay cycle before starting the next fortnight?');
    if(!proceed)return;
    saveCycle();
    const next=parseDate(current.startDate);next.setDate(next.getDate()+14);
    current={startDate:localISO(next),settings:{...current.settings},days:Array.from({length:14},emptyDay)};
    AppStorage.saveCurrent(current);
    buildRoster();
    go('roster');
    toast('Next fortnight started');
  }

  function renderSaved(){
    const list=$('#savedList');
    const filter=$('#savedFilter')?.value||'all';
    const allCycles=AppStorage.loadCycles().sort((a,b)=>b.startDate.localeCompare(a.startDate));
    const cycles=allCycles.filter(c=>{
      const status=smartStatus(c);
      const hasActual=c.actualDeposit!==''&&c.actualDeposit!=null;
      if(filter==='needs-actual')return !hasActual&&(status==='awaiting'||status==='past');
      if(filter==='paid')return status==='paid';
      if(filter==='current')return status==='current'||status==='awaiting';
      if(filter==='future')return status==='future';
      if(filter==='past')return status==='past';
      return true;
    });
    $('#savedIndex').hidden=false;$('#savedDetail').hidden=true;activeCycleId=null;
    if(!cycles.length){list.innerHTML=`<div class="empty-state">${allCycles.length?'No saved pays match this filter.':'No saved pay cycles yet.'}</div>`;return}
    list.innerHTML='';
    cycles.forEach(c=>{
      const actual=c.actualDeposit!==''&&c.actualDeposit!=null?Number(c.actualDeposit):null;
      const diff=actual==null?null:actual-c.summary.net;
      const status=smartStatus(c);
      const payday=paydayFor(c.startDate);
      const card=document.createElement('div');card.className='saved-card compact-saved';
      card.innerHTML=`<button type="button" class="saved-card-toggle">
        <span class="saved-card-title">
          <span class="status-pill ${status}">${statusLabel(status)}</span>
          <b>${peLabel(c.startDate)}</b><small class="cycle-range-sub">${cycleDateRange(c.startDate)}</small>
        </span>
        <strong>${money(c.summary.net)}</strong>
      </button>
      <div class="saved-card-collapse">
        <small>Expected payday ${payday.toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'})}</small>
        <small>Updated ${new Date(c.updatedAt).toLocaleString('en-AU')}</small>
        <div class="saved-meta">
          <div><span>Gross</span><b>${money(c.summary.gross)}</b></div>
          <div><span>Hours</span><b>${c.summary.hours.toFixed(1)}</b></div>
          <div><span>Actual deposit</span><b>${actual==null?'Not entered':money(actual)}</b></div>
          <div><span>Difference</span><b class="${diff==null?'difference-neutral':diff>0?'difference-positive':diff<0?'difference-negative':'difference-neutral'}">${diff==null?'Not available':money(diff)}</b></div>
        </div>
        <div class="quick-actual-entry">
          <label>Actual deposit
            <input class="quick-actual-input" type="number" step="0.01" inputmode="decimal" placeholder="${actual==null?'Enter amount':actual}">
          </label>
          <div class="quick-actual-buttons">
            <button class="save-quick-actual" type="button">${actual==null?'Save actual':'Update actual'}</button>
            ${actual==null?'':'<button class="clear-quick-actual" type="button">Clear</button>'}
          </div>
        </div>
        <div class="saved-actions"><button class="open-saved">View details</button><button class="delete-saved">Delete</button></div>
      </div>`;
      card.querySelector('.saved-card-toggle').onclick=()=>card.classList.toggle('open');
      const quickInput=card.querySelector('.quick-actual-input');
      if(actual!=null)quickInput.value=actual;
      card.querySelector('.save-quick-actual').onclick=()=>{
        const value=quickInput.value.trim();
        if(value===''){toast('Enter the actual deposit');quickInput.focus();return}
        const saved=AppStorage.loadCycles();
        const savedIndex=saved.findIndex(x=>x.id===c.id);
        if(savedIndex<0)return;
        saved[savedIndex].actualDeposit=value;
        saved[savedIndex].updatedAt=new Date().toISOString();
        AppStorage.saveCycles(saved);
        renderSaved();
        renderHomeDashboard();
        toast('Actual deposit saved');
      };
      const clearQuick=card.querySelector('.clear-quick-actual');
      if(clearQuick)clearQuick.onclick=()=>{
        if(!confirm('Clear the actual deposit for this pay?'))return;
        const saved=AppStorage.loadCycles();
        const savedIndex=saved.findIndex(x=>x.id===c.id);
        if(savedIndex<0)return;
        saved[savedIndex].actualDeposit='';
        saved[savedIndex].updatedAt=new Date().toISOString();
        AppStorage.saveCycles(saved);
        renderSaved();
        renderHomeDashboard();
        toast('Actual deposit cleared');
      };
      card.querySelector('.open-saved').onclick=()=>openSaved(c.id);
      card.querySelector('.delete-saved').onclick=()=>{if(confirm('Delete this saved pay cycle?')){AppStorage.saveCycles(AppStorage.loadCycles().filter(x=>x.id!==c.id));renderSaved();renderHomeDashboard();toast('Deleted')}};
      list.appendChild(card);
    });
  }

  const smartStatus=c=>{
    const today=new Date();today.setHours(0,0,0,0);
    const start=parseDate(c.startDate),end=new Date(start);end.setDate(start.getDate()+13);
    const payday=paydayFor(c.startDate);payday.setHours(0,0,0,0);
    const hasActual=c.actualDeposit!==''&&c.actualDeposit!=null;
    if(today<start)return'future';
    if(today<=end)return'current';
    if(hasActual)return'paid';
    if(today<payday)return'awaiting';
    return'past';
  };
  const statusLabel=s=>s==='paid'?'Paid':s==='awaiting'?'Awaiting payday':s==='future'?'Future cycle':s==='past'?'Archived':'Current cycle';


  function renderFinancialYearSummary(referenceCycle){
    const ref=referenceCycle?.startDate?parseDate(referenceCycle.startDate):new Date();
    const fy=financialYearFor(ref);
    const allFyCycles=AppStorage.loadCycles().filter(c=>cycleInFinancialYear(c,fy.startYear));
    const cycles=allFyCycles.filter(c=>smartStatus(c)!=='future');
    const futureCount=allFyCycles.length-cycles.length;
    const totals=cycles.reduce((sum,c)=>{
      const s=c.summary||{},status=smartStatus(c);
      const hasActual=c.actualDeposit!==''&&c.actualDeposit!=null&&status!=='future';
      const actual=hasActual?Number(c.actualDeposit)||0:null;
      sum.gross+=Number(s.gross)||0;sum.tax+=Number(s.tax)||0;sum.hours+=Number(s.hours)||0;
      sum.net+=hasActual?actual:Number(s.net)||0;
      if(hasActual){sum.actualCount+=1;sum.difference+=actual-(Number(s.net)||0)}
      return sum;
    },{gross:0,tax:0,hours:0,net:0,actualCount:0,difference:0});
    $('#homeFyLabel').textContent=`${fy.label} financial year`;
    $('#homeCycleCount').textContent=futureCount?`${cycles.length} ${cycles.length===1?'pay':'pays'} • ${futureCount} future`:`${cycles.length} ${cycles.length===1?'pay':'pays'}`;
    $('#homeFyGross').textContent=money(totals.gross);$('#homeFyNet').textContent=money(totals.net);$('#homeFyTax').textContent=money(totals.tax);
    $('#homeFyHours').textContent=totals.hours.toFixed(1);$('#homeFyAvgNet').textContent=money(cycles.length?totals.net/cycles.length:0);
    $('#homeFyAvgHours').textContent=(cycles.length?totals.hours/cycles.length:0).toFixed(1);$('#homeFyActualCount').textContent=String(totals.actualCount);
    const diff=$('#homeFyDifference');diff.textContent=money(totals.difference);diff.className=totals.difference>0?'difference-positive':totals.difference<0?'difference-negative':'difference-neutral';
    const latestActual=allFyCycles.filter(c=>c.actualDeposit!==''&&c.actualDeposit!=null&&smartStatus(c)!=='future').sort((a,b)=>b.startDate.localeCompare(a.startDate))[0];
    const row=$('#homeLastActual');
    if(latestActual){
      const actual=Number(latestActual.actualDeposit)||0,difference=actual-(Number(latestActual.summary?.net)||0);
      row.hidden=false;$('#homeLastActualAmount').textContent=money(actual);
      const d=$('#homeLastActualDifference');d.textContent=money(difference);d.className=difference>0?'difference-positive':difference<0?'difference-negative':'difference-neutral';
    }else row.hidden=true;
    const next=upcomingPayCycle();$('#homePayday').textContent=next?paydayFor(next.startDate).toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'}):'—';
  }

  function renderPayResult(cycle){
    if(!cycle)return;
    const result=cycleResult(cycle),status=smartStatus(cycle);
    $('#payStatusLabel').textContent=statusLabel(status);$('#payRange').innerHTML=`${peLabel(cycle.startDate)}<small class="cycle-range-sub">${cycleDateRange(cycle.startDate)}</small>`;
    $('#payPayday').textContent=`Payday ${paydayFor(cycle.startDate).toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'})}`;
    $('#workedPay').textContent=money(result.breakdown.workedPay);$('#publicHolidayPay').textContent=money(result.breakdown.publicHolidayPay);
    renderPublicHolidayBreakdown(result.publicHolidayDetails);$('#annualLeavePay').textContent=money(result.breakdown.annualLeavePay);
    $('#sickLeavePay').textContent=money(result.breakdown.sickLeavePay);$('#lslPay').textContent=money(result.breakdown.lslPay);
    $('#lwopPay').textContent=money(result.breakdown.lwopPay);$('#extrasPay').textContent=money(result.breakdown.extrasPay);
    renderAllowanceBreakdown(result.allowanceDetails,cycle.startDate);$('#additionalHoursPay').textContent=money(result.breakdown.additionalHoursPay);
    $('#gross').textContent=money(result.gross);$('#taxable').textContent=money(result.taxable);$('#tax').textContent=money(result.tax);
    $('#hours').textContent=result.hours.toFixed(1);$('#net').textContent=money(result.net);$('#netHourly').textContent=money(result.netHourly);
    renderFinancialYearSummary(cycle);
    const upcoming=upcomingPayCycle();$('#backToUpcomingPay').hidden=!upcoming||cycle.startDate===upcoming.startDate;
  }

  function makePayCard(c){
    const actual=c.actualDeposit!==''&&c.actualDeposit!=null?Number(c.actualDeposit):null,s=c.summary||{},status=smartStatus(c);
    const diff=actual==null?null:actual-(Number(s.net)||0),payday=paydayFor(c.startDate);
    const card=document.createElement('div');card.className='saved-card compact-saved';
    card.innerHTML=`<button type="button" class="saved-card-toggle"><span class="saved-card-title"><span class="status-pill ${status}">${statusLabel(status)}</span><b>${peLabel(c.startDate)}</b><small class="cycle-range-sub">${cycleDateRange(c.startDate)}</small></span><strong>${money(s.net)}</strong></button>
      <div class="saved-card-collapse"><small>Expected payday ${payday.toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'})}</small>
      <div class="saved-meta"><div><span>Gross</span><b>${money(s.gross)}</b></div><div><span>Hours</span><b>${Number(s.hours||0).toFixed(1)}</b></div>
      <div><span>Actual deposit</span><b>${actual==null?'Not entered':money(actual)}</b></div><div><span>Difference</span><b class="${diff==null?'difference-neutral':diff>0?'difference-positive':diff<0?'difference-negative':'difference-neutral'}">${diff==null?'Not available':money(diff)}</b></div></div>
      <div class="quick-actual-entry"><label>Actual deposit<input class="quick-actual-input" type="number" step="0.01" inputmode="decimal" placeholder="${actual==null?'Enter amount':actual}" value="${actual==null?'':actual}"></label>
      <div class="quick-actual-buttons"><button class="save-quick-actual" type="button">${actual==null?'Save actual':'Update actual'}</button>${actual==null?'':'<button class="clear-quick-actual" type="button">Clear</button>'}</div></div>
      <div class="saved-actions"><button class="view-pay" type="button">View pay</button><button class="open-pay-roster" type="button">Open roster</button>${c.id==='current-unsaved'?'':'<button class="delete-saved" type="button">Delete</button>'}</div></div>`;
    card.querySelector('.saved-card-toggle').onclick=()=>card.classList.toggle('open');
    card.querySelector('.view-pay').onclick=()=>{selectedPayCycleId=c.id;renderPayResult(c);window.scrollTo({top:0,behavior:'smooth'})};
    card.querySelector('.open-pay-roster').onclick=()=>{current=JSON.parse(JSON.stringify({startDate:c.startDate,settings:c.settings,days:c.days}));current.days=current.days.map(row=>({...emptyDay(),...row,entered:row.entered??Boolean(row.code)}));AppStorage.saveCurrent(current);buildRoster();go('roster');toast('Pay cycle opened in roster')};
    card.querySelector('.save-quick-actual').onclick=()=>{if(c.id==='current-unsaved'){toast('Save this pay cycle first');return}const input=card.querySelector('.quick-actual-input'),value=input.value.trim();if(value===''){toast('Enter the actual deposit');input.focus();return}const saved=AppStorage.loadCycles(),i=saved.findIndex(x=>x.id===c.id);if(i<0)return;saved[i].actualDeposit=value;saved[i].updatedAt=new Date().toISOString();AppStorage.saveCycles(saved);renderPayScreen();renderHomeDashboard();toast('Actual deposit saved')};
    const clear=card.querySelector('.clear-quick-actual');if(clear)clear.onclick=()=>{if(!confirm('Clear the actual deposit for this pay?'))return;const saved=AppStorage.loadCycles(),i=saved.findIndex(x=>x.id===c.id);if(i<0)return;saved[i].actualDeposit='';saved[i].updatedAt=new Date().toISOString();AppStorage.saveCycles(saved);renderPayScreen();renderHomeDashboard();toast('Actual deposit cleared')};
    const del=card.querySelector('.delete-saved');if(del)del.onclick=()=>{if(!confirm('Delete this saved pay cycle?'))return;AppStorage.saveCycles(AppStorage.loadCycles().filter(x=>x.id!==c.id));if(selectedPayCycleId===c.id)selectedPayCycleId=null;renderPayScreen();renderHomeDashboard();toast('Deleted')};
    return card;
  }

  function addPayGroup(wrap,title,cycles){
    if(!cycles.length)return;
    const section=document.createElement('section');section.className='pay-history-section';section.innerHTML=`<h3>${title}</h3>`;
    cycles.forEach(c=>section.appendChild(makePayCard(c)));wrap.appendChild(section);
  }

  function renderPayCycleList(){
    const wrap=$('#payCycleList');if(!wrap)return;wrap.innerHTML='';
    const cycles=availableCycles().sort((a,b)=>a.startDate.localeCompare(b.startDate));
    addPayGroup(wrap,'Awaiting Pay',cycles.filter(c=>smartStatus(c)==='awaiting'));
    addPayGroup(wrap,'Current Cycle',cycles.filter(c=>smartStatus(c)==='current'));
    addPayGroup(wrap,'Future Cycles',cycles.filter(c=>smartStatus(c)==='future'));
    const history=cycles.filter(c=>['paid','past'].includes(smartStatus(c))).sort((a,b)=>b.startDate.localeCompare(a.startDate));
    const byFy={};history.forEach(c=>{const fy=financialYearFor(parseDate(c.startDate)).label;(byFy[fy]??=[]).push(c)});
    Object.entries(byFy).sort((a,b)=>b[0].localeCompare(a[0])).forEach(([fy,items])=>addPayGroup(wrap,`Pay History · ${fy}`,items));
    if(!wrap.children.length)wrap.innerHTML='<div class="empty-state">No pay cycles saved yet.</div>';
  }

  function renderPayScreen(){
    const cycles=availableCycles();
    let selected=selectedPayCycleId?cycles.find(c=>c.id===selectedPayCycleId):null;
    if(!selected)selected=upcomingPayCycle();
    if(selected){selectedPayCycleId=selected.id;renderPayResult(selected)}
    renderPayCycleList();
  }

  function openSaved(id){
    const c=AppStorage.loadCycles().find(x=>x.id===id);if(!c)return;
    activeCycleId=id;$('#savedIndex').hidden=true;$('#savedDetail').hidden=false;
    $('#detailTitle').innerHTML=`${peLabel(c.startDate)}<small class="cycle-range-sub">${cycleDateRange(c.startDate)}</small>`;
    $('#detailEstimate').textContent=money(c.summary.net);
    $('#detailEstimated').textContent=money(c.summary.net);
    const actual=c.actualDeposit!==''&&c.actualDeposit!=null?Number(c.actualDeposit):null;
    $('#detailActual').textContent=actual==null?'Not entered':money(actual);
    $('#detailActualInput').value=actual==null?'':actual;
    const detailDifference=$('#detailDifference');
    const detailDiff=actual==null?null:actual-c.summary.net;
    detailDifference.textContent=detailDiff==null?'Not available':money(detailDiff);
    detailDifference.className=detailDiff==null?'difference-neutral':detailDiff>0?'difference-positive':detailDiff<0?'difference-negative':'difference-neutral';
    $('#detailStatus').value=c.status||'current';
    $('#detailNotes').value=c.notes||'';
    const computedStatus=smartStatus(c);const pill=$('#detailStatusPill');pill.textContent=statusLabel(computedStatus);pill.className=`status-pill ${computedStatus}`;
  }

  function saveSavedDetails(){
    const cycles=AppStorage.loadCycles();const index=cycles.findIndex(c=>c.id===activeCycleId);if(index<0)return;
    cycles[index].status=$('#detailStatus').value;
    cycles[index].actualDeposit=$('#detailActualInput').value;
    cycles[index].notes=$('#detailNotes').value;
    cycles[index].updatedAt=new Date().toISOString();
    AppStorage.saveCycles(cycles);openSaved(activeCycleId);renderHomeDashboard();toast('Saved details');
  }

  function editSavedCycle(){
    const c=AppStorage.loadCycles().find(x=>x.id===activeCycleId);if(!c)return;
    current=JSON.parse(JSON.stringify({startDate:c.startDate,settings:c.settings,days:c.days}));
    AppStorage.saveCurrent(current);buildRoster();go('roster');toast('Saved cycle opened');
  }

  function exportBackup(){
    saveCurrent();
    const payload={
      app:'PTA ShiftMate',
      version:'2.1.5 TEST',
      exportedAt:new Date().toISOString(),
      current:AppStorage.loadCurrent(),
      cycles:AppStorage.loadCycles()
    };
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const link=document.createElement('a');
    link.href=url;
    link.download=`PTA-ShiftMate-backup-${localISO(new Date())}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    toast('Backup exported');
  }

  async function importBackup(file){
    if(!file)return;
    try{
      const payload=JSON.parse(await file.text());
      if(!payload||typeof payload!=='object'||!payload.current||!Array.isArray(payload.cycles)){
        throw new Error('Invalid backup');
      }
      if(!confirm(`Restore this backup with ${payload.cycles.length} saved pay cycles? Current app data will be replaced.`))return;
      AppStorage.saveCurrent(payload.current);
      AppStorage.saveCycles(payload.cycles);
      toast('Backup restored');
      setTimeout(()=>location.reload(),500);
    }catch(error){
      alert('This file is not a valid PTA ShiftMate backup.');
    }finally{
      $('#importBackup').value='';
    }
  }

  function updateAgreementSettingsUI(){
    current.settings.rateSource='agreement';
    current.settings.classificationOverride=true;
    const agreement=resolveAgreementSettings();
    if($('#agreementRateSummary'))$('#agreementRateSummary').textContent=`${agreement.classificationLabel}: ${money(agreement.weeklyRate)} per week / ${money(agreement.baseRate)} per hour • wage table effective ${agreement.wageEffective}.`;
    if($('#baseRate'))$('#baseRate').value=agreement.baseRate;
  }

  function populateRosterLineControl(){
    const el=$('#rosterLineNumber');if(!el)return;
    const profile=currentProjectionProfile();
    if(!profile){el.innerHTML='<option value="">Unavailable</option>';el.disabled=true;return}
    el.disabled=false;
    const line=projectionCurrentLineToday()||Number(current.settings.rosterLineNumber)||1;
    el.innerHTML=Array.from({length:profile.lineCount},(_,i)=>`<option value="${i+1}" ${i+1===line?'selected':''}>Line ${i+1}</option>`).join('');
  }
  function loadSettingsIntoForm(){
    Object.keys(defaults).forEach(k=>{
      const el=$('#'+k);if(!el||k==='rosterLineNumber')return;
      if(el.type==='checkbox')el.checked=Boolean(current.settings[k]);else el.value=current.settings[k];
    });
    updateAgreementSettingsUI();populateRosterLineControl();
  }

  function readSettingsFromForm(){
    Object.keys(defaults).forEach(k=>{
      const el=$('#'+k);if(!el||k==='rosterLineNumber')return;
      if(el.type==='checkbox')current.settings[k]=el.checked;
      else if(stringSettings.has(k))current.settings[k]=el.value.trim();
      else current.settings[k]=Number(el.value)||0;
    });
    updateAgreementSettingsUI();populateRosterLineControl();recalculate();
  }



  const isWorkingForShare=row=>Boolean((row?.entered??Boolean(row?.code))&&row?.code&&row.type!=='Off'&&!SHIFT_DATA[row.code]?.leaveType);
  const sharedShiftType=row=>{const [h,m]=(row.start||'00:00').split(':').map(Number),start=h*60+m;if(start>=19*60&&start<=20*60)return'Night';if(start<12*60)return'Day';return'Arvo'};
  const icsDate=d=>`${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  function rosterShareEntries(range){
    const entries=rosterTimeline(),today=startOfRosterDay(new Date());let from=today,to=addRosterDays(today,27);
    if(range==='6weeks')to=addRosterDays(today,41);
    else if(range==='12weeks')to=addRosterDays(today,83);
    if(range==='current'){from=parseDate(current.startDate);to=addRosterDays(from,13)}
    else if(range==='future'){const future=[...entries.values()].filter(e=>e.date>=today&&isWorkingForShare(e.row)).sort((a,b)=>a.date-b.date);to=future.length?future[future.length-1].date:today}
    return [...entries.values()].filter(e=>e.date>=from&&e.date<=to&&isWorkingForShare(e.row)).sort((a,b)=>a.date-b.date);
  }
  async function shareRoster(range){
    const entries=rosterShareEntries(range||'4weeks');if(!entries.length){toast('No working days found in that period');return}
    const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//PTA ShiftMate//Roster//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH','X-WR-CALNAME:PTA ShiftMate Roster'];
    entries.forEach(e=>lines.push('BEGIN:VEVENT',`UID:pta-shiftmate-${e.key}@local`,`DTSTAMP:${new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z')}`,`DTSTART;VALUE=DATE:${icsDate(e.date)}`,`DTEND;VALUE=DATE:${icsDate(addRosterDays(e.date,1))}`,`SUMMARY:Working - ${sharedShiftType(e.row)}`,'END:VEVENT'));
    lines.push('END:VCALENDAR');const file=new File([lines.join('\r\n')],`PTA-ShiftMate-Roster-${localISO(new Date())}.ics`,{type:'text/calendar'});
    try{if(navigator.canShare?.({files:[file]}))await navigator.share({title:'PTA ShiftMate roster',files:[file]});else{const url=URL.createObjectURL(file),a=document.createElement('a');a.href=url;a.download=file.name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Roster calendar created')}}catch(error){if(error?.name!=='AbortError')toast('Could not share roster')}
  }
  $('#homeCycleSelect').onchange=e=>selectAppCycle(e.target.value);
  $$('[data-go]').forEach(b=>b.onclick=()=>go(b.dataset.go));
  const calendarMonths=$('#calendarMonths');
  if(calendarMonths)calendarMonths.addEventListener('scroll',updateCalendarTodayButton,{passive:true});
  window.addEventListener('resize',()=>requestAnimationFrame(sizeCalendarViewport),{passive:true});
  $('#calendarTodayFloat').onclick=()=>{
    const target=$('#calendarMonths')?.querySelector(`[data-key="${localISO(new Date())}"]`);
    if(target)scrollCalendarToTarget(target,'smooth');
  };
  $('#shareRoster').onclick=()=>{$('#shareRosterSheet').hidden=false};
  $('#shareRosterCancel').onclick=()=>{$('#shareRosterSheet').hidden=true};
  if($('#leaveFormCancel'))$('#leaveFormCancel').onclick=()=>{$('#leaveFormSheet').hidden=true;pendingLeaveDocument=null};
  if($('#leaveFormSheet'))$('#leaveFormSheet').onclick=e=>{if(e.target===$('#leaveFormSheet')){$('#leaveFormSheet').hidden=true;pendingLeaveDocument=null}};
  if($('#generateLeaveDocument'))$('#generateLeaveDocument').onclick=()=>generateLeaveForm(pendingLeaveDocument);
  if($('#leaveFormStart'))$('#leaveFormStart').onchange=renderLeaveHoursFields;
  if($('#leaveFormEnd'))$('#leaveFormEnd').onchange=renderLeaveHoursFields;
  $$('#shareRosterSheet [data-share-range]').forEach(b=>b.onclick=async()=>{const range=b.dataset.shareRange;$('#shareRosterSheet').hidden=true;await shareRoster(range)});
  $('#backToUpcomingPay').onclick=()=>{const upcoming=upcomingPayCycle();if(upcoming){selectedPayCycleId=upcoming.id;renderPayScreen()}};

  $('#startDate').onchange=()=>{current.startDate=$('#startDate').value;resolveAgreementSettings();buildRoster()};
  if($('#homeStartDate'))$('#homeStartDate').onchange=()=>{current.startDate=$('#homeStartDate').value;buildRoster()};
  ['classification','homeLine','otTarget'].forEach(id=>{
    const el=$('#'+id);if(!el)return;
    el.addEventListener(el.type==='checkbox'?'change':'input',()=>{readSettingsFromForm();buildRoster()});
  });
  $('#rosterLineNumber').addEventListener('change',e=>{
    const profile=currentProjectionProfile();if(!profile)return;
    current.settings.rosterLineNumber=Math.min(profile.lineCount,Math.max(1,Number(e.target.value)||1));
    current.settings.rosterLineAnchorDate=localISO(projectionFortnightStartForProfile(new Date(),profile));
    AppStorage.saveCurrent(current);buildRoster();
  });
  $('#clearRoster').onclick=()=>{if(confirm('Clear all shift codes for this fortnight?')){current.days=Array.from({length:14},emptyDay);buildRoster()}};
  $('#rosterSaveCycle').onclick=saveCycle;
  $('#rosterNewCycle').onclick=startNextFortnight;
  if($('#homeNewCycle'))$('#homeNewCycle').onclick=startNextFortnight;
  if($('#homeSettingsSummary'))$('#homeSettingsSummary').onclick=()=>go('settings');
  $('#saveCurrent').onclick=()=>{readSettingsFromForm();saveCurrent()};
  $('#resetApp').onclick=()=>{if(confirm('Delete the current roster and all saved pay cycles?')){AppStorage.clearAll();location.reload()}};
  $('#backSaved').onclick=renderSaved;
  $('#saveSavedDetails').onclick=saveSavedDetails;
  $('#editSavedCycle').onclick=editSavedCycle;
  if($('#savedFilter'))$('#savedFilter').onchange=renderSaved;
  if($('#exportBackup'))$('#exportBackup').onclick=exportBackup;
  if($('#importBackup'))$('#importBackup').onchange=e=>importBackup(e.target.files?.[0]);

  buildRoster();
  loadSettingsIntoForm();
  if('serviceWorker' in navigator){
    window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js').catch(()=>{}));
  }
})();
