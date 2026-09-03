
(() => {
  'use strict';

  const defaults={rateSource:'agreement',employmentRole:'',toCommencementDate:'',fcoAppointmentDate:'',stoPromotionDate:'',previousRoleBeforeSto:'',classificationOverride:true,classification:'',manualBaseRate:0,baseRate:0,wdMult:1,satMult:1.5,sunMult:2,addHoursMult:1.84,weekendOtMult:2,publicHolidayWorkedMult:2.5,hdRate:4.87,maRate:4.87,nightRate:5.77,lease:0,gesb:0,postTax:0,annualLeaveLoadingRate:12.55,extraTax:0,employeeName:'',serviceNumber:'',customPublicHolidays:'',homeLine:'',rosterLineNumber:0,rosterLineAnchorDate:'',otTarget:1};
  const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
  const money=n=>new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format(Number(n)||0);
  const localISO=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const parseLocalISO=s=>{
    const m=String(s||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(!m)return null;
    const y=Number(m[1]),mo=Number(m[2]),d=Number(m[3]),date=new Date(y,mo-1,d);
    return date.getFullYear()===y&&date.getMonth()===mo-1&&date.getDate()===d?date:null;
  };
  const parseDate=s=>new Date(s+'T00:00:00');
  const emptyDay=()=>({code:'',type:'Rostered',hd:false,start:'',finish:'',earlyStartHours:0,additionalHours:0,leaveHours:'',annualLeaveHours:0,phBenefit:'lieu',offline:false,workedRosterLine:'',offlineReason:'directed',partner:'',personalLeaveReason:'illness',bookOffHours:0,bookOffLeaveType:'',bookOffLeaveReason:'illness',scheduledStart:'',scheduledFinish:'',entered:false});
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
    const lengths=[];let run=0,longest=0,blocks=0;
    for(let i=0;i<14;i++){
      if(remaining[i]){run++;longest=Math.max(longest,run)}
      if((!remaining[i]||i===13)&&run){lengths.push(run);run=0}
    }
    blocks=lengths.length;
    // With a fixed OT target the number of remaining OFF days is constant. Sum-of-squares
    // deliberately favours keeping those days together rather than splitting a clean break.
    const quality=lengths.reduce((sum,len)=>sum+len*len,0);
    let interiorBreaks=0,otAdjacency=0;
    picked.forEach(i=>{
      if(remaining[i-1]&&remaining[i+1])interiorBreaks++;
      if(i>0&&(!originalOff[i-1]||picked.has(i-1)))otAdjacency++;
      if(i<13&&(!originalOff[i+1]||picked.has(i+1)))otAdjacency++;
    });
    return {quality,longest,blocks,interiorBreaks,otAdjacency};
  }
  function compareOtCombos(a,b){
    const netDiff=b.net-a.net;
    if(Math.abs(netDiff)>=0.01)return netDiff;
    if(b.rest.quality!==a.rest.quality)return b.rest.quality-a.rest.quality;
    if(b.rest.longest!==a.rest.longest)return b.rest.longest-a.rest.longest;
    if(a.rest.interiorBreaks!==b.rest.interiorBreaks)return a.rest.interiorBreaks-b.rest.interiorBreaks;
    if(a.rest.blocks!==b.rest.blocks)return a.rest.blocks-b.rest.blocks;
    if(b.rest.otAdjacency!==a.rest.otAdjacency)return b.rest.otAdjacency-a.rest.otAdjacency;
    return 0;
  }
  function sameOtTier(a,b){
    return Boolean(a&&b&&Math.abs(a.net-b.net)<0.01&&a.rest.quality===b.rest.quality&&a.rest.longest===b.rest.longest&&a.rest.interiorBreaks===b.rest.interiorBreaks&&a.rest.blocks===b.rest.blocks&&a.rest.otAdjacency===b.rest.otAdjacency);
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
    const available=Math.floor(navTop-top-6);
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
  let calendarWindowPast=2,calendarWindowFuture=5,calendarExpanding=false,calendarOtCompareMode=false;
  const calendarOtSelections=new Map();
  function showCalendarLoading(show){const el=$('#calendarLoading');if(el)el.hidden=!show}
  function updateCalendarOtCompareButton(){const b=$('#calendarOtCompare');if(!b)return;b.classList.toggle('active',calendarOtCompareMode);b.textContent=calendarOtCompareMode?'Done':'Compare OT'}
  function renderOtMultiSummary(){
    const detail=$('#calendarProjectionPay');if(!detail)return;
    if(!calendarOtSelections.size){detail.hidden=true;detail.innerHTML='';return}
    const picks=[...calendarOtSelections.values()].sort((a,b)=>a.dayIndex-b.dayIndex),first=picks[0];
    const date=parseDate(first.dateKey),state=visualDayState(date),actualCycle=state.entry?.cycle||null;
    const start=actualCycle?.startDate?parseDate(actualCycle.startDate):(state.projection?.fortnightStart||projectionFortnightStartForProfile(date));
    if(!start)return;
    const baseline=actualCycle?JSON.parse(JSON.stringify(actualCycle)):projectedBaselineCycle(start);baseline.settings=projectedSettingsForDate(start);
    const same=picks.filter(x=>{const d=parseDate(x.dateKey),st=actualCycle?.startDate?parseDate(actualCycle.startDate):(visualDayState(d).projection?.fortnightStart||projectionFortnightStartForProfile(d));return st&&localISO(st)===localISO(start)});
    const base=PayCalc.calculate(baseline),result=PayCalc.calculate(applyOtCandidates(baseline,same));
    detail.hidden=false;detail.innerHTML=`<span class="eyebrow">OT comparison · ${start.toLocaleDateString('en-AU',{day:'numeric',month:'short'})} – ${addRosterDays(start,13).toLocaleDateString('en-AU',{day:'numeric',month:'short'})}</span><div class="ot-pay-compare"><div class="ot-pay-base"><span>Estimated net</span><strong>${money(base.net)}</strong></div><div class="ot-pay-with best"><span>${same.length} OT shift${same.length===1?'':'s'} selected</span><strong>${money(result.net)}</strong><b>+${money(result.net-base.net)} net</b></div></div><button class="ghost ot-clear-selection" type="button">Clear selection</button>`;
    detail.querySelector('.ot-clear-selection').onclick=()=>{calendarOtSelections.clear();$$('.calendar-day.ot-multi-selected').forEach(x=>x.classList.remove('ot-multi-selected'));renderOtMultiSummary()};
  }

  function renderCalendar(selectedKey='',preserveScroll=''){
    sizeCalendarViewport();
    const wrap=$('#calendarMonths');if(!wrap)return;
    const previousScrollTop=wrap.scrollTop||0,previousScrollHeight=wrap.scrollHeight||0;
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
    const desiredFirst=new Date(focusMonth.getFullYear(),focusMonth.getMonth()-calendarWindowPast,1);
    const firstMonth=earliestMonth>desiredFirst?earliestMonth:desiredFirst;
    const lastMonth=new Date(focusMonth.getFullYear(),focusMonth.getMonth()+calendarWindowFuture,1);
    const monthCount=Math.max(1,monthDiff(firstMonth,lastMonth)+1);
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
        if(calendarOtSelections.has(key))button.classList.add('ot-multi-selected');
        const front=`${key===todayKey?'<span class="today-marker">TODAY</span>':''}${starText?`<span class="ot-stars ${stars===2?'ot-best':'ot-good'}" aria-label="${stars===2?'Best OT':'Good OT'}">${starText}</span>`:''}<span class="calendar-date">${day}</span><strong>${label}</strong>`;
        const back=otRec?`<span class="ot-flip-stars ${otRec.stars===2?'ot-best':'ot-good'}">${otRec.stars===2?'★':otRec.stars===1?'☆':'OT'}</span><strong>${otRec.stars===2?'Best OT':otRec.stars===1?'Good OT':'If OT'}</strong><b>+${money(otRec.singleNetGain)}</b><small>net</small>`:'';
        button.innerHTML=otRec?`<span class="calendar-flip-inner"><span class="calendar-day-face calendar-day-front">${front}</span><span class="calendar-day-face calendar-day-back">${back}</span></span>`:front;
        button.onclick=()=>{
          if(calendarOtCompareMode){
            if(!otRec){toast('Select an available OT day');return}
            if(calendarOtSelections.has(key)){calendarOtSelections.delete(key);button.classList.remove('ot-multi-selected')}
            else{
              const candidateStart=entry?.cycle?.startDate||(projection?.fortnightStart?localISO(projection.fortnightStart):'');
              const existing=[...calendarOtSelections.values()][0];
              if(existing&&existing.fortnightStartKey&&candidateStart&&existing.fortnightStartKey!==candidateStart){toast('OT comparison is one fortnight at a time');return}
              calendarOtSelections.set(key,{...otRec,fortnightStartKey:candidateStart});button.classList.add('ot-multi-selected');
            }
            renderOtMultiSummary();return;
          }
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
      if(preserveScroll){
        wrap.scrollTop=preserveScroll==='prepend'?Math.max(0,wrap.scrollHeight-previousScrollHeight+previousScrollTop):previousScrollTop;
        updateCalendarTodayButton();sizeCalendarViewport();return;
      }
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
    const selectedData=SHIFT_DATA[entry?.row?.code],row=entry?.row||{};
    const partialBookOff=Number(row.bookOffHours)>0&&row.bookOffLeaveType;
    if(!selectedData?.leaveType&&!partialBookOff)return null;
    const entries=rosterTimeline(),selectedDate=parseDate(key),leaveType=selectedData?.leaveType||row.bookOffLeaveType;
    if(partialBookOff&&!selectedData?.leaveType){
      return {leaveType,leaveEntries:[entry],start:selectedDate,end:selectedDate,hours:Number(row.bookOffHours)||0,reason:row.bookOffLeaveReason||'illness'};
    }
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
      const data=SHIFT_DATA[e.row.code];
      let type=data?.leaveType||'',reason='';
      let hours=0;
      if(type){
        reason=type==='sick'?leaveReasonForEntry(e):'';
        hours=leaveHoursForEntry(e);
      }else if(Number(e.row.bookOffHours)>0&&e.row.bookOffLeaveType){
        type=e.row.bookOffLeaveType;
        reason=type==='sick'?(e.row.bookOffLeaveReason||'illness'):'';
        hours=Number(e.row.bookOffHours)||0;
      }else continue;
      const key=type==='sick'?`${type}:${reason}`:type;
      if(!groups.has(key))groups.set(key,{key,leaveType:type,reason,entries:[],hours:0,start:new Date(d),end:new Date(d)});
      const g=groups.get(key);g.entries.push(e);g.hours+=hours;g.end=new Date(d);
    }
    return [...groups.values()];
  }
  function renderLeaveHoursFields(){
    if(!pendingLeaveDocument)return;
    const sv=$('#leaveFormStart')?.value,ev=$('#leaveFormEnd')?.value;if(!sv||!ev)return;
    const start=parseDate(sv),end=parseDate(ev);if(end<start)return;
    const groups=leaveGroupsInRange(start,end),wrap=$('#leaveFormHoursFields');if(!wrap)return;
    pendingLeaveDocument={...pendingLeaveDocument,start,end,groups};
    syncLeaveTypeFromGroups(groups);
    const typeSelect=$('#leaveFormType');if(typeSelect)typeSelect.disabled=groups.length>1;
    wrap.innerHTML=groups.length?groups.map((g,i)=>`<label>${esc(leaveLabel(g.leaveType))}${g.leaveType==='sick'?` — ${esc(leaveFormRow(g))}`:''} hours<input class="leave-group-hours" data-group-key="${esc(g.key)}" type="number" min="0" step="0.1" inputmode="decimal" value="${g.hours.toFixed(1)}"></label>`).join(''):`<label>Leave hours<input class="leave-group-hours manual-leave-hours" data-group-key="manual" type="number" min="0" step="0.1" inputmode="decimal" value="0.0"></label><small>No saved leave entries were found in this date range. Select the leave type and enter the hours.</small>`;
    const summary=$('#leaveFormRangeSummary');
    if(summary){summary.innerHTML=groups.length>1?`<strong>${groups.length} separate leave forms required</strong><small>${groups.map(g=>`${esc(leaveLabel(g.leaveType))} · ${g.hours.toFixed(1)} hrs`).join(' &nbsp;•&nbsp; ')}</small>`:`<strong>Review leave details</strong><small>Dates and hours are calculated from saved leave entries and can be adjusted before generating the PDF.</small>`}
  }
  function openLeaveFormFromHome(){
    const today=new Date(),key=localISO(today),entries=rosterTimeline(),entry=entries.get(key);
    pendingLeaveDocument={leaveType:'annual',leaveEntries:[],start:today,end:today,hours:0,reason:'illness',groups:[]};
    $('#leaveFormSheetTitle').textContent='Generate leave form';
    if($('#leaveFormType')){$('#leaveFormType').disabled=false;$('#leaveFormType').value=''};
    $('#leaveFormStart').value=key;$('#leaveFormEnd').value=key;
    $('#leaveFormComments').value='';$('#leaveContactable').value='yes';$('#leaveEvidence').value='no';
    renderLeaveHoursFields();$('#leaveFormSheet').hidden=false;
  }
  function openLeaveFormSheet(key,entry){
    const block=leaveBlockForEntry(key,entry);if(!block)return;
    pendingLeaveDocument=block;
    const sheet=$('#leaveFormSheet');
    $('#leaveFormSheetTitle').textContent=`${leaveLabel(block.leaveType)} application`;
    if($('#leaveFormType')){$('#leaveFormType').disabled=false;$('#leaveFormType').value=block.leaveType==='sick'?`sick:${block.reason||'illness'}`:block.leaveType};
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
  function selectedLeaveFormType(){
    const raw=$('#leaveFormType')?.value||'';if(!raw)return null;
    const [leaveType,reason='']=raw.split(':');return {leaveType,reason};
  }
  function syncLeaveTypeFromGroups(groups){
    const select=$('#leaveFormType');if(!select)return;
    if(groups.length===1){const g=groups[0];select.value=g.leaveType==='sick'?`sick:${g.reason||'illness'}`:g.leaveType}
  }
  async function generateLeaveForm(block){
    if(!block)return;
    const startValue=$('#leaveFormStart')?.value,endValue=$('#leaveFormEnd')?.value;
    if(!startValue||!endValue){toast('Enter the leave start and end dates');return}
    const adjustedStart=parseDate(startValue),adjustedEnd=parseDate(endValue);
    if(adjustedEnd<adjustedStart){toast('End date must be on or after start date');return}

    let groups=leaveGroupsInRange(adjustedStart,adjustedEnd);
    const selectedType=selectedLeaveFormType();
    if(groups.length<=1&&!selectedType){toast('Select the leave type');return}
    if(!groups.length){
      const hours=Math.max(0,Number($('.manual-leave-hours')?.value)||0);if(!hours){toast('Enter the leave hours');return}
      groups=[{key:'manual',leaveType:selectedType.leaveType,reason:selectedType.reason,entries:[],hours,start:adjustedStart,end:adjustedEnd}];
    }else if(groups.length===1){groups[0].leaveType=selectedType.leaveType;groups[0].reason=selectedType.reason;groups[0].key=selectedType.leaveType==='sick'?`sick:${selectedType.reason}`:selectedType.leaveType}

    $$('.leave-group-hours').forEach(input=>{
      const g=groups.find(x=>x.key===input.dataset.groupKey)||(groups.length===1?groups[0]:null),v=Number(input.value);
      if(g&&Number.isFinite(v))g.hours=Math.max(0,v);
    });

    const name=String(current.settings.employeeName||'').trim();
    const service=String(current.settings.serviceNumber||'').trim();
    const home=window.ROSTER_LINES?.[current.settings.homeLine]||current.settings.homeLine||'';
    const comments=String($('#leaveFormComments')?.value||'').trim();
    const contactable=$('#leaveContactable')?.value==='yes';
    const evidence=$('#leaveEvidence')?.value==='yes';
    const today=new Date();

    const loadImage=src=>new Promise((resolve,reject)=>{
      const img=new Image();
      img.onload=()=>resolve(img);
      img.onerror=reject;
      img.src=src;
    });
    const dataUrlBytes=dataUrl=>{
      const bin=atob(dataUrl.split(',')[1]),out=new Uint8Array(bin.length);
      for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);
      return out;
    };
    const concatBytes=parts=>{
      const len=parts.reduce((n,p)=>n+p.length,0),out=new Uint8Array(len);
      let off=0;for(const p of parts){out.set(p,off);off+=p.length}return out;
    };
    const enc=s=>new TextEncoder().encode(s);

    // Minimal multipage PDF writer using flattened JPEG pages.
    const pdfFromJpegs=pages=>{
      const W=595.276,H=841.89;
      const objects=[];
      objects[1]=enc('<< /Type /Catalog /Pages 2 0 R >>');
      const pageIds=[],imageIds=[],contentIds=[];
      let next=3;
      pages.forEach(()=>{pageIds.push(next++);imageIds.push(next++);contentIds.push(next++)});
      objects[2]=enc(`<< /Type /Pages /Count ${pages.length} /Kids [${pageIds.map(id=>`${id} 0 R`).join(' ')}] >>`);
      pages.forEach((p,i)=>{
        const pageId=pageIds[i],imageId=imageIds[i],contentId=contentIds[i];
        objects[pageId]=enc(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im${i} ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`);
        const imgHead=enc(`<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.bytes.length} >>\nstream\n`);
        const imgTail=enc('\nendstream');
        objects[imageId]=concatBytes([imgHead,p.bytes,imgTail]);
        const stream=`q\n${W} 0 0 ${H} 0 0 cm\n/Im${i} Do\nQ\n`;
        objects[contentId]=enc(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`);
      });

      const chunks=[enc('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')],offsets=[0];
      let offset=chunks[0].length;
      for(let id=1;id<objects.length;id++){
        offsets[id]=offset;
        const head=enc(`${id} 0 obj\n`),tail=enc('\nendobj\n');
        chunks.push(head,objects[id],tail);offset+=head.length+objects[id].length+tail.length;
      }
      const xrefOffset=offset;
      let xref=`xref\n0 ${objects.length}\n0000000000 65535 f \n`;
      for(let id=1;id<objects.length;id++)xref+=`${String(offsets[id]).padStart(10,'0')} 00000 n \n`;
      xref+=`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
      chunks.push(enc(xref));
      return new Blob(chunks,{type:'application/pdf'});
    };

    const leaveRowY=g=>{
      if(g.leaveType==='annual')return 570;
      if(g.leaveType==='lsl')return 648;
      if(g.leaveType==='sick'){
        if(g.reason==='care')return 826;
        if(g.reason==='unanticipated')return 872;
        return 786;
      }
      if(g.leaveType==='bereavement')return 934;
      if(g.leaveType==='dil')return 978;
      if(g.leaveType==='paid-parental')return 1020;
      if(g.leaveType==='unpaid-parental')return 1063;
      if(g.leaveType==='military')return 1106;
      if(g.leaveType==='union')return 1148;
      if(g.leaveType==='easter')return 1208;
      return 1252;
    };

    try{
      const template=await loadImage('./leave-form-template.png');
      const pages=[];
      for(const g of groups){
        const canvas=document.createElement('canvas');
        canvas.width=1414;canvas.height=2000;
        const ctx=canvas.getContext('2d');
        ctx.drawImage(template,0,0,1414,2000);
        ctx.fillStyle='#111';ctx.textBaseline='middle';
        ctx.font='22px Arial';

        const first=g.entries[0]?.date||adjustedStart;
        const last=g.entries[g.entries.length-1]?.date||adjustedEnd;
        const y=leaveRowY(g);

        const text=(x,y,val,font='22px Arial')=>{
          if(val===undefined||val===null||val==='')return;
          ctx.font=font;ctx.fillStyle='#111';ctx.fillText(String(val),x,y);
        };
        text(198,286,name);
        text(1080,328,service);
        text(263,376,home);
        text(616,y,fmtFormDate(first),'20px Arial');
        text(786,y,fmtFormDate(last),'20px Arial');
        text(969,y,g.hours.toFixed(1),'20px Arial');
        text(1084,y,comments,'20px Arial');
        text(391,1727,name,'20px Arial');
        text(391,1818,fmtFormDate(today),'20px Arial');

        // Put a compact X exactly inside the official Yes/No checkbox squares.
        const boxX=(x,y,on)=>{
          if(!on)return;
          ctx.save();
          ctx.strokeStyle='#111';ctx.lineWidth=2.2;
          ctx.beginPath();ctx.moveTo(x+2,y+2);ctx.lineTo(x+10,y+10);
          ctx.moveTo(x+10,y+2);ctx.lineTo(x+2,y+10);ctx.stroke();
          ctx.restore();
        };
        // Contactable: Yes / No
        boxX(594,1366,contactable);
        boxX(727,1366,!contactable);
        // Evidence attached: Yes / No
        boxX(594,1434,evidence);
        boxX(727,1434,!evidence);

        const jpeg=canvas.toDataURL('image/jpeg',0.96);
        pages.push({width:canvas.width,height:canvas.height,bytes:dataUrlBytes(jpeg)});
      }

      const pdf=pdfFromJpegs(pages);
      const url=URL.createObjectURL(pdf);
      const w=window.open(url,'_blank');
      if(!w){
        const a=document.createElement('a');
        a.href=url;a.download=`ShiftMate-Leave-${localISO(adjustedStart)}.pdf`;
        document.body.appendChild(a);a.click();a.remove();
      }
      setTimeout(()=>URL.revokeObjectURL(url),60000);
      $('#leaveFormSheet').hidden=true;pendingLeaveDocument=null;
      toast(groups.length>1?`${groups.length} separate leave forms generated`:'Leave form generated');
    }catch(error){
      console.error(error);
      toast('Could not generate leave PDF');
    }
  }

  function renderCalendarDetail(key,entry){
    const detail=$('#calendarDetail');if(!detail)return;
    $$('.calendar-day').forEach(el=>el.classList.toggle('selected',el.dataset.key===key));
    const date=parseDate(key),row=entry?.row||emptyDay(),data=SHIFT_DATA[row.code],hasBookOff=Number(row.bookOffHours)>0&&Boolean(row.bookOffLeaveType);
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
        ${hasBookOff?`<div><span>Book-off</span><strong>${Number(row.bookOffHours).toFixed(2)} hrs</strong></div>`:''}
      </div>
      ${(data?.leaveType||hasBookOff)?'<button type="button" class="primary calendar-leave-form-button">Generate Leave Form</button>':''}`;
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
    const profile=currentProjectionProfile();if(!profile||Number(current.settings.rosterLineNumber)<1)return null;
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
    const rosterLine=Number(current.settings.rosterLineNumber)||0,lineActive=Boolean(current.settings.classification&&current.settings.homeLine&&rosterLine>0);
    const deductions=['lease','gesb','postTax','extraTax'].filter(k=>Math.abs(Number(current.settings[k])||0)>0).length;
    const target=Math.min(5,Math.max(1,Number(current.settings.otTarget)||1));
    wrap.innerHTML=`<span class="setting-chip"><b>${current.settings.classification||'—'}</b></span>
      <span class="setting-chip"><small>Home</small><b>${homeLabel}</b></span>
      <span class="setting-chip state"><i class="status-lamp ${lineActive?'on':'off'}"></i><small>Line</small><b>${lineActive?rosterLine:'Off'}</b></span>
      <span class="setting-chip state"><i class="status-lamp ${deductions?'on':'off'}"></i><small>Deductions</small><b>${deductions?`${deductions} active`:'Off'}</b></span>
      <span class="setting-chip"><small>OT target</small><b>${target}</b></span>`;
  }
  const leaveOrder=['A/L','Sick','LSL','LWOP'];
  const rosterLineOptions=(selected='')=>Object.entries(window.ROSTER_LINES||{}).map(([value,label])=>`<option value="${value}" ${value===selected?'selected':''}>${label}</option>`).join('');
  const shiftDisplayLabels={CBR:'Claisebrook',MCN:'McIver',EQA:'Elizabeth Quay Arvo',EQM:'Elizabeth Quay Morn'};
const perthShiftLabels={PN:'Perth Assist Arvo',PA:'Perth Afternoon',PD:'Perth Assist Day',PM:'Perth Morning',PRD:'Perth Roaming Day',UD:'Underground Day',UN:'Underground Arvo'};
  const shiftOptionLabel=code=>{
    if(!code)return 'Off / no shift';
    const c=String(code).toUpperCase();
    if(c==='3M')return 'Delta 3 Morn';
    if(c==='3A')return 'Delta 3 Arvo';
    if(c==='3N')return 'Delta 3 Night';
    if(/^\d+[AM]$/.test(c)){
      const n=c.slice(0,-1);
      return `Delta ${n} ${c.endsWith('M')?'Morning':'Afternoon'}`;
    }
    if(/^\d+$/.test(c))return `Tango ${c}`;
    if(c==='SA')return 'Standby';
    if(shiftDisplayLabels[c])return shiftDisplayLabels[c];

    if(perthShiftLabels[c])return perthShiftLabels[c];
    return SHIFT_DATA[code]?.name||code;
  };
  const OFFLINE_CODE='OFFLINE';
  const allNetworkShiftOptions=(selected='',date=null)=>{
    const group=date?PayCalc.dayGroup(date.getDay()):null;
    const codes=Object.keys(SHIFT_DATA||{}).filter(code=>{
      const data=SHIFT_DATA[code];
      if(data?.leaveType)return false;
      if(!group)return true;
      const times=data.times?.[group]||['',''];
      return Boolean(times[0]&&times[1]);
    }).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
    return codes.map(code=>`<option value="${code}" ${code===selected?'selected':''}>${shiftOptionLabel(code)}</option>`).join('');
  };
  const effectiveShiftCode=card=>{
    const main=card.querySelector('.shift-code')?.value||'';
    return main===OFFLINE_CODE
      ? (card.querySelector('.offline-shift-code')?.value||card.dataset.effectiveShiftCode||'')
      : main;
  };
  const syncCardShiftDisplay=card=>{
    const code=effectiveShiftCode(card);
    const face=card.querySelector('.shift-face-code');
    if(face)face.textContent=code?(/^\d+$/.test(code)?`T${code}`:code):'OFF';
  };
  const opts=(selected,line,date=null)=>{
    const group=date?PayCalc.dayGroup(date.getDay()):null;
    const normal=Object.keys(SHIFT_DATA)
      .filter(code=>{
        const data=SHIFT_DATA[code];
        // Standby is available on every home/worked line. Its operational base is the selected line's home station.
        if(code!=='SA'&&data.line!==line)return false;
        if(!group)return true;
        const times=data.times?.[group]||['',''];
        return Boolean(times[0]&&times[1]);
      })
      .sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
    const codes=['',OFFLINE_CODE,...normal,...leaveOrder.filter(code=>SHIFT_DATA[code])];
    return codes.map(code=>`<option value="${code}" ${code===selected?'selected':''}>${shiftOptionLabel(code)}</option>`).join('');
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
    const unresolved=!String(current.settings?.classification||'').trim();
    const resolved=unresolved?{classification:'',classificationLabel:'Level not set',baseRate:0,weeklyRate:0,wageEffective:'',rules:{weekday:1,saturday:1.5,sunday:2,weekdayOvertime:1.84,weekendOvertime:2,publicHolidayWorked:1.5}}:PTA_AGREEMENT.resolve(current.settings,current.startDate);
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
    if(id==='calendar'){showCalendarLoading(true);requestAnimationFrame(()=>{renderCalendar();showCalendarLoading(false);sizeCalendarViewport()})}
    if(id==='pay') renderPayScreen();
    window.scrollTo({top:0,behavior:'smooth'});
  }

  function refreshShiftOptions(card,date,selected=''){
    const line=card.querySelector('.worked-line').value||current.settings.homeLine;
    const select=card.querySelector('.shift-code');

    const isSavedOffline=selected===OFFLINE_CODE;
    const validSelected=!isSavedOffline&&selected&&SHIFT_DATA[selected]&&(
      SHIFT_DATA[selected].line==='LEAVE'||
      (selected==='SA'&&(()=>{
        const times=SHIFT_DATA[selected].times?.[PayCalc.dayGroup(date.getDay())]||['',''];
        return Boolean(times[0]&&times[1]);
      })())||
      (SHIFT_DATA[selected].line===line&&(()=>{
        const times=SHIFT_DATA[selected].times?.[PayCalc.dayGroup(date.getDay())]||['',''];
        return Boolean(times[0]&&times[1]);
      })())
    );

    select.innerHTML=opts(isSavedOffline?OFFLINE_CODE:(validSelected?selected:''),line,date);
    select.value=isSavedOffline?OFFLINE_CODE:(validSelected?selected:'');

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
  let pendingBookOff=null;
  function logicalShiftMinutes(start,finish){
    if(!start||!finish)return 0;
    const s=minutesOf(start),f0=minutesOf(finish),f=f0<=s?f0+1440:f0;
    return Math.max(0,f-s);
  }
  function bookOffDifference(code,date,actualStart,actualFinish){
    const data=SHIFT_DATA[code];
    if(!data||data.leaveType||!actualStart||!actualFinish)return null;
    const nominal=data.times[PayCalc.dayGroup(date.getDay())]||['',''];
    if(!nominal[0]||!nominal[1])return null;
    const scheduled=logicalShiftMinutes(nominal[0],nominal[1]);
    const worked=logicalShiftMinutes(actualStart,actualFinish);
    const missing=Math.max(0,scheduled-worked);
    return missing>0?{scheduledStart:nominal[0],scheduledFinish:nominal[1],scheduledMinutes:scheduled,workedMinutes:worked,missingHours:missing/60}:null;
  }
  function openBookOffChoice(card,date){
    const code=card.querySelector('.shift-code').value;
    const actualStart=card.querySelector('.start-time').value;
    const actualFinish=card.querySelector('.finish-time').value;
    const diff=bookOffDifference(code,date,actualStart,actualFinish);
    if(!diff)return;
    pendingBookOff={card,date,code,actualStart,actualFinish,...diff};
    const summary=$('#bookOffSummary');
    if(summary)summary.innerHTML=`<strong>${diff.missingHours.toFixed(2)}h difference detected</strong><small>Rostered ${diff.scheduledStart}–${diff.scheduledFinish} • Entered ${actualStart}–${actualFinish}</small>`;
    $('#bookOffSheet').hidden=false;
  }
  function closeBookOffChoice(){if($('#bookOffSheet'))$('#bookOffSheet').hidden=true;pendingBookOff=null}
  function confirmBookOff(){
    if(!pendingBookOff)return;
    const {card,scheduledStart,scheduledFinish,missingHours}=pendingBookOff;
    card.dataset.bookOffHours=String(missingHours);
    card.dataset.bookOffLeaveType='sick';
    card.dataset.bookOffLeaveReason='illness';
    card.dataset.scheduledStart=scheduledStart;
    card.dataset.scheduledFinish=scheduledFinish;
    const label=card.querySelector('.shift-time');
    if(label)label.textContent+=` • ${missingHours.toFixed(2)}h book-off`;
    closeBookOffChoice();syncCurrentFromUI();recalculate();
    toast(`${missingHours.toFixed(2)}h book-off recorded`);
  }
  function acceptRosterAdjustment(){
    if(!pendingBookOff)return;
    const {card}=pendingBookOff;
    card.dataset.bookOffHours='0';card.dataset.bookOffLeaveType='';card.dataset.bookOffLeaveReason='';
    card.dataset.scheduledStart='';card.dataset.scheduledFinish='';
    closeBookOffChoice();syncCurrentFromUI();recalculate();
    toast('Roster adjustment recorded — no leave created');
  }

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
    const code=effectiveShiftCode(card);
    const face=card.querySelector('.shift-face-code');
    if(face)face.textContent=code?(/^\d+$/.test(code)?`T${code}`:code):'OFF';
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
    const code=effectiveShiftCode(card);
    const rowType=card.querySelector('.shift-type')?.value||'';
    const isOvertime=rowType==='Picked-up OT'||rowType==='Overtime';
    const hasRosterEntry=Boolean(code);
    card.dataset.entered=String(hasRosterEntry);
    card.classList.toggle('roster-unentered',!hasRosterEntry);
    card.classList.toggle('roster-entered',hasRosterEntry&&!isOvertime);
    card.classList.toggle('roster-overtime',hasRosterEntry&&isOvertime);
    const start=card.querySelector('.start-time')?.value||'';
    const finish=card.querySelector('.finish-time')?.value||'';
    const timeEl=card.querySelector('.shift-time');
    if(timeEl)timeEl.dataset.compactTime=(hasRosterEntry&&start&&finish)?`${start}–${finish}`:'';
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


  let activeShiftDetailsPortal=null;

  function closeShiftDetailsPortal(){
    const active=activeShiftDetailsPortal;
    const portal=$('#shiftDetailsPortal');
    if(!active){
      if(portal)portal.hidden=true;
      document.body.classList.remove('modal-open');
      return;
    }

    const {details,parent,nextSibling,card}=active;
    if(parent){
      if(nextSibling&&nextSibling.parentNode===parent)parent.insertBefore(details,nextSibling);
      else parent.appendChild(details);
    }
    card?.classList.remove('details-portal-open');
    if(portal)portal.hidden=true;
    document.body.classList.remove('modal-open');
    activeShiftDetailsPortal=null;
  }

  function openShiftDetailsPortal(card){
    const portal=$('#shiftDetailsPortal');
    const stage=$('#shiftDetailsPortalStage');
    const details=card?.querySelector('.day-details');
    if(!portal||!stage||!details)return;

    closeShiftDetailsPortal();

    const parent=details.parentNode;
    const nextSibling=details.nextSibling;
    activeShiftDetailsPortal={details,parent,nextSibling,card};

    stage.replaceChildren(details);
    card.classList.add('details-portal-open');
    portal.hidden=false;
    document.body.classList.add('modal-open');

    const close=details.querySelector('.roster-detail-close');
    if(close)close.onclick=e=>{e.preventDefault();e.stopPropagation();closeShiftDetailsPortal()};

    details.scrollTop=0;
  }

  function installShiftDetailsPortal(){
    const portal=$('#shiftDetailsPortal');
    const stage=$('#shiftDetailsPortalStage');
    if(!portal||!stage||portal.dataset.installed==='true')return;
    portal.dataset.installed='true';

    portal.addEventListener('click',e=>{
      if(e.target===portal)closeShiftDetailsPortal();
    });

    let startY=0,startX=0,tracking=false;
    stage.addEventListener('touchstart',e=>{
      if(e.touches.length!==1)return;
      startY=e.touches[0].clientY;
      startX=e.touches[0].clientX;
      tracking=true;
    },{passive:true});
    stage.addEventListener('touchend',e=>{
      if(!tracking||e.changedTouches.length!==1)return;
      tracking=false;
      const dy=e.changedTouches[0].clientY-startY;
      const dx=Math.abs(e.changedTouches[0].clientX-startX);
      const details=stage.querySelector('.day-details');
      if(dy>85&&dx<65&&(!details||details.scrollTop<=2))closeShiftDetailsPortal();
    },{passive:true});
  }

  function buildRoster(){
    refreshPartnerSuggestions();
    resolveAgreementSettings();
    $('#startDate').value=current.startDate;
    const rosterEnd=addRosterDays(parseDate(current.startDate),13);
    if($('#periodEndDate'))$('#periodEndDate').value=localISO(rosterEnd);
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
      const card=document.createElement('article');card.className='day-card roster-control-module';card.dataset.entered=String(Boolean(row.entered??row.code));
      // Unentered cards always follow the CURRENT Home line.  A worked line is
      // only sticky after the user has actually entered a shift; otherwise an old
      // home-line value can make blank cards keep showing another line's shifts.
      const rowEntered=Boolean(row.entered??row.code);
      const initialLine=rowEntered
        ? (row.workedRosterLine||SHIFT_DATA[row.code]?.line||current.settings.homeLine||'')
        : (current.settings.homeLine||'');
      card.dataset.workedRosterLine=initialLine;
      card.dataset.bookOffHours=String(Number(row.bookOffHours)||0);
      card.dataset.bookOffLeaveType=row.bookOffLeaveType||'';
      card.dataset.bookOffLeaveReason=row.bookOffLeaveReason||'illness';
      card.dataset.scheduledStart=row.scheduledStart||'';
      card.dataset.scheduledFinish=row.scheduledFinish||'';
      card.innerHTML=`<div class="day-head"><div><b>${date.toLocaleDateString('en-AU',{weekday:'short',day:'numeric',month:'short'})}</b><small>Day ${i+1}</small></div><span class="day-pay">$0.00</span></div>
      <div class="day-main">
        <label class="shift-picker"><span class="shift-face-code">${row.code?(/^\d+$/.test(row.code)?`T${row.code}`:row.code):'OFF'}</span><select class="shift-code" aria-label="Select shift">${opts(row.code,initialLine,date)}</select></label>
        <button type="button" class="ot-toggle plain-roster-action ${row.type==='Picked-up OT'?'active':''}">OT</button><button type="button" class="details-button plain-roster-action" aria-label="Shift details">•••</button>
      </div>
      <div class="shift-time">Choose a shift to show the default time.</div>
      <button class="roster-detail-backdrop" type="button" aria-label="Close shift details"></button>
      <div class="day-details">
        <div class="roster-detail-sheet-head"><div><span class="eyebrow">Shift details</span><strong>${date.toLocaleDateString('en-AU',{weekday:'short',day:'numeric',month:'short'})}</strong></div><button type="button" class="roster-detail-close" aria-label="Close shift details">×</button></div>
        <div class="form-grid two">
          <label>Worked line<select class="worked-line">${rosterLineOptions(initialLine)}</select></label>
          <label class="offline-shift-wrap" hidden>Off-Line Shift<select class="offline-shift-code"><option value="">Select an off-line shift</option></select></label>
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
      const offlineWrap=card.querySelector('.offline-shift-wrap');
      const offlineSelect=card.querySelector('.offline-shift-code');
      if(row.offlineShiftCode){
        card.dataset.effectiveShiftCode=row.offlineShiftCode;
        if(offlineWrap)offlineWrap.hidden=false;
        if(offlineSelect){
          offlineSelect.innerHTML=`<option value="">Select an off-line shift</option>${allNetworkShiftOptions(row.offlineShiftCode,date)}`;
          offlineSelect.value=row.offlineShiftCode;
        }
      }

      const closeRosterDetails=()=>card.classList.remove('open');
      card.querySelector('.details-button').onclick=()=>openShiftDetailsPortal(card);
      card.querySelector('.roster-detail-close').onclick=closeRosterDetails;
      card.querySelector('.roster-detail-backdrop').onclick=closeRosterDetails;
      card.querySelector('.ot-toggle').onclick=()=>{const type=card.querySelector('.shift-type'),btn=card.querySelector('.ot-toggle');if(!effectiveShiftCode(card)){toast('Select a shift first');return}const on=type.value==='Picked-up OT';type.value=on?'Rostered':'Picked-up OT';btn.classList.toggle('active',!on);card.dataset.entered='true';updateRosterCardState(card);syncCurrentFromUI();recalculate()};
      card.querySelector('.shift-code').onchange=()=>{
        const main=card.querySelector('.shift-code').value;
        const offlineWrap=card.querySelector('.offline-shift-wrap');
        const offlineSelect=card.querySelector('.offline-shift-code');
        if(main===OFFLINE_CODE){
          card.dataset.offline='true';
          card.dataset.entered='false'; // no effective shift until a real code is chosen
          if(offlineWrap){
            offlineWrap.hidden=false;
            offlineSelect.innerHTML=`<option value="">Select an off-line shift</option>${allNetworkShiftOptions(offlineSelect.value,date)}`;
          }
          // Preserve the requested immediate jump; the real shift selection below
          // is what turns the card into an entered shift.
          openShiftDetailsPortal(card);
          if(offlineSelect)offlineSelect.focus();
          updateRosterCardState(card);
          syncCurrentFromUI();
          recalculate();
          return;
        }
        if(offlineWrap)offlineWrap.hidden=true;
        if(offlineSelect)offlineSelect.value='';
        delete card.dataset.effectiveShiftCode;
        card.dataset.offline='false';
        card.dataset.entered='true';
        const line=card.querySelector('.worked-line');
        if(line){line.value=current.settings.homeLine;card.dataset.workedRosterLine=line.value}
        refreshShiftOptions(card,date,main);
        applyShiftDefaults(card,date,true);
        syncCardShiftDisplay(card);
        updateRosterCardState(card);
        syncCurrentFromUI();
        recalculate();
      };
      card.querySelector('.offline-shift-code').onchange=e=>{
        const code=e.target.value;
        const data=SHIFT_DATA[code];
        if(!data)return;
        card.dataset.effectiveShiftCode=code;
        card.dataset.offline='true';
        card.dataset.entered='true';
        // The home line remains the user's home line; workedRosterLine becomes
        // the selected shift's operational line so the existing allowance engine
        // can calculate the home-vs-worked-line allowance.
        const line=card.querySelector('.worked-line');
        if(line && data.line && data.line!=='LEAVE'){
          line.value=data.line;
          card.dataset.workedRosterLine=data.line;
        }
        // Offline selections use the selected operational shift as the source of truth.
        // Populate the actual rostered times explicitly before syncing/recalculating;
        // this avoids the offline selector path ever leaving Start/Finish blank.
        const offlineTimes=data.times?.[PayCalc.dayGroup(date.getDay())]||['',''];
        const start=card.querySelector('.start-time');
        const finish=card.querySelector('.finish-time');
        if(start)start.value=offlineTimes[0]||'';
        if(finish)finish.value=offlineTimes[1]||'';
        card.dataset.scheduledStart=offlineTimes[0]||'';
        card.dataset.scheduledFinish=offlineTimes[1]||'';
        applyShiftDefaults(card,date,true);
        syncCardShiftDisplay(card);
        updateRosterCardState(card);
        syncCurrentFromUI();
        recalculate();
        syncCardShiftDisplay(card);
      };
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
      const considerBookOff=()=>{const diff=bookOffDifference(card.querySelector('.shift-code').value,date,card.querySelector('.start-time').value,card.querySelector('.finish-time').value);if(diff)openBookOffChoice(card,date)};
      card.querySelector('.start-time').onchange=considerBookOff;
      card.querySelector('.finish-time').onchange=considerBookOff;
      refreshShiftOptions(card,date,row.offlineShiftCode?OFFLINE_CODE:(row.code||''));
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
    if($('#periodEndDate')?.value){
      current.startDate=localISO(addRosterDays(parseDate($('#periodEndDate').value),-13));
      $('#startDate').value=current.startDate;
    }else current.startDate=$('#startDate').value;
    resolveAgreementSettings();
    current.days=$$('.day-card').map(card=>({
      code:effectiveShiftCode(card),
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
      offlineShiftCode:card.querySelector('.shift-code').value===OFFLINE_CODE?effectiveShiftCode(card):'',
      offlineReason:card.querySelector('.offline-reason').value||'directed',
      partner:card.querySelector('.shift-partner')?.value.trim()||'',
      personalLeaveReason:card.querySelector('.personal-leave-reason')?.value||'illness',
      bookOffHours:Number(card.dataset.bookOffHours)||0,
      bookOffLeaveType:card.dataset.bookOffLeaveType||'',
      bookOffLeaveReason:card.dataset.bookOffLeaveReason||'illness',
      scheduledStart:card.dataset.scheduledStart||'',
      scheduledFinish:card.dataset.scheduledFinish||'',
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
    button.textContent='Save Pay Cycle';
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

  let rosterScanStream=null, rosterScanMode='current', pendingRosterScan=null;

  function stopRosterCamera(){
    if(rosterScanStream){rosterScanStream.getTracks().forEach(t=>t.stop());rosterScanStream=null}
    const video=$('#rosterScanVideo');if(video)video.srcObject=null;
  }
  function closeRosterScanner(){stopRosterCamera();if($('#rosterScanSheet'))$('#rosterScanSheet').hidden=true}
  async function openRosterScanner(mode='current'){
    rosterScanMode=mode;pendingRosterScan=null;
    const sheet=$('#rosterScanSheet'),status=$('#rosterScanStatus');if(!sheet)return;
    sheet.hidden=false;status.textContent='Starting camera…';
    try{
      if(!navigator.mediaDevices?.getUserMedia)throw new Error('Camera access is not available in this browser.');
      rosterScanStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:3840},height:{ideal:2160}},audio:false});
      const video=$('#rosterScanVideo');video.srcObject=rosterScanStream;await video.play();video.hidden=false;const canvas=$('#rosterScanCanvas');if(canvas)canvas.hidden=true;status.textContent='Camera ready';
    }catch(err){status.textContent=err?.message||'Unable to open camera.'}
  }
  function normaliseOcrToken(value){return String(value||'').toUpperCase().replace(/[–—]/g,'-').replace(/[^A-Z0-9/-]/g,'').trim()}
  function validScanCodes(){return new Set(Object.keys(SHIFT_DATA||{}).map(k=>String(k).toUpperCase()))}
  const OCR_MONTHS={JANUARY:0,FEBRUARY:1,MARCH:2,APRIL:3,MAY:4,JUNE:5,JULY:6,AUGUST:7,SEPTEMBER:8,OCTOBER:9,NOVEMBER:10,DECEMBER:11,
                    JAN:0,FEB:1,MAR:2,APR:3,JUN:5,JUL:6,AUG:7,SEP:8,SEPT:8,OCT:9,NOV:10,DEC:11};
  const OCR_WEEKDAYS={SUN:0,SUNDAY:0,MON:1,MONDAY:1,TUE:2,TUES:2,TUESDAY:2,WED:3,WEDNESDAY:3,THU:4,THUR:4,THURS:4,THURSDAY:4,FRI:5,FRIDAY:5,SAT:6,SATURDAY:6};
  function validOcrDate(d,m,y){
    d=Number(String(d||'').replace(/[Oo]/g,'0').replace(/[Il]/g,'1'));
    m=Number(String(m||'').replace(/[Oo]/g,'0').replace(/[Il]/g,'1'));
    y=Number(String(y||'').replace(/[Oo]/g,'0').replace(/[Il]/g,'1'));
    if(y<100)y+=2000;
    const x=new Date(y,m-1,d);
    return x.getFullYear()===y&&x.getMonth()===m-1&&x.getDate()===d?x:null;
  }
  function parseOcrDateToken(text,yearHint){
    const t=String(text||'').trim();
    let m=t.match(/\b(\d{1,2})[\/.\-](\d{1,2})(?:[\/.\-](\d{2,4}))?\b/);
    if(m)return validOcrDate(m[1],m[2],m[3]||yearHint);
    m=t.match(/\b(\d{1,2})\s*([A-Za-z]{3,9})(?:\s+(\d{2,4}))?\b/);
    if(!m)return null;
    const mon=OCR_MONTHS[String(m[2]).toUpperCase()];
    return mon===undefined?null:validOcrDate(m[1],mon+1,m[3]||yearHint);
  }
  function detectPeriodEnd(text,words=[]){
    const raw=String(text||'');
    const norm=raw.replace(/[–—]/g,'-').replace(/\s+/g,' ').trim();

    // Strongest evidence first: explicit pay-period or period-end labels.
    let m=norm.match(/PAY\s*PER(?:I|1|L)?OD\s*:?\s*([0-9OoIl]{1,2})\s*[\/.\-]\s*([0-9OoIl]{1,2})\s*[\/.\-]\s*([0-9OoIl]{2,4})\s*(?:TO|T0|-)\s*([0-9OoIl]{1,2})\s*[\/.\-]\s*([0-9OoIl]{1,2})\s*[\/.\-]\s*([0-9OoIl]{2,4})/i);
    if(m){const pe=validOcrDate(m[4],m[5],m[6]);if(pe)return pe}
    m=norm.match(/(?:PERIOD\s*END|\bPE\b)\s*[:\-]?\s*([0-9OoIl]{1,2})\s*[\/.\-]?\s*([0-9OoIl]{1,2})\s*[\/.\-]?\s*([0-9OoIl]{2,4})/i);
    if(m){const pe=validOcrDate(m[1],m[2],m[3]);if(pe)return pe}
    m=norm.match(/\bPE\s*([0-9OoIl]{2})([0-9OoIl]{2})([0-9OoIl]{2,4})\b/i);
    if(m){const pe=validOcrDate(m[1],m[2],m[3]);if(pe)return pe}

    const explicitYears=[...norm.matchAll(/\b(20\d{2})\b/g)].map(x=>Number(x[1]));
    const baseYear=explicitYears[0]||new Date().getFullYear();
    const observations=[];
    const pushObs=(day,month,year,weekday=null)=>{
      day=Number(String(day||'').replace(/[Oo]/g,'0').replace(/[Il]/g,'1'));
      month=Number(String(month||'').replace(/[Oo]/g,'0').replace(/[Il]/g,'1'));
      if(day<1||day>31||month<1||month>12)return;
      const years=year?[Number(String(year).replace(/[Oo]/g,'0').replace(/[Il]/g,'1'))]:[baseYear-1,baseYear,baseYear+1];
      years.forEach(y=>{
        if(y<100)y+=2000;
        const d=validOcrDate(day,month,y);if(!d)return;
        if(weekday!==null&&d.getDay()!==weekday)return;
        observations.push(d);
      });
    };

    // Numeric dates: dd/mm/yyyy, dd/mm/yy and dd/mm. Weekday prefix is optional.
    for(const x of norm.matchAll(/(?:(SUN(?:DAY)?|MON(?:DAY)?|TUE(?:S|SDAY)?|WED(?:NESDAY)?|THU(?:R|RS|RSDAY)?|FRI(?:DAY)?|SAT(?:URDAY)?)\s*,?\s*)?([0-9OoIl]{1,2})\s*[\/.\-]\s*([0-9OoIl]{1,2})(?:\s*[\/.\-]\s*([0-9OoIl]{2,4}))?/ig)){
      const wd=x[1]?OCR_WEEKDAYS[String(x[1]).toUpperCase()]:null;
      pushObs(x[2],x[3],x[4]||null,wd);
    }
    // Written dates: Sun 23 Aug, 23 Aug 2026, Sun, 19 April 2026.
    for(const x of norm.matchAll(/(?:(SUN(?:DAY)?|MON(?:DAY)?|TUE(?:S|SDAY)?|WED(?:NESDAY)?|THU(?:R|RS|RSDAY)?|FRI(?:DAY)?|SAT(?:URDAY)?)\s*,?\s*)?([0-9OoIl]{1,2})\s+([A-Z]{3,9})(?:\s+(20\d{2}|\d{2}))?/ig)){
      const mon=OCR_MONTHS[String(x[3]).toUpperCase()];if(mon===undefined)continue;
      const wd=x[1]?OCR_WEEKDAYS[String(x[1]).toUpperCase()]:null;
      pushObs(x[2],mon+1,x[4]||null,wd);
    }
    // Individual OCR words can preserve a date that the joined text mangles.
    (words||[]).forEach(w=>{
      const t=String(w?.text||'');
      const x=t.match(/([0-9OoIl]{1,2})[\/.\-]([0-9OoIl]{1,2})(?:[\/.\-]([0-9OoIl]{2,4}))?/);
      if(x)pushObs(x[1],x[2],x[3]||null,null);
    });

    if(!observations.length)return null;
    const uniq=[...new Map(observations.map(d=>[localISO(d),d])).values()];
    const observedKeys=new Set(uniq.map(localISO));

    // Score every plausible Sunday-started 14-day window. This tolerates OCR
    // missing individual dates and naturally handles month/year rollovers.
    const candidates=new Map();
    uniq.forEach(d=>{
      for(let offset=0;offset<14;offset++){
        const start=addRosterDays(d,-offset);
        if(start.getDay()!==0)continue;
        const key=localISO(start);if(!candidates.has(key))candidates.set(key,start);
      }
    });
    let best=null;
    for(const start of candidates.values()){
      const end=addRosterDays(start,13);
      let hits=0;
      for(let i=0;i<14;i++)if(observedKeys.has(localISO(addRosterDays(start,i))))hits++;
      const seen=uniq.filter(d=>d>=start&&d<=end).sort((a,b)=>a-b);
      if(!seen.length)continue;
      const span=Math.round((seen[seen.length-1]-seen[0])/86400000);
      // Require enough independent evidence to avoid guessing from one tiny date fragment.
      const strong=hits>=7 || (hits>=4&&span>=7) || (hits>=3&&span>=10);
      if(!strong)continue;
      const distance=Math.abs(end-new Date());
      const score=hits*100+span*4-distance/86400000/365;
      if(!best||score>best.score)best={end,score,hits,span};
    }
    return best?best.end:null;
  }
  function scanAssignmentsFromWords(words,periodEnd){
    const valid=validScanCodes(),start=addRosterDays(periodEnd,-13),assign=Array(14).fill('');
    const employee=String(current.settings.employeeName||'').trim().toUpperCase();
    const service=String(current.settings.serviceNumber||'').trim();
    const cleanWords=(words||[])
      .filter(w=>Number(w.confidence??w.conf??0)>25)
      .map(w=>({...w,token:normaliseOcrToken(w.text),box:w.bbox||{x0:0,y0:0,x1:0,y1:0}}));
    if(!cleanWords.length)return assign;

    const cx=w=>(w.box.x0+w.box.x1)/2,cy=w=>(w.box.y0+w.box.y1)/2;
    const heights=cleanWords.map(w=>Math.max(1,w.box.y1-w.box.y0)).sort((a,b)=>a-b);
    const medianH=heights[Math.floor(heights.length/2)]||14;
    const rowBand=Math.max(12,medianH*0.8);

    // Group all OCR words into visual rows in the *native camera coordinate system*.
    // This is safe only because each OCR pass has already been transformed back to native.
    const rows=[];
    [...cleanWords].sort((a,b)=>cy(a)-cy(b)).forEach(w=>{
      let row=rows.find(r=>Math.abs(r.y-cy(w))<rowBand);
      if(!row){row={y:cy(w),words:[]};rows.push(row)}
      row.words.push(w);
      row.y=row.words.reduce((sum,x)=>sum+cy(x),0)/row.words.length;
    });
    rows.forEach(r=>r.words.sort((a,b)=>a.box.x0-b.box.x0));

    const dateForLine=line=>{
      const hints=[periodEnd.getFullYear()-1,periodEnd.getFullYear(),periodEnd.getFullYear()+1];
      for(const y of hints){
        const d=parseOcrDateToken(line,y);
        if(d&&d>=addRosterDays(start,-1)&&d<=addRosterDays(periodEnd,1))return d;
      }
      const m=String(line||'').match(/(?:SUN(?:DAY)?|MON(?:DAY)?|TUE(?:S|SDAY)?|WED(?:NESDAY)?|THU(?:R|RS|RSDAY)?|FRI(?:DAY)?|SAT(?:URDAY)?)\s*,?\s*([0-9OoIl]{1,2})\s+([A-Za-z]{3,9})(?:\s+(20\d{2}|\d{2}))?/i);
      if(m){
        const mon=OCR_MONTHS[String(m[2]).toUpperCase()];
        if(mon!==undefined){
          for(const y of (m[3]?[Number(m[3])]:hints)){
            const d=validOcrDate(m[1],mon+1,y);
            if(d&&d>=addRosterDays(start,-1)&&d<=addRosterDays(periodEnd,1))return d;
          }
        }
      }
      return null;
    };

    // Date anchors that survived as individual OCR tokens. These are ideal for
    // multi-person grid rosters because their x coordinate identifies a day column.
    const dateWords=[];
    cleanWords.forEach(w=>{
      for(const y of [periodEnd.getFullYear()-1,periodEnd.getFullYear(),periodEnd.getFullYear()+1]){
        const d=parseOcrDateToken(w.text,y);
        if(d&&d>=start&&d<=periodEnd){dateWords.push({w,d});break}
      }
    });

    // Locate the user's row. Prefer the exact service number because surnames and
    // initials can appear elsewhere on dense multi-person rosters.
    let identityHits=service?cleanWords.filter(w=>w.token===normaliseOcrToken(service)):[];
    if(!identityHits.length&&employee){
      const nameParts=employee.split(/\s+/).map(normaliseOcrToken).filter(x=>x.length>2);
      identityHits=cleanWords.filter(w=>nameParts.includes(w.token));
    }
    let targetY=identityHits.length?identityHits.reduce((sum,w)=>sum+cy(w),0)/identityHits.length:null;

    // Detect whether date anchors form a horizontal grid header. Do not apply grid
    // logic to individual/list rosters where dates run vertically down the page.
    if(targetY!==null&&dateWords.length>=5){
      const xs=dateWords.map(x=>cx(x.w)),ys=dateWords.map(x=>cy(x.w));
      const xSpan=Math.max(...xs)-Math.min(...xs),ySpan=Math.max(...ys)-Math.min(...ys);
      const gridLike=xSpan>Math.max(180,ySpan*2.2);
      if(gridLike){
        const byIndex=new Map();
        dateWords.forEach(a=>{
          const idx=Math.round((new Date(a.d.getFullYear(),a.d.getMonth(),a.d.getDate())-new Date(start.getFullYear(),start.getMonth(),start.getDate()))/86400000);
          if(idx<0||idx>13)return;
          const old=byIndex.get(idx);
          // Prefer the date observation in the densest horizontal header band.
          if(!old||Number(a.w.confidence??a.w.conf??0)>Number(old.w.confidence??old.w.conf??0))byIndex.set(idx,a);
        });
        const anchors=[...byIndex.entries()].sort((a,b)=>a[0]-b[0]).map(([idx,a])=>({idx,x:cx(a.w),w:a.w}));
        if(anchors.length>=5){
          // Estimate missing date-column centres from a robust linear fit across known anchors.
          const n=anchors.length,sumI=anchors.reduce((s,a)=>s+a.idx,0),sumX=anchors.reduce((s,a)=>s+a.x,0);
          const meanI=sumI/n,meanX=sumX/n;
          const denom=anchors.reduce((s,a)=>s+(a.idx-meanI)**2,0)||1;
          const step=anchors.reduce((s,a)=>s+(a.idx-meanI)*(a.x-meanX),0)/denom;
          const base=meanX-step*meanI;
          const colHalf=Math.max(18,Math.abs(step)*0.46);
          const yTol=Math.max(24,medianH*2.2);
          for(let i=0;i<14;i++){
            const x0=base+step*i;
            const candidates=cleanWords.filter(w=>valid.has(w.token)&&Math.abs(cx(w)-x0)<=colHalf&&Math.abs(cy(w)-targetY)<=yTol)
              .sort((a,b)=>Math.abs(cy(a)-targetY)-Math.abs(cy(b)-targetY)||Number(b.confidence??b.conf??0)-Number(a.confidence??a.conf??0));
            if(candidates[0])assign[i]=candidates[0].token;
          }
          // If the grid path found anything, keep it. Empty cells remain unresolved/off
          // for review; never borrow a code from a neighbouring row or column.
          if(assign.some(Boolean))return assign;
        }
      }
    }

    // Individual/list roster: each visual row contains its own date and shift details.
    // Parse the row date first, then accept only a known ShiftMate shift code from that row.
    rows.forEach(row=>{
      const line=row.words.map(w=>String(w.text||'')).join(' ').replace(/\s+/g,' ').trim();
      const d=dateForLine(line);if(!d)return;
      const idx=Math.round((new Date(d.getFullYear(),d.getMonth(),d.getDate())-new Date(start.getFullYear(),start.getMonth(),start.getDate()))/86400000);
      if(idx<0||idx>13)return;
      const codes=row.words.filter(w=>valid.has(w.token));
      if(!codes.length)return;
      // Shift code is normally the first valid code after the date. If OCR has merged
      // columns, confidence breaks ties; unknown tokens such as T20/T21 are ignored.
      codes.sort((a,b)=>a.box.x0-b.box.x0||Number(b.confidence??b.conf??0)-Number(a.confidence??a.conf??0));
      assign[idx]=codes[0].token;
    });

    return assign;
  }

  async function loadTesseract(){
    if(window.Tesseract)return window.Tesseract;
    await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';s.onload=resolve;s.onerror=()=>reject(new Error('Scanner engine could not be loaded. Check your internet connection.'));document.head.appendChild(s)});return window.Tesseract;
  }

  function makeScanVariant(source,sx,sy,sw,sh,targetW=2200,contrast=1.35){
    const c=document.createElement('canvas');
    const scale=Math.max(1,Math.min(4,targetW/Math.max(1,sw)));
    c.width=Math.round(sw*scale);c.height=Math.round(sh*scale);
    // Keep the crop transform on the canvas so OCR bounding boxes can be mapped
    // back into the native camera frame before results from different passes merge.
    c.__shiftMateScanTransform={sx,sy,sw,sh,scaleX:sw/c.width,scaleY:sh/c.height};
    const x=c.getContext('2d',{willReadFrequently:true});
    x.drawImage(source,sx,sy,sw,sh,0,0,c.width,c.height);
    const im=x.getImageData(0,0,c.width,c.height),p=im.data;
    for(let i=0;i<p.length;i+=4){
      const y=.299*p[i]+.587*p[i+1]+.114*p[i+2];
      const v=Math.max(0,Math.min(255,(y-128)*contrast+142));
      p[i]=p[i+1]=p[i+2]=v;
    }
    x.putImageData(im,0,0);return c;
  }

  function mapOcrWordsToNative(words,transform){
    const t=transform||{sx:0,sy:0,scaleX:1,scaleY:1};
    return (Array.isArray(words)?words:[]).map(w=>{
      const b=w?.bbox||{x0:0,y0:0,x1:0,y1:0};
      return {...w,bbox:{
        x0:t.sx+b.x0*t.scaleX,y0:t.sy+b.y0*t.scaleY,
        x1:t.sx+b.x1*t.scaleX,y1:t.sy+b.y1*t.scaleY
      }};
    });
  }

  async function ocrRosterRegion(T,canvas,label,status){
    const r=await T.recognize(canvas,'eng',{logger:m=>{
      if(m.status==='recognizing text')status.textContent=`${label}… ${Math.round((m.progress||0)*100)}%`;
    }});
    const data=r.data||{};
    return {...data,words:mapOcrWordsToNative(data.words,canvas.__shiftMateScanTransform),scanTransform:canvas.__shiftMateScanTransform||null};
  }

  function mergeScanWords(results){
    // Every result is already expressed in native-camera coordinates. Deduplicate
    // near-identical words from overlapping OCR passes so one pass cannot dominate.
    const merged=[];
    for(const w of results.flatMap(r=>Array.isArray(r?.words)?r.words:[])){
      const b=w?.bbox||{x0:0,y0:0,x1:0,y1:0},cx=(b.x0+b.x1)/2,cy=(b.y0+b.y1)/2,token=normaliseOcrToken(w.text);
      if(!token)continue;
      const dupe=merged.find(x=>x.__token===token&&Math.abs(x.__cx-cx)<12&&Math.abs(x.__cy-cy)<8);
      if(dupe){if(Number(w.confidence??w.conf??0)>Number(dupe.confidence??dupe.conf??0))Object.assign(dupe,w,{__token:token,__cx:cx,__cy:cy});continue}
      merged.push({...w,__token:token,__cx:cx,__cy:cy});
    }
    return merged;
  }

  function chooseScanPeriodEnd(results){
    const found=[];
    for(const r of results){
      const pe=detectPeriodEnd(r?.text||'',r?.words||[]);
      if(pe)found.push(pe);
    }
    if(!found.length)return null;
    const counts=new Map();
    found.forEach(d=>counts.set(localISO(d),(counts.get(localISO(d))||0)+1));
    const best=[...counts.entries()].sort((a,b)=>b[1]-a[1])[0];
    return best?parseLocalISO(best[0]):null;
  }

  function scanConfidence(assignments){
    const filled=assignments.filter(Boolean).length;
    return {filled,complete:filled===14,needsFallback:filled<14};
  }

  async function captureRosterScan(){
    const video=$('#rosterScanVideo'),canvas=$('#rosterScanCanvas'),status=$('#rosterScanStatus'),debug=$('#rosterScanDebug');
    if(!video?.videoWidth){toast('Camera is not ready');return}

    // Preserve the native camera frame. The on-screen 4:3 box is a viewfinder only.
    canvas.width=video.videoWidth;canvas.height=video.videoHeight;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    ctx.drawImage(video,0,0,canvas.width,canvas.height);
    video.hidden=true;canvas.hidden=false;
    status.textContent='Photo captured — you can move your phone';
    if(debug){debug.hidden=true;debug.textContent=''}

    try{
      const T=await loadTesseract();
      const W=canvas.width,H=canvas.height;

      // Adaptive photo-first scan. Separate passes give tiny roster text more pixels.
      const overview=makeScanVariant(canvas,0,0,W,H,2400,1.28);
      const header=makeScanVariant(canvas,0,0,W,Math.round(H*.34),2600,1.42);
      const leftDates=makeScanVariant(canvas,0,0,Math.round(W*.48),H,2400,1.42);
      const centreRows=makeScanVariant(canvas,0,Math.round(H*.18),W,Math.round(H*.68),2800,1.38);

      const results=[];
      results.push(await ocrRosterRegion(T,header,'Reading dates',status));
      let pe=chooseScanPeriodEnd(results);

      // If header did not establish the cycle, use the Actuals/date-column pass.
      if(!pe){
        results.push(await ocrRosterRegion(T,leftDates,'Reading roster dates',status));
        pe=chooseScanPeriodEnd(results);
      }

      // Overview is useful corroboration and identity evidence.
      results.push(await ocrRosterRegion(T,overview,'Checking roster',status));
      pe=pe||chooseScanPeriodEnd(results);

      if(!pe){
        const chars=results.reduce((n,r)=>n+String(r?.text||'').replace(/\s+/g,' ').trim().length,0);
        status.textContent=`Could not establish the 14-day roster period. OCR captured ${chars} characters. No shifts were changed.`;
        if(debug){debug.hidden=false;debug.textContent=`TEST: native capture ${W}×${H}; targeted passes ${results.length}; PE unresolved`}
        return;
      }

      // Try the full user/shift region only after the cycle is known.
      results.push(await ocrRosterRegion(T,centreRows,'Reading shifts',status));
      const combinedWords=mergeScanWords(results);
      const assignments=scanAssignmentsFromWords(combinedWords,pe);
      const confidence=scanConfidence(assignments);

      window.__shiftMateLastRosterOcr=results.map(r=>String(r?.text||'')).join('\n---PASS---\n');
      pendingRosterScan={periodEnd:pe,assignments,scanConfidence:confidence,nativeSize:{width:W,height:H}};

      closeRosterScanner();
      renderRosterScanReview();
      $('#rosterPeSheet').hidden=false;
    }catch(err){
      status.textContent=err?.message||'Roster scan failed. No shifts were changed.';
    }
  }
  function renderRosterScanReview(){
    if(!pendingRosterScan)return;
    const {periodEnd,assignments}=pendingRosterScan,start=addRosterDays(periodEnd,-13);
    const title=$('#rosterPeConfirmText'),wrap=$('#rosterScanReview');
    if(title)title.textContent=`PE ${periodEnd.toLocaleDateString('en-AU',{day:'numeric',month:'long',year:'numeric'})}`;
    if(!wrap)return;
    wrap.innerHTML=assignments.map((code,i)=>{
      const d=addRosterDays(start,i);
      const date=d.toLocaleDateString('en-AU',{weekday:'short',day:'numeric',month:'short'});
      return `<div class="roster-review-row"><strong>${date}</strong>${code?`<span>${code}</span>`:'<span class="unresolved">Unresolved</span>'}</div>`;
    }).join('');
  }

  function applyPendingRosterScan(){
    const scanMeta=pendingRosterScan?.scanConfidence||null;
    if(!pendingRosterScan)return;const {periodEnd,assignments}=pendingRosterScan;$('#rosterPeSheet').hidden=true;
    const start=addRosterDays(periodEnd,-13);current.startDate=localISO(start);current.days=Array.from({length:14},emptyDay);AppStorage.saveCurrent(current);buildRoster();
    const cards=$$('.day-card');let applied=0;assignments.forEach((code,i)=>{if(!code||!cards[i])return;const select=cards[i].querySelector('.shift-code');if(!select)return;const option=[...select.options].find(o=>String(o.value).toUpperCase()===code);if(!option)return;select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));applied++});
    syncCurrentFromUI();AppStorage.saveCurrent(current);go('roster');toast(applied?`${applied} scanned shift${applied===1?'':'s'} pre-selected — review before saving`:'PE confirmed. No shift codes were confidently recognised; review the roster manually.');pendingRosterScan=null;

    if(scanMeta && scanMeta.filled<14){
      setTimeout(()=>toast(`Scan found ${scanMeta.filled}/14 shift codes. Review the remaining days manually.`),80);
    }
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
      version:'2.4.3-p2-cleanup-test',
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
    const configured=Number(current.settings.rosterLineNumber)||0;
    const line=configured?(projectionCurrentLineToday()||configured):0;
    el.innerHTML=`<option value="" ${line?'':'selected'}>Select roster line…</option>`+Array.from({length:profile.lineCount},(_,i)=>`<option value="${i+1}" ${i+1===line?'selected':''}>Line ${i+1}</option>`).join('');
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



  // Shift Swap documentation — generates the official PTA form without altering roster data.
  let swapMode='single';
  const swapState={requestDates:[],partnerDates:[]};
  const swapDateValue=id=>{const v=$(id)?.value;return v?parseDate(v):null};
  const swapFmtDate=d=>d?`${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`:'';
  const swapFmtPE=d=>d?`PE${String(d.getDate()).padStart(2,'0')}${String(d.getMonth()+1).padStart(2,'0')}${d.getFullYear()}`:'';
  const swapRosterRow=date=>date?rosterTimeline().get(localISO(date))?.row:null;
  const swapEffectiveCode=row=>row?.offlineShiftCode||row?.code||'';
  const swapTimes=(date,code)=>{const data=SHIFT_DATA[code],t=data?.times?.[date?PayCalc.dayGroup(date.getDay()):0]||['',''];return t};
  const swapCodesForDate=(date,line='')=>{
    const group=date?PayCalc.dayGroup(date.getDay()):null;
    return Object.keys(SHIFT_DATA).filter(code=>{
      const data=SHIFT_DATA[code]; if(!data||data.leaveType)return false;
      if(line&&code!=='SA'&&data.line!==line)return false;
      if(!group)return true;
      const t=data.times?.[group]||['','']; return Boolean(t[0]&&t[1]);
    }).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
  };
  const populateSwapShift=(select,date,line,preferred='')=>{
    if(!select)return;
    const codes=swapCodesForDate(date,line);
    const rosterCode=swapEffectiveCode(swapRosterRow(date));
    select.innerHTML=codes.map(code=>`<option value="${code}">${shiftOptionLabel(code)}</option>`).join('');
    const wanted=preferred&&codes.includes(preferred)?preferred:(rosterCode&&codes.includes(rosterCode)?rosterCode:(codes[0]||''));
    select.value=wanted;
    return wanted;
  };
  const fillSwapSide=(side,date)=>{
    const prefix=side==='request'?'swapRequest':'swapPartner';
    const row=side==='request'?swapRosterRow(date):null;
    const code=populateSwapShift($(`#${prefix}Shift`),date,side==='request'?current.settings.homeLine:'',$(`#${prefix}Shift`)?.value||'');
    const times=swapTimes(date,code);
    if($(`#${prefix}Start`))$(`#${prefix}Start`).value=times[0]||'';
    if($(`#${prefix}Finish`))$(`#${prefix}Finish`).value=times[1]||'';
    if(row&&side==='request'){
      const effective=swapEffectiveCode(row);
      if(effective)populateSwapShift($(`#${prefix}Shift`),date,current.settings.homeLine,effective);
      const t=swapTimes(date,effective);
      if($(`#${prefix}Start`))$(`#${prefix}Start`).value=row.start||t[0]||'';
      if($(`#${prefix}Finish`))$(`#${prefix}Finish`).value=row.finish||t[1]||'';
    }
  };
  const syncSwapTimes=()=>{
    const rd=swapDateValue('#swapRequestDate'),pd=swapDateValue('#swapPartnerDate');
    if(swapMode==='roster')return;
    if(rd)fillSwapSide('request',rd); if(pd)fillSwapSide('partner',pd);
  };
  function renderSwapCalendar(selectedKey=''){
    const wrap=$('#swapCalendar');if(!wrap)return;
    const entries=rosterTimeline(),today=startOfRosterDay(new Date()),focus=selectedKey?parseDate(selectedKey):calendarCursor;
    const first=new Date(focus.getFullYear(),focus.getMonth()-1,1),last=new Date(focus.getFullYear(),focus.getMonth()+2,0);
    wrap.innerHTML='';
    for(let monthDate=new Date(first);monthDate<=last;monthDate=new Date(monthDate.getFullYear(),monthDate.getMonth()+1,1)){
      const year=monthDate.getFullYear(),month=monthDate.getMonth(),section=document.createElement('section');section.className='calendar-month-block';
      const header=document.createElement('h3');header.className='calendar-scroll-month';header.textContent=monthDate.toLocaleDateString('en-AU',{month:'short',year:'numeric'});section.appendChild(header);
      const weekdays=document.createElement('div');weekdays.className='calendar-weekdays';weekdays.innerHTML='<span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span>';section.appendChild(weekdays);
      const grid=document.createElement('div');grid.className='calendar-grid';
      for(let i=0;i<monthDate.getDay();i++){const blank=document.createElement('div');blank.className='calendar-day blank';grid.appendChild(blank)}
      const days=new Date(year,month+1,0).getDate();
      for(let day=1;day<=days;day++){
        const date=new Date(year,month,day),key=localISO(date),entry=entries.get(key),row=entry?.row,period=actualShiftPeriod(entry,date),label=rosterDisplayCode(entry)||'';
        const periodClass=period==='Morn'||period==='Morning'?'shift-morn':period==='Arvo'?'shift-arvo':'shift-off';
        const b=document.createElement('button');b.type='button';b.dataset.key=key;b.className=`calendar-day actual ${periodClass} ${key===localISO(today)?'today':''} ${key===selectedKey?'selected':''}`;
        b.innerHTML=`${key===localISO(today)?'<span class="today-marker">TODAY</span>':''}<span class="calendar-date">${day}</span><strong>${label}</strong>`;
        b.onclick=()=>selectSwapDate(date);grid.appendChild(b);
      }
      section.appendChild(grid);wrap.appendChild(section);
    }
    // When the swap sheet opens (or a date is selected), keep the selected/today date in view.
    const focusKey=selectedKey||localISO(today);
    const focusButton=wrap.querySelector(`[data-key="${focusKey}"]`);
    if(focusButton){
      requestAnimationFrame(()=>focusButton.scrollIntoView({block:'center',inline:'nearest',behavior:'auto'}));
    }
  }
  function selectSwapDate(date){
    const key=localISO(date);calendarCursor=new Date(date.getFullYear(),date.getMonth(),1);renderSwapCalendar(key);
    if($('#swapRequestDate'))$('#swapRequestDate').value=key;
    if($('#swapPartnerDate'))$('#swapPartnerDate').value=key;
    fillSwapSide('request',date);fillSwapSide('partner',date);syncSwapMode();
  }
  const swapEntryCard=(index,date)=>`<div class="swap-entry-card" data-swap-index="${index}"><div class="swap-entry-head"><strong>Swap ${index+1}</strong><button type="button" class="ghost swap-remove-date" data-swap-index="${index}">Remove</button></div><label>Swap date<input class="swap-entry-date" data-swap-side="request" data-swap-index="${index}" type="date" value="${localISO(date)}"></label><div class="swap-entry-columns"><div><span class="eyebrow">Your shift</span><select class="swap-entry-shift" data-swap-side="request" data-swap-index="${index}"></select><div class="swap-time-grid"><label>Start<input class="swap-entry-start" data-swap-side="request" data-swap-index="${index}" type="time"></label><label>Finish<input class="swap-entry-finish" data-swap-side="request" data-swap-index="${index}" type="time"></label></div></div><div><span class="eyebrow">Replacement shift</span><select class="swap-entry-shift" data-swap-side="partner" data-swap-index="${index}"></select><div class="swap-time-grid"><label>Start<input class="swap-entry-start" data-swap-side="partner" data-swap-index="${index}" type="time"></label><label>Finish<input class="swap-entry-finish" data-swap-side="partner" data-swap-index="${index}" type="time"></label></div></div></div></div>`;
  function hydrateSwapEntry(card,index,date){
    const req=card.querySelector('[data-swap-side="request"].swap-entry-shift'),partner=card.querySelector('[data-swap-side="partner"].swap-entry-shift');
    const row=swapRosterRow(date),code=swapEffectiveCode(row);
    populateSwapShift(req,date,current.settings.homeLine,code);populateSwapShift(partner,date,'','');
    const rt=swapTimes(date,req.value),pt=swapTimes(date,partner.value);
    card.querySelector('[data-swap-side="request"].swap-entry-start').value=row?.start||rt[0]||'';card.querySelector('[data-swap-side="request"].swap-entry-finish').value=row?.finish||rt[1]||'';
    card.querySelector('[data-swap-side="partner"].swap-entry-start').value=pt[0]||'';card.querySelector('[data-swap-side="partner"].swap-entry-finish').value=pt[1]||'';
  }
  function renderSwapEntries(){
    const wrap=$('#swapMultiEntries');if(!wrap)return;wrap.innerHTML='';
    swapState.requestDates.forEach((date,i)=>{const holder=document.createElement('div');holder.innerHTML=swapEntryCard(i,date);const card=holder.firstElementChild;wrap.appendChild(card);hydrateSwapEntry(card,i,date);});
    $$('#swapMultiEntries .swap-remove-date').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.swapIndex);swapState.requestDates.splice(i,1);renderSwapEntries();});
    $$('#swapMultiEntries .swap-entry-date').forEach(input=>input.onchange=()=>{const i=Number(input.dataset.swapIndex),d=parseDate(input.value);if(d){swapState.requestDates[i]=d;renderSwapEntries();renderSwapCalendar(localISO(d));}});
    $$('#swapMultiEntries .swap-entry-shift').forEach(sel=>sel.onchange=()=>{const i=Number(sel.dataset.swapIndex),side=sel.dataset.swapSide,date=swapState.requestDates[i],t=swapTimes(date,sel.value);const card=sel.closest('.swap-entry-card');card.querySelector(`[data-swap-side="${side}"] .swap-entry-start`).value=t[0]||'';card.querySelector(`[data-swap-side="${side}"] .swap-entry-finish`).value=t[1]||'';});
  }
  const syncSwapMode=()=>{
    const roster=swapMode==='roster';
    $('#swapSingleFields')?.toggleAttribute('hidden',false);
    $('#swapRosterNote')?.toggleAttribute('hidden',!roster);
    $('#swapCalendarWrap')?.toggleAttribute('hidden',false);
    if(roster){
      const d=swapDateValue('#swapRequestDate')||new Date();
      const pe=swapFmtPE(d);
      $('#swapRequestShift').innerHTML=`<option value="${pe}">${pe}</option>`;
      $('#swapPartnerShift').innerHTML=`<option value="${pe}">${pe}</option>`;
      $('#swapRequestStart').value='';$('#swapRequestFinish').value='';
      $('#swapPartnerStart').value='';$('#swapPartnerFinish').value='';
    }else syncSwapTimes();
  };
  const openShiftSwap=()=>{
    const sheet=$('#shiftSwapSheet');if(!sheet)return;swapMode='single';swapState.requestDates=[];swapState.partnerDates=[];
    if($('#swapRequestingName'))$('#swapRequestingName').textContent=current.settings.employeeName||'—';if($('#swapRequestingService'))$('#swapRequestingService').textContent=`Service No: ${current.settings.serviceNumber||'—'}`;
    const today=new Date();const d=rosterTimeline().get(localISO(today))?.row?today:today;
    $('#swapRequestDate').value=localISO(d);$('#swapPartnerDate').value=localISO(d);$('#swapPartnerName').value='';$('#swapPartnerService').value='';$('#swapContingent').checked=false;$('#swapNeutralCost').checked=false;$('#swapOthers').value='';$('#swapOthersWrap').hidden=true;
    // Multi-day swap has been retired; remove any stale control left by an older cached HTML.
    $$('#shiftSwapSheet [data-swap-mode="multi"]').forEach(b=>b.remove());
    $$('#shiftSwapSheet .swap-mode').forEach(b=>{if(b.dataset.swapMode!=='single'&&b.dataset.swapMode!=='roster')b.remove()});
    $$('#shiftSwapSheet [data-swap-mode]').forEach(b=>b.classList.toggle('active',b.dataset.swapMode==='single'));renderSwapCalendar(localISO(d));fillSwapSide('request',d);fillSwapSide('partner',d);syncSwapMode();sheet.hidden=false;
  };
  const closeShiftSwap=()=>{if($('#shiftSwapSheet'))$('#shiftSwapSheet').hidden=true};
  const swapJpegPdf=pages=>{const enc=s=>new TextEncoder().encode(s),cat=(...a)=>{let n=a.reduce((x,b)=>x+b.length,0),o=new Uint8Array(n),p=0;for(const b of a){o.set(b,p);p+=b.length}return o};const objs=[null],offsets=[0];pages.forEach((pg,i)=>{const pageId=3+i*3,imgId=4+i*3,contentId=5+i*3;objs[pageId]=enc(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pg.width} ${pg.height}] /Resources << /XObject << /Im${i} ${imgId} 0 R >> >> /Contents ${contentId} 0 R >>`);objs[imgId]=cat(enc(`<< /Type /XObject /Subtype /Image /Width ${pg.width} /Height ${pg.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${pg.bytes.length} >>\nstream\n`),pg.bytes,enc('\nendstream'));const stream=`q\n${pg.width} 0 0 ${pg.height} 0 0 cm\n/Im${i} Do\nQ\n`;objs[contentId]=enc(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`)});const kids=pages.map((_,i)=>`${3+i*3} 0 R`).join(' ');objs[1]=enc('<< /Type /Catalog /Pages 2 0 R >>');objs[2]=enc(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);const chunks=[enc('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')];let off=chunks[0].length;for(let id=1;id<objs.length;id++){offsets[id]=off;const h=enc(`${id} 0 obj\n`),t=enc('\nendobj\n');chunks.push(h,objs[id],t);off+=h.length+objs[id].length+t.length}let x=`xref\n0 ${objs.length}\n0000000000 65535 f \n`;for(let id=1;id<objs.length;id++)x+=`${String(offsets[id]).padStart(10,'0')} 00000 n \n`;x+=`trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${off}\n%%EOF`;chunks.push(enc(x));return new Blob(chunks,{type:'application/pdf'});};
  const clearSwapValidation=()=>{$$('#shiftSwapSheet .swap-field-missing').forEach(el=>el.classList.remove('swap-field-missing'));};
  const markSwapMissing=el=>{if(el){el.classList.add('swap-field-missing');}};
  const validateShiftSwap=()=>{
    clearSwapValidation();
    const missing=[];
    const required=[
      ['#swapPartnerName',()=>String($('#swapPartnerName')?.value||'').trim()],
      ['#swapPartnerService',()=>String($('#swapPartnerService')?.value||'').trim()],
      ['#swapRequestDate',()=>$('#swapRequestDate')?.value],
      ['#swapPartnerDate',()=>$('#swapPartnerDate')?.value]
    ];
    required.forEach(([sel,get])=>{if(!get()){const el=$(sel);markSwapMissing(el);missing.push(el);}});
    if(swapMode!=='roster'){
      ['#swapRequestShift','#swapRequestStart','#swapRequestFinish','#swapPartnerShift','#swapPartnerStart','#swapPartnerFinish'].forEach(sel=>{const el=$(sel);if(!el?.value){markSwapMissing(el);missing.push(el);}});
    }
    if($('#swapContingent')?.checked&&!String($('#swapOthers')?.value||'').trim()){
      const el=$('#swapOthers');markSwapMissing(el);missing.push(el);
    }
    if(!missing.length)return true;
    const first=missing[0];first?.scrollIntoView({behavior:'smooth',block:'center'});first?.focus?.();
    toast('Please complete the highlighted fields');
    return false;
  };
  async function generateShiftSwap(){
    if(!validateShiftSwap())return;
    const reqName=String($('#swapRequestingName')?.textContent||'').trim();
    const reqService=String(current.settings.serviceNumber||'').trim();
    const partnerName=String($('#swapPartnerName')?.value||'').trim();
    const partnerService=String($('#swapPartnerService')?.value||'').trim();
    if(!reqName||!reqService){toast('Add your name and service number in Settings');return}
    if(!partnerName||!partnerService){toast('Enter the replacement employee details');return}

    let entries=[];
    if(swapMode==='multi'){
      if(!swapState.requestDates.length){toast('Add at least one swap date');return}
      const cards=$$('#swapMultiEntries .swap-entry-card');
      cards.forEach((card,i)=>{
        const date=swapState.requestDates[i];
        const rq=card.querySelector('[data-swap-side="request"].swap-entry-shift')?.value||'';
        const ps=card.querySelector('[data-swap-side="partner"].swap-entry-shift')?.value||'';
        entries.push({
          request:{date,shift:rq,start:card.querySelector('[data-swap-side="request"].swap-entry-start')?.value||'',finish:card.querySelector('[data-swap-side="request"].swap-entry-finish')?.value||''},
          partner:{date,shift:ps,start:card.querySelector('[data-swap-side="partner"].swap-entry-start')?.value||'',finish:card.querySelector('[data-swap-side="partner"].swap-entry-finish')?.value||''}
        });
      });
    }else{
      const rd=swapDateValue('#swapRequestDate'),pd=swapDateValue('#swapPartnerDate');
      if(!rd||!pd){toast('Select both dates');return}
      if(swapMode==='roster'){
        entries=[{request:{date:null,shift:swapFmtPE(rd),start:'',finish:''},partner:{date:null,shift:swapFmtPE(pd),start:'',finish:''}}];
      }else{
        entries=[{
          request:{date:rd,shift:$('#swapRequestShift').value,start:$('#swapRequestStart').value,finish:$('#swapRequestFinish').value},
          partner:{date:pd,shift:$('#swapPartnerShift').value,start:$('#swapPartnerStart').value,finish:$('#swapPartnerFinish').value}
        }];
      }
    }
    if(!entries.length){toast('Add a swap date');return}

    try{
      const template=await new Promise((res,rej)=>{
        const im=new Image();
        im.onload=()=>res(im);
        im.onerror=()=>rej(new Error('Template failed to load'));
        im.src='./shift-change-form-template.png';
      });

      const pages=[];
      entries.forEach(({request:a,partner:b})=>{
        const c=document.createElement('canvas');
        c.width=1241;c.height=1754;
        const ctx=c.getContext('2d');
        ctx.drawImage(template,0,0,c.width,c.height);

        // Keep the official form completely intact. Text is drawn on a
        // transparent overlay only; no white rectangles or clearing boxes.
        const overlay=document.createElement('canvas');
        overlay.width=c.width;overlay.height=c.height;
        const octx=overlay.getContext('2d');
        octx.textBaseline='middle';
        octx.fillStyle='#111';
        const drawValue=(x,y,v,size=25)=>{
          if(v===undefined||v===null||v==='')return;
          octx.font=`bold ${size}px Arial`;
          octx.fillText(String(v),x,y);
        };
        const fmtTime=v=>String(v||'').replace(':','');

        // REQUESTING EMPLOYEE
        // Left side = their rostered/original shift.
        // Right side = the shift they are requesting to work.
        drawValue(215,265,reqName,25);
        drawValue(790,265,reqService,25);
        drawValue(285,365,a.date?swapFmtDate(a.date):'',24);
        drawValue(830,365,b.date?swapFmtDate(b.date):'',24);
        drawValue(285,415,a.shift,25);
        drawValue(830,415,b.shift,25);
        drawValue(285,465,fmtTime(a.start),25);
        drawValue(830,465,fmtTime(b.start),25);
        drawValue(285,515,fmtTime(a.finish),25);
        drawValue(830,515,fmtTime(b.finish),25);

        // REPLACEMENT EMPLOYEE
        // Left side = their rostered/original shift.
        // Right side = the shift they are requesting to work.
        // Align replacement employee identity with the existing form name/service lines.
        drawValue(215,1178,partnerName,25);
        drawValue(790,1178,partnerService,25);
        drawValue(285,1275,b.date?swapFmtDate(b.date):'',24);
        drawValue(830,1275,a.date?swapFmtDate(a.date):'',24);
        drawValue(285,1320,b.shift,25);
        drawValue(830,1320,a.shift,25);
        drawValue(285,1370,fmtTime(b.start),25);
        drawValue(830,1370,fmtTime(a.start),25);
        drawValue(285,1420,fmtTime(b.finish),25);
        drawValue(830,1420,fmtTime(a.finish),25);

        // Checkbox marks: centre each tick inside the actual printed checkbox.
        const drawCheck=(x,y,size=24)=>{
          octx.font=`bold ${size}px Arial`;
          octx.textAlign='center';
          octx.textBaseline='middle';
          octx.fillStyle='#111';
          octx.fillText('✓',x,y);
          octx.textAlign='left';
        };
        if($('#swapContingent')?.checked)drawCheck(614,572,24);
        if($('#swapNeutralCost')?.checked)drawCheck(553,1019,24);

        // The official template contains Word-style placeholder text in the
        // two employee confirmation rows. Clear only those cells, leaving
        // every surrounding form line and label untouched.
        const clearCell=(x,y,w,h)=>{
          octx.fillStyle='#fff';
          octx.fillRect(x,y,w,h);
          octx.fillStyle='#111';
        };
        const drawCentered=(x,y,w,v,size=21)=>{
          if(v===undefined||v===null||v==='')return;
          octx.font=`bold ${size}px Arial`;
          octx.textAlign='center';
          octx.fillText(String(v),x+w/2,y);
          octx.textAlign='left';
        };
        const todayText=swapFmtDate(new Date());

        // The contingent-swap field contains a Word placeholder. Clear only
        // that placeholder area (not the label or surrounding form lines),
        // then place the entered name on top.
        clearCell(805,565,330,29);
        if($('#swapContingent')?.checked){
          const others=String($('#swapOthers')?.value||'').trim();
          if(others)drawValue(810,579,others,20);
        }

        // Requesting employee confirmation row.
        clearCell(124,1042,425,49);
        clearCell(556,1042,199,49);
        clearCell(759,1042,374,49);
        drawCentered(124,1071,425,reqName,20);
        drawCentered(556,1071,199,reqService,20);
        drawCentered(759,1071,374,todayText,20);

        // Replacement employee confirmation row.
        clearCell(124,1441,425,43);
        clearCell(556,1441,199,43);
        clearCell(759,1441,374,43);
        drawCentered(124,1469,425,partnerName,20);
        drawCentered(556,1469,199,partnerService,20);
        drawCentered(759,1469,374,todayText,20);

        // Flatten only the transparent text overlay onto the official form.
        ctx.drawImage(overlay,0,0);
        const jpeg=c.toDataURL('image/jpeg',.96);
        pages.push({
          width:c.width,
          height:c.height,
          bytes:Uint8Array.from(atob(jpeg.split(',')[1]),x=>x.charCodeAt(0))
        });
      });

      const blob=swapJpegPdf(pages),url=URL.createObjectURL(blob);
      const w=window.open(url,'_blank');
      if(!w){
        const a=document.createElement('a');
        a.href=url;
        a.download=`ShiftMate-Shift-Swap-${localISO(entries[0].request.date||new Date())}.pdf`;
        document.body.appendChild(a);a.click();a.remove();
      }
      setTimeout(()=>URL.revokeObjectURL(url),60000);
      toast(pages.length>1?`${pages.length} shift swap forms generated`:'Shift swap form generated');
    }catch(error){
      console.error(error);
      toast('Could not generate shift swap form');
    }
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
  $$('[data-go]').forEach(b=>b.onclick=()=>{if(typeof closeShiftSwap==='function')closeShiftSwap();go(b.dataset.go)});
  const calendarMonths=$('#calendarMonths');
  if(calendarMonths)calendarMonths.addEventListener('scroll',()=>{
    updateCalendarTodayButton();
    if(calendarExpanding)return;
    const nearBottom=calendarMonths.scrollTop+calendarMonths.clientHeight>calendarMonths.scrollHeight-260;
    const nearTop=calendarMonths.scrollTop<180;
    const earliest=earliestSavedActualDate(),focusMonth=new Date(calendarCursor.getFullYear(),calendarCursor.getMonth(),1);
    const earliestMonth=earliest?new Date(earliest.getFullYear(),earliest.getMonth(),1):focusMonth;
    if(!nearBottom&&!nearTop)return;
    if(nearTop){
      const desiredFirst=new Date(focusMonth.getFullYear(),focusMonth.getMonth()-calendarWindowPast,1);
      if(desiredFirst<=earliestMonth)return;
    }
    calendarExpanding=true;
    let loadingTimer=setTimeout(()=>showCalendarLoading(true),120);
    setTimeout(()=>{
      if(nearTop)calendarWindowPast+=6;else calendarWindowFuture+=6;
      renderCalendar('',nearTop?'prepend':'position');
      requestAnimationFrame(()=>{clearTimeout(loadingTimer);showCalendarLoading(false);calendarExpanding=false});
    },40);
  },{passive:true});
  
function installDismissibleSheets(){
  const sheets=[
    document.getElementById('leaveFormSheet'),
    document.getElementById('bookOffSheet'),
    document.getElementById('shareRosterSheet')
  ].filter(Boolean);

  const closeRosterDetails=()=>{
    document.querySelectorAll('#roster .roster-control-module.open').forEach(card=>card.classList.remove('open'));
  };

  const closeSheet=(sheet)=>{
    if(!sheet)return;
    if(sheet.id==='leaveFormSheet' && typeof closeLeaveFormSheet==='function'){closeLeaveFormSheet();return}
    if(sheet.id==='bookOffSheet' && typeof closeBookOffChoice==='function'){closeBookOffChoice();return}
    sheet.hidden=true;
  };

  // Explicit close controls.
  document.addEventListener('click',e=>{
    if(e.target.closest('#roster .roster-detail-close')){
      e.preventDefault(); e.stopPropagation(); closeRosterDetails(); return;
    }
    if(e.target.closest('#leaveFormCancel')){ e.preventDefault(); if(typeof closeLeaveFormSheet==='function')closeLeaveFormSheet(); return; }
    if(e.target.closest('#bookOffCancel')){ e.preventDefault(); if(typeof closeBookOffChoice==='function')closeBookOffChoice(); return; }
    if(e.target.closest('#shareRosterCancel')){ e.preventDefault(); const s=document.getElementById('shareRosterSheet'); if(s)s.hidden=true; return; }
  },true);

  // Tap outside.
  document.addEventListener('click',e=>{
    const detailBackdrop=e.target.closest?.('#roster .roster-detail-backdrop');
    if(detailBackdrop){ e.preventDefault(); closeRosterDetails(); return; }

    for(const sheet of sheets){
      if(!sheet.hidden && e.target===sheet){ closeSheet(sheet); return; }
    }
  });

  // Swipe down on sheet headers / sheet surface, but allow normal scrolling.
  const attachSwipe=(surface,closeFn)=>{
    if(!surface || surface.dataset.swipeDismissInstalled==='true')return;
    surface.dataset.swipeDismissInstalled='true';
    let startY=0,startX=0,tracking=false;
    surface.addEventListener('touchstart',e=>{
      if(e.touches.length!==1)return;
      startY=e.touches[0].clientY; startX=e.touches[0].clientX; tracking=true;
    },{passive:true});
    surface.addEventListener('touchend',e=>{
      if(!tracking)return;
      tracking=false;
      const t=e.changedTouches[0];
      const dy=t.clientY-startY, dx=Math.abs(t.clientX-startX);
      if(dy>85 && dx<60){
        const scroller=surface.closest('.share-sheet-card,.day-details')||surface;
        if((scroller.scrollTop||0)<=2) closeFn();
      }
    },{passive:true});
  };

  document.querySelectorAll('#roster .day-details').forEach(el=>attachSwipe(el,closeRosterDetails));
  sheets.forEach(sheet=>{
    const card=sheet.querySelector('.share-sheet-card')||sheet;
    attachSwipe(card,()=>closeSheet(sheet));
  });
}

const syncViewport=()=>{const vv=window.visualViewport;document.documentElement.style.setProperty('--app-vh',`${vv?.height||window.innerHeight}px`);const nav=document.querySelector('.bottom-nav');if(nav)document.documentElement.style.setProperty('--bottom-nav-h',`${Math.ceil(nav.getBoundingClientRect().height)}px`);requestAnimationFrame(()=>{if(nav){nav.style.bottom='0px';nav.style.left='0px';nav.style.right='0px'}sizeCalendarViewport()})};
  window.addEventListener('resize',syncViewport,{passive:true});window.addEventListener('orientationchange',syncViewport,{passive:true});window.addEventListener('pageshow',syncViewport,{passive:true});document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncViewport()});window.visualViewport?.addEventListener('resize',syncViewport,{passive:true});window.visualViewport?.addEventListener('scroll',syncViewport,{passive:true});installDismissibleSheets();
  installShiftDetailsPortal();
  requestAnimationFrame(()=>requestAnimationFrame(syncViewport));
  if($('#calendarOtCompare'))$('#calendarOtCompare').onclick=()=>{calendarOtCompareMode=!calendarOtCompareMode;if(!calendarOtCompareMode){calendarOtSelections.clear();$$('.calendar-day.ot-multi-selected').forEach(x=>x.classList.remove('ot-multi-selected'));hideCalendarPaySummary()}updateCalendarOtCompareButton()};
  $('#calendarTodayFloat').onclick=()=>{
    const target=$('#calendarMonths')?.querySelector(`[data-key="${localISO(new Date())}"]`);
    if(target)scrollCalendarToTarget(target,'smooth');
  };
  $('#shareRoster').onclick=()=>{$('#shareRosterSheet').hidden=false};
  $('#shareRosterCancel').onclick=()=>{$('#shareRosterSheet').hidden=true};
  if($('#homeGenerateSwap'))$('#homeGenerateSwap').onclick=openShiftSwap;
  if($('#shiftSwapCancel'))$('#shiftSwapCancel').onclick=closeShiftSwap;
  if($('#shiftSwapSheet'))$('#shiftSwapSheet').onclick=e=>{if(e.target===$('#shiftSwapSheet'))closeShiftSwap()};
  const shiftSwapSheet=$('#shiftSwapSheet'),shiftSwapCard=shiftSwapSheet?.querySelector('.shift-swap-card');
  if(shiftSwapCard){
    let swapDragStartY=0,swapDragY=0,swapDragStartedAt=0,swapDragging=false;
    shiftSwapCard.addEventListener('touchstart',e=>{
      if(shiftSwapSheet?.hidden||e.touches.length!==1)return;
      const touch=e.touches[0],rect=shiftSwapCard.getBoundingClientRect();
      if(touch.clientY-rect.top>92||e.target.closest('button,input,select,textarea'))return;
      swapDragStartY=touch.clientY;swapDragY=0;swapDragStartedAt=Date.now();swapDragging=true;
      shiftSwapCard.style.transition='none';
    },{passive:true});
    shiftSwapCard.addEventListener('touchmove',e=>{
      if(!swapDragging||e.touches.length!==1)return;
      swapDragY=Math.max(0,e.touches[0].clientY-swapDragStartY);
      shiftSwapCard.style.transform=`translateY(${Math.min(180,swapDragY)}px)`;
    },{passive:true});
    const finishSwapDrag=()=>{
      if(!swapDragging)return;
      const elapsed=Math.max(1,Date.now()-swapDragStartedAt),velocity=swapDragY/elapsed;
      swapDragging=false;shiftSwapCard.style.transition='transform .18s ease';
      if(swapDragY>=72||velocity>.55){
        shiftSwapCard.style.transform='translateY(110%)';
        setTimeout(()=>{closeShiftSwap();shiftSwapCard.style.transform='';shiftSwapCard.style.transition=''},160);
      }else{
        shiftSwapCard.style.transform='';
        setTimeout(()=>{shiftSwapCard.style.transition=''},190);
      }
    };
    shiftSwapCard.addEventListener('touchend',finishSwapDrag,{passive:true});
    shiftSwapCard.addEventListener('touchcancel',finishSwapDrag,{passive:true});
  }
  $$('#shiftSwapSheet [data-swap-mode]').forEach(b=>b.onclick=()=>{swapMode=b.dataset.swapMode;$$('#shiftSwapSheet [data-swap-mode]').forEach(x=>x.classList.toggle('active',x===b));syncSwapMode()});
  if($('#swapRequestDate'))$('#swapRequestDate').onchange=()=>{const d=swapDateValue('#swapRequestDate');if(d){renderSwapCalendar(localISO(d));fillSwapSide('request',d)}};
  if($('#swapPartnerDate'))$('#swapPartnerDate').onchange=()=>{const d=swapDateValue('#swapPartnerDate');if(d)fillSwapSide('partner',d)};
  if($('#swapRequestShift'))$('#swapRequestShift').onchange=syncSwapTimes;
  if($('#swapPartnerShift'))$('#swapPartnerShift').onchange=syncSwapTimes;
  if($('#swapContingent'))$('#swapContingent').onchange=e=>{if($('#swapOthersWrap'))$('#swapOthersWrap').hidden=!e.target.checked};
  ['#swapPartnerName','#swapPartnerService','#swapRequestDate','#swapPartnerDate','#swapRequestShift','#swapRequestStart','#swapRequestFinish','#swapPartnerShift','#swapPartnerStart','#swapPartnerFinish','#swapOthers'].forEach(sel=>{const el=$(sel);if(el)el.addEventListener('input',()=>el.classList.remove('swap-field-missing'));if(el)el.addEventListener('change',()=>el.classList.remove('swap-field-missing'));});
  if($('#generateShiftSwap'))$('#generateShiftSwap').onclick=()=>generateShiftSwap().catch(error=>{console.error(error);toast('Could not generate shift swap form')});

  const closeLeaveFormSheet=()=>{const sheet=$('#leaveFormSheet'),card=sheet?.querySelector('.leave-form-sheet-card');if(card){card.style.transform='';card.style.transition=''}if(sheet)sheet.hidden=true;pendingLeaveDocument=null};
  if($('#homeGenerateLeave'))$('#homeGenerateLeave').onclick=openLeaveFormFromHome;
  if($('#bookOffRosterAdjustment'))$('#bookOffRosterAdjustment').onclick=acceptRosterAdjustment;
  if($('#bookOffConfirm'))$('#bookOffConfirm').onclick=confirmBookOff;
  if($('#bookOffCancel'))$('#bookOffCancel').onclick=closeBookOffChoice;
  if($('#bookOffSheet'))$('#bookOffSheet').onclick=e=>{if(e.target===$('#bookOffSheet'))closeBookOffChoice()};
  if($('#leaveFormCancel'))$('#leaveFormCancel').onclick=closeLeaveFormSheet;
  if($('#leaveFormSheet'))$('#leaveFormSheet').onclick=e=>{if(e.target===$('#leaveFormSheet'))closeLeaveFormSheet()};
  const leaveSheet=$('#leaveFormSheet'),leaveSheetCard=leaveSheet?.querySelector('.leave-form-sheet-card');
  if(leaveSheetCard){
    let dragStartY=0,dragY=0,dragStartedAt=0,dragging=false;
    leaveSheetCard.addEventListener('touchstart',e=>{
      if(leaveSheet?.hidden||e.touches.length!==1)return;
      const touch=e.touches[0],rect=leaveSheetCard.getBoundingClientRect();
      if(touch.clientY-rect.top>92||e.target.closest('button,input,select,textarea'))return;
      dragStartY=touch.clientY;dragY=0;dragStartedAt=Date.now();dragging=true;
      leaveSheetCard.style.transition='none';
    },{passive:true});
    leaveSheetCard.addEventListener('touchmove',e=>{
      if(!dragging||e.touches.length!==1)return;
      dragY=Math.max(0,e.touches[0].clientY-dragStartY);
      leaveSheetCard.style.transform=`translateY(${Math.min(180,dragY)}px)`;
    },{passive:true});
    const finishLeaveDrag=()=>{
      if(!dragging)return;
      const elapsed=Math.max(1,Date.now()-dragStartedAt),velocity=dragY/elapsed;
      dragging=false;leaveSheetCard.style.transition='transform .18s ease';
      if(dragY>=72||velocity>.55){leaveSheetCard.style.transform='translateY(110%)';setTimeout(closeLeaveFormSheet,160)}
      else{leaveSheetCard.style.transform='';setTimeout(()=>{leaveSheetCard.style.transition=''},190)}
    };
    leaveSheetCard.addEventListener('touchend',finishLeaveDrag,{passive:true});
    leaveSheetCard.addEventListener('touchcancel',finishLeaveDrag,{passive:true});
  }
  if($('#generateLeaveDocument'))$('#generateLeaveDocument').onclick=()=>generateLeaveForm(pendingLeaveDocument);
  if($('#leaveFormStart'))$('#leaveFormStart').onchange=renderLeaveHoursFields;
  if($('#leaveFormEnd'))$('#leaveFormEnd').onchange=renderLeaveHoursFields;
  if($('#leaveFormType'))$('#leaveFormType').onchange=()=>{};
  $$('#shareRosterSheet [data-share-range]').forEach(b=>b.onclick=async()=>{const range=b.dataset.shareRange;$('#shareRosterSheet').hidden=true;await shareRoster(range)});
  $('#backToUpcomingPay').onclick=()=>{const upcoming=upcomingPayCycle();if(upcoming){selectedPayCycleId=upcoming.id;renderPayScreen()}};

  $('#startDate').onchange=()=>{current.startDate=$('#startDate').value;resolveAgreementSettings();buildRoster()};
  if($('#periodEndDate'))$('#periodEndDate').onchange=()=>{
    const endValue=$('#periodEndDate').value;
    if(!endValue)return;
    const end=parseDate(endValue),start=addRosterDays(end,-13);
    current.startDate=localISO(start);
    $('#startDate').value=current.startDate;
    resolveAgreementSettings();
    buildRoster();
  };
  if($('#homeStartDate'))$('#homeStartDate').onchange=()=>{current.startDate=$('#homeStartDate').value;buildRoster()};
  ['classification','homeLine','otTarget'].forEach(id=>{
    const el=$('#'+id);if(!el)return;
    el.addEventListener(el.type==='checkbox'?'change':'input',()=>{
      readSettingsFromForm();
      if(id==='homeLine'){
        // Blank/unentered cards belong to the selected Home line dynamically.
        // Do not rewrite manually entered actual shifts or their worked-line data.
        current.days.forEach(row=>{
          if(!Boolean(row.entered??row.code)){
            row.workedRosterLine='';
            row.offline=false;
          }
        });
        AppStorage.saveCurrent(current);
      }
      buildRoster();
    });
  });
  $('#rosterLineNumber').addEventListener('change',e=>{
    const profile=currentProjectionProfile();if(!profile)return;
    const selected=Number(e.target.value)||0;
    current.settings.rosterLineNumber=selected?Math.min(profile.lineCount,Math.max(1,selected)):0;
    current.settings.rosterLineAnchorDate=selected?localISO(projectionFortnightStartForProfile(new Date(),profile)):'';
    AppStorage.saveCurrent(current);buildRoster();
  });
  $('#clearRoster').onclick=()=>{if(confirm('Clear all shift codes for this fortnight?')){current.days=Array.from({length:14},emptyDay);buildRoster()}};
  $('#rosterSaveCycle').onclick=saveCycle;
  $('#rosterNewCycle').onclick=startNextFortnight;
  if($('#homeScanRoster'))$('#homeScanRoster').onclick=()=>openRosterScanner('current');
  if($('#rosterScanNextCycle'))$('#rosterScanNextCycle').onclick=()=>openRosterScanner('next');
  if($('#rosterScanCapture'))$('#rosterScanCapture').onclick=captureRosterScan;
  if($('#rosterScanCancel'))$('#rosterScanCancel').onclick=closeRosterScanner;
  if($('#rosterPeConfirm'))$('#rosterPeConfirm').onclick=applyPendingRosterScan;
  if($('#rosterPeRescan'))$('#rosterPeRescan').onclick=()=>{$('#rosterPeSheet').hidden=true;openRosterScanner(rosterScanMode)};
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
