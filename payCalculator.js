window.PayCalc = (() => {
  const mins=t=>{const [h,m]=String(t||'00:00').split(':').map(Number);return h*60+m};
  const dayGroup=day=>day===0?'sun':day<=4?'monthu':day===5?'fri':'sat';
  const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const dateAt=(d,minutes)=>{const x=new Date(d);x.setHours(0,0,0,0);x.setMinutes(minutes);return x};
  const addDays=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x};
  const easterSunday=year=>{
    const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),month=Math.floor((h+l-7*m+114)/31),day=((h+l-7*m+114)%31)+1;
    return new Date(year,month-1,day);
  };
  const nthMonday=(year,month,n)=>{const d=new Date(year,month,1);d.setDate(1+((8-d.getDay())%7)+(n-1)*7);return d};
  const lastMonday=(year,month)=>{const d=new Date(year,month+1,0);d.setDate(d.getDate()-((d.getDay()+6)%7));return d};
  const observedFixed=(year,month,day,boxing=false)=>{
    const actual=new Date(year,month,day),dow=actual.getDay();
    if(boxing && (dow===0||dow===1)){const d=new Date(actual);d.setDate(actual.getDate()+(dow===0?2:1));return d}
    if(dow===6){const d=new Date(actual);d.setDate(actual.getDate()+2);return d}
    if(dow===0){const d=new Date(actual);d.setDate(actual.getDate()+1);return d}
    return actual;
  };
  const waPublicHolidays=(year,custom='')=>{
    const e=easterSunday(year);
    const entries=[
      [observedFixed(year,0,1),"New Year's Day"],
      [observedFixed(year,0,26),"Australia Day"],
      [nthMonday(year,2,1),'Labour Day'],
      [addDays(e,-2),'Good Friday'],[e,'Easter Sunday'],[addDays(e,1),'Easter Monday'],
      [observedFixed(year,3,25),'ANZAC Day'],
      [nthMonday(year,5,1),'Western Australia Day'],
      [lastMonday(year,8),"Sovereign's Birthday"],
      [observedFixed(year,11,25),'Christmas Day'],
      [observedFixed(year,11,26,true),'Boxing Day']
    ];
    const map=new Map(entries.map(([d,n])=>[iso(d),n]));
    String(custom||'').split(',').map(x=>x.trim()).filter(/^\d{4}-\d{2}-\d{2}$/.test.bind(/^\d{4}-\d{2}-\d{2}$/)).forEach(x=>map.set(x,'Proclaimed public holiday'));
    return map;
  };
  const holidayMapForRange=(start,custom)=>{
    const map=new Map();
    for(let y=start.getFullYear()-1;y<=start.getFullYear()+2;y++) waPublicHolidays(y,custom).forEach((v,k)=>map.set(k,v));
    return map;
  };
  const splitInterval=(date,startMin,durationMin)=>{
    const out=[];let cursor=dateAt(date,startMin),remaining=durationMin;
    while(remaining>0){const next=new Date(cursor);next.setHours(24,0,0,0);const chunk=Math.min(remaining,(next-cursor)/60000);out.push({date:new Date(cursor.getFullYear(),cursor.getMonth(),cursor.getDate()),minutes:chunk,start:new Date(cursor)});cursor=new Date(cursor.getTime()+chunk*60000);remaining-=chunk}
    return out;
  };
  const annualTax=income=>{if(income<=18200)return 0;let tax=0;if(income<=45000)tax=(income-18200)*.15;else if(income<=135000)tax=4020+(income-45000)*.30;else if(income<=190000)tax=31020+(income-135000)*.37;else tax=51370+(income-190000)*.45;return tax+income*.02};
  const qualifiesEarlyLate=(start,finish)=>{const s=mins(start),f=mins(finish);return (s>=61&&s<=239)||(f>=61&&f<=239)};
  const operationalShiftType=code=>{
    const c=String(code||'').trim().toUpperCase();
    if(/^\d+[AM]$/.test(c))return 'delta';
    if(/^[A-Z]+$/.test(c))return 'station';
    if(/^\d+/.test(c))return 'tango';
    return 'other';
  };
  const otMultiplierForDate=(date,settings)=>{
    const dow=date.getDay();
    return (dow===0||dow===6)?settings.weekendOtMult:settings.addHoursMult;
  };

  const designatedLineForRoster=line=>(window.DESIGNATED_LINE_BY_ROSTER||{})[line]||line;
  const lineAllowanceDistance=(homeRoster,workedRoster,stationCode)=>{
    if(!stationCode)return null;
    const home=designatedLineForRoster(homeRoster),worked=designatedLineForRoster(workedRoster);
    if(!home||!worked||home===worked)return 0;
    let matrixKey=home;
    if(home==='NORTHERN_MANDURAH')matrixKey=worked==='SOUTHERN_MANDURAH'?'NORTHERN_MANDURAH_AUBINGROVE':'NORTHERN_MANDURAH_BULLCREEK';
    const table=(window.LINE_ALLOWANCE_KM||{})[matrixKey];
    return table&&Object.prototype.hasOwnProperty.call(table,stationCode)?Number(table[stationCode]):null;
  };

  // Known payroll rates for the current Armadale operational roster.
  // These are date-effective because allowance/loading changes do not always
  // occur on the same date as the wage-table increase.
  const payrollRatesForDate=(date,settings)=>{
    const key=iso(date);
    const configuredLoading=Number(settings.annualLeaveLoadingRate)||0;
    if(key>='2026-05-22') return {maRate:4.87,nightRate:5.77,earlyLateRate:5.77,hdRate:4.87,annualLeaveLoadingRate:key>='2026-05-19'?12.5483:configuredLoading};
    if(key>='2026-05-19') return {maRate:4.66,nightRate:5.53,earlyLateRate:5.53,hdRate:4.66,annualLeaveLoadingRate:12.5483};
    if(key>='2025-10-07') return {maRate:4.66,nightRate:5.53,earlyLateRate:5.53,hdRate:4.66,annualLeaveLoadingRate:12.6188};
    return {maRate:4.48,nightRate:5.31,earlyLateRate:5.31,hdRate:4.48,annualLeaveLoadingRate:configuredLoading||11.6045};
  };

  const calculate=({days,startDate,settings})=>{
    const start=new Date(startDate+'T00:00:00');
    const holidays=holidayMapForRange(start,settings.customPublicHolidays);
    let gross=0,hours=0;const dayTotals=[];
    const breakdown={workedPay:0,annualLeavePay:0,sickLeavePay:0,lslPay:0,lwopPay:0,extrasPay:0,additionalHoursPay:0,publicHolidayPay:0};
    const allowanceDetails=[],publicHolidayDetails=[],phBuckets=new Map();
    const rows=[];

    days.forEach((row,i)=>{
      const date=addDays(start,i),data=window.SHIFT_DATA[row.code];let st=row.start,fn=row.finish;
      if(data&&(!st||!fn))[st,fn]=data.times[dayGroup(date.getDay())];
      const duration=data&&st&&fn?((mins(fn)-mins(st)+1440)%1440||1440):0;
      rows.push({row,i,date,data,st,fn,duration});
    });

    const addPhWork=(segment,rowInfo,isAdditional,effectiveBase)=>{
      const key=iso(segment.date),holiday=holidays.get(key);if(!holiday)return false;
      const bucket=phBuckets.get(key)||{date:key,name:holiday,hours:0,cashHours:0,lieuHours:0,items:[]};
      const h=segment.minutes/60,benefit=rowInfo.row.phBenefit||'lieu';bucket.hours+=h;
      if(benefit==='lieu')bucket.lieuHours+=h;else bucket.cashHours+=h;
      bucket.items.push({dayIndex:rowInfo.i,code:rowInfo.row.code,hours:h,benefit,isAdditional,effectiveBase});phBuckets.set(key,bucket);return true;
    };

    rows.forEach(info=>{
      const {row,i,date,data,st,fn,duration}=info;let dayGross=0,dayHours=0,baseComponent=0,extras=0,additionalPay=0;
      const dayHoliday=holidays.get(iso(date));
      if(data&&data.leaveType){
        const defaultLeaveHours=duration/60;
        const leaveHours=row.leaveHours===''||row.leaveHours==null?defaultLeaveHours:Math.max(0,Number(row.leaveHours)||0);
        if(dayHoliday&&data.leaveType!=='lsl'&&data.leaveType!=='lwop'){
          const amount=8*settings.baseRate;dayGross+=amount;dayHours+=8;breakdown.publicHolidayPay+=amount;
          publicHolidayDetails.push({date:iso(date),name:dayHoliday,type:'Public holiday during paid leave',hours:8,amount,dayIndex:i});
        }else if(data.leaveType==='annual'){
          const effectiveRates=payrollRatesForDate(date,settings);
          const effectiveLoading=Math.max(effectiveRates.annualLeaveLoadingRate,settings.baseRate*.20);
          const amount=leaveHours*(settings.baseRate+effectiveLoading);dayGross+=amount;dayHours+=leaveHours;breakdown.annualLeavePay+=amount;
        }else if(data.leaveType==='sick'){
          // Mixed leave fields are additive: leaveHours is personal leave; annualLeaveHours is extra annual leave.
          const sickPart=Math.max(0,leaveHours);
          const annualPart=Math.max(0,Number(row.annualLeaveHours)||0);
          const sickAmount=sickPart*settings.baseRate;
          dayGross+=sickAmount;dayHours+=sickPart;breakdown.sickLeavePay+=sickAmount;
          if(annualPart>0){
            const effectiveRates=payrollRatesForDate(date,settings);
            const effectiveLoading=Math.max(effectiveRates.annualLeaveLoadingRate,settings.baseRate*.20);
            const annualAmount=annualPart*(settings.baseRate+effectiveLoading);
            dayGross+=annualAmount;dayHours+=annualPart;breakdown.annualLeavePay+=annualAmount;
          }
        }else if(data.leaveType==='lsl'){
          const amount=leaveHours*settings.baseRate;dayGross+=amount;dayHours+=leaveHours;breakdown.lslPay+=amount;
        }else breakdown.lwopPay+=0;
      }else if(data&&st&&fn&&row.type!=='Off'){
        const effectiveBase=settings.baseRate+(row.hd?payrollRatesForDate(date,settings).hdRate:0);
        const actualStartMin=mins(st);
        const actualDuration=duration;
        const actualFinishAbs=actualStartMin+actualDuration;

        if(row.type==='Picked-up OT'){
          splitInterval(date,actualStartMin,actualDuration).forEach(seg=>{
            const h=seg.minutes/60;dayHours+=h;
            if(addPhWork(seg,info,true,effectiveBase))return;
            const mult=otMultiplierForDate(seg.date,settings);
            const amount=h*effectiveBase*mult;additionalPay+=amount;dayGross+=amount;
          });
          breakdown.additionalHoursPay+=additionalPay;
        }else{
          const nominal=data.times[dayGroup(date.getDay())]||[st,fn];
          const nominalStartMin=mins(nominal[0]);
          const nominalDuration=((mins(nominal[1])-nominalStartMin+1440)%1440||1440);
          const nominalFinishAbs=nominalStartMin+nominalDuration;

          // Backward compatibility with 1.0.3/manual OT values:
          // use them only when the actual entered time hasn't already moved beyond the rostered boundary.
          let effectiveActualStart=actualStartMin;
          let effectiveActualFinish=actualFinishAbs;
          const legacyEarly=Math.max(0,Number(row.earlyStartHours)||0)*60;
          const legacyExt=Math.max(0,Number(row.additionalHours)||0)*60;
          if(legacyEarly>0&&effectiveActualStart>=nominalStartMin)effectiveActualStart-=legacyEarly;
          if(legacyExt>0&&effectiveActualFinish<=nominalFinishAbs)effectiveActualFinish+=legacyExt;

          // Align an after-midnight actual start with the logical roster day.
          if(effectiveActualStart<nominalStartMin-720){
            effectiveActualStart+=1440;
            effectiveActualFinish+=1440;
          }

          const ordinaryStart=Math.max(effectiveActualStart,nominalStartMin);
          const ordinaryFinish=Math.min(effectiveActualFinish,nominalFinishAbs);
          let nonPhHours=0,allowanceHours=0;

          if(ordinaryFinish>ordinaryStart){
            const shiftType=operationalShiftType(row.code);
            const hasBuiltInForcedOt=(date.getDay()===5||date.getDay()===6) && (shiftType==='station'||shiftType==='delta');
            const forcedStart=hasBuiltInForcedOt?Math.max(nominalStartMin,nominalFinishAbs-60):nominalFinishAbs;
            const regularFinish=Math.min(ordinaryFinish,forcedStart);

            if(regularFinish>ordinaryStart){
              splitInterval(date,ordinaryStart,regularFinish-ordinaryStart).forEach(seg=>{
                const h=seg.minutes/60;dayHours+=h;
                if(addPhWork(seg,info,false,effectiveBase))return;
                nonPhHours+=h;
                const dow=seg.date.getDay();if(dow>=1&&dow<=5)allowanceHours+=h;
                const mult=dow===6?settings.satMult:dow===0?settings.sunMult:settings.wdMult;
                const amount=h*effectiveBase*mult;baseComponent+=amount;dayGross+=amount;
              });
            }

            const forcedActualStart=Math.max(ordinaryStart,forcedStart);
            if(hasBuiltInForcedOt && ordinaryFinish>forcedActualStart){
              splitInterval(date,forcedActualStart,ordinaryFinish-forcedActualStart).forEach(seg=>{
                const h=seg.minutes/60;dayHours+=h;
                if(addPhWork(seg,info,true,effectiveBase))return;
                const amount=h*effectiveBase*otMultiplierForDate(seg.date,settings);
                additionalPay+=amount;dayGross+=amount;
              });
            }
            breakdown.workedPay+=baseComponent;
          }

          // Time before the rostered start is OT/additional hours.
          const earlyFinish=Math.min(effectiveActualFinish,nominalStartMin);
          if(effectiveActualStart<earlyFinish){
            splitInterval(date,effectiveActualStart,earlyFinish-effectiveActualStart).forEach(seg=>{
              const h=seg.minutes/60;dayHours+=h;
              if(addPhWork(seg,info,true,effectiveBase))return;
              const mult=otMultiplierForDate(seg.date,settings);
              const amount=h*effectiveBase*mult;additionalPay+=amount;dayGross+=amount;
            });
          }

          // Time after the rostered finish is OT/additional hours.
          const extStart=Math.max(nominalFinishAbs,effectiveActualStart);
          if(effectiveActualFinish>extStart){
            splitInterval(date,extStart,effectiveActualFinish-extStart).forEach(seg=>{
              const h=seg.minutes/60;dayHours+=h;
              if(addPhWork(seg,info,true,effectiveBase))return;
              const mult=otMultiplierForDate(seg.date,settings);
              const amount=h*effectiveBase*mult;additionalPay+=amount;dayGross+=amount;
            });
          }
          breakdown.additionalHoursPay+=additionalPay;

          if(nonPhHours>0){
            if(data.allowance==='Morn/Aft'&&allowanceHours>0){
              const payableAllowanceHours=Math.ceil(allowanceHours-1e-9);
              const amount=payableAllowanceHours*payrollRatesForDate(date,settings).maRate;extras+=amount;allowanceDetails.push({type:(mins(nominal[0])<12*60?'Morning allowance':'Afternoon allowance'),date:iso(date),dayIndex:i,code:row.code,hours:payableAllowanceHours,amount});
            }
            if(data.allowance==='Night'&&allowanceHours>0){
              const amount=allowanceHours*payrollRatesForDate(date,settings).nightRate;extras+=amount;allowanceDetails.push({type:'Night allowance',date:iso(date),dayIndex:i,code:row.code,hours:allowanceHours,amount});
            }
            const finishDate=addDays(date,mins(nominal[1])<=mins(nominal[0])?1:0);
            const rosterStartIsWeekday=date.getDay()>=1&&date.getDay()<=5;
            const qualifyingEndpoint=rosterStartIsWeekday&&((mins(nominal[0])>=61&&mins(nominal[0])<=239)||(mins(nominal[1])>=61&&mins(nominal[1])<=239&&finishDate.getDay()>=1&&finishDate.getDay()<=5));
            if(qualifyingEndpoint){
              const amount=payrollRatesForDate(date,settings).earlyLateRate;extras+=amount;allowanceDetails.push({type:'Early/late shift allowance',date:iso(date),dayIndex:i,code:row.code,hours:1,amount});
            }
            dayGross+=extras;breakdown.extrasPay+=extras;
          }
        }

        // Other Line Allowance applies to both ordinary and Picked-up OT shifts.
        // The mutually exchanged / cost-neutral case is the explicit exception.
        const explicitOffline=Boolean(row.offlineShiftCode);
        const workedRoster=(explicitOffline&&(!row.workedRosterLine||row.workedRosterLine===settings.homeLine))
          ? data.line
          : (row.workedRosterLine||data.line);
        const isOffline=Boolean(explicitOffline||row.offline||(workedRoster&&workedRoster!==settings.homeLine));
        if(isOffline&&row.offlineReason!=='cost-neutral'&&data.line!=='LEAVE'){
          const homeDesignated=designatedLineForRoster(settings.homeLine);
          const workedDesignated=designatedLineForRoster(workedRoster);
          if(homeDesignated&&workedDesignated&&homeDesignated!==workedDesignated){
            const distance=lineAllowanceDistance(settings.homeLine,workedRoster,data.stationCode);
            if(distance!=null){
              const travelPay=settings.baseRate;
              const mileage=distance*.895;
              const amount=travelPay+mileage;
              extras+=amount;
              dayGross+=amount;
              breakdown.extrasPay+=amount;
              allowanceDetails.push({type:'Other line allowance',date:iso(date),dayIndex:i,code:row.code,hours:1,amount,travelPay,mileage,distance,distanceMissing:false,workedRosterLine:workedRoster});
            }
          }
        }
      }else if(!data&&dayHoliday){
        const amount=8*settings.baseRate;dayGross+=amount;dayHours+=8;breakdown.publicHolidayPay+=amount;
        publicHolidayDetails.push({date:iso(date),name:dayHoliday,type:'Public holiday not worked',hours:8,amount,dayIndex:i});
      }

      rows[i].prePhGross=dayGross;rows[i].dayHours=dayHours;rows[i].additionalPay=additionalPay;
    });

    phBuckets.forEach(bucket=>{
      const cashItems=bucket.items.filter(x=>x.benefit!=='lieu'),lieuItems=bucket.items.filter(x=>x.benefit==='lieu');
      let amount=0,leaveCredit=0;
      if(cashItems.length){
        const workedComponent=cashItems.reduce((s,x)=>s+x.hours*x.effectiveBase*1.5,0);
        const cashHours=cashItems.reduce((s,x)=>s+x.hours,0),base= cashItems[0].effectiveBase;
        const additionalComponent=Math.max(cashHours,8)*base;amount+=workedComponent+additionalComponent;
      }
      if(lieuItems.length){
        amount+=lieuItems.reduce((s,x)=>s+x.hours*x.effectiveBase*1.5,0);leaveCredit=Math.max(lieuItems.reduce((s,x)=>s+x.hours,0),8);
      }
      breakdown.publicHolidayPay+=amount;
      publicHolidayDetails.push({date:bucket.date,name:bucket.name,type:leaveCredit?'Worked – leave in lieu':'Worked – cash payment',hours:bucket.hours,amount,leaveCredit});
      const shares=bucket.items.reduce((m,x)=>(m[x.dayIndex]=(m[x.dayIndex]||0)+x.hours,m),{}),total=bucket.hours||1;
      Object.entries(shares).forEach(([idx,h])=>{rows[idx].prePhGross+=amount*(h/total)});
    });

    rows.forEach((info,i)=>{const dayGross=info.prePhGross||0;gross+=dayGross;hours+=info.dayHours||0;dayTotals.push({gross:dayGross,hours:info.dayHours||0,start:info.st||'',finish:info.fn||'',additionalPay:info.additionalPay||0,holidayName:holidays.get(iso(info.date))||''})});
    const taxable=Math.max(0,gross-settings.lease-settings.gesb),tax=taxable?Math.max(0,Math.round(annualTax(taxable*26)/26+settings.extraTax)):0,net=taxable-tax-settings.postTax;
    return {gross,taxable,tax,hours,net,netHourly:hours?net/hours:0,dayTotals,breakdown,allowanceDetails,publicHolidayDetails};
  };
  return {calculate,dayGroup,waPublicHolidays};
})();
