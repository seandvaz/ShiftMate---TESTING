window.PTA_AGREEMENT = (() => {
  'use strict';

  const id='pta-artbiu-to-2023';
  const title='PTA / ARTBIU (Transit Officers) Industrial Agreement 2023';
  const expires='2026-10-06';

  const wageTables=[
    {effective:'2023-10-07',weekly:{TRAINEE:1206.00,TO1:1418.80,TO2:1450.90,TO3:1484.60,TO4:1520.20,TO5:1557.60,FCO:1572.80,STO1:1587.90,STO2:1618.50,STO3:1648.80}},
    {effective:'2024-10-07',weekly:{TRAINEE:1254.30,TO1:1475.60,TO2:1508.90,TO3:1544.00,TO4:1581.00,TO5:1619.90,FCO:1635.70,STO1:1651.40,STO2:1683.20,STO3:1714.80}},
    {effective:'2025-10-07',weekly:{TRAINEE:1298.10,TO1:1527.20,TO2:1561.70,TO3:1598.00,TO4:1636.30,TO5:1676.60,FCO:1692.90,STO1:1709.20,STO2:1742.10,STO3:1774.80}}
  ];

  const labels={TRAINEE:'Trainee',TO1:'TO1',TO2:'TO2',TO3:'TO3',TO4:'TO4',TO5:'TO5',FCO:'First Class Officer',STO1:'STO1',STO2:'STO2',STO3:'STO3'};
  const roleLabels={TRAINEE:'Trainee',TO:'Transit Officer',FCO:'First Class Officer',STO:'Senior Transit Officer'};
  const parse=s=>s?new Date(`${s}T00:00:00`):null;
  const completedYears=(from,to)=>{
    if(!from||!to||to<from)return 0;
    let years=to.getFullYear()-from.getFullYear();
    const anniversary=new Date(to.getFullYear(),from.getMonth(),from.getDate());
    if(to<anniversary)years--;
    return Math.max(0,years);
  };

  const tableFor=date=>{
    const d=typeof date==='string'?parse(date):new Date(date);
    return [...wageTables].reverse().find(t=>parse(t.effective)<=d)||wageTables[0];
  };

  const toLevelFor=(commencement,date)=>{
    const start=parse(commencement),target=typeof date==='string'?parse(date):new Date(date);
    if(!start||!target)return null;
    return `TO${Math.min(5,completedYears(start,target)+1)}`;
  };
  const stoLevelFor=(promotion,date)=>{
    const start=parse(promotion),target=typeof date==='string'?parse(date):new Date(date);
    if(!start||!target)return null;
    return `STO${Math.min(3,completedYears(start,target)+1)}`;
  };

  const profileClassification=(settings,date)=>{
    const target=typeof date==='string'?parse(date):new Date(date);
    const role=settings?.employmentRole||'STO';
    const fallback=settings?.classification||'STO3';
    if(!target)return {classification:fallback,source:'override fallback'};
    if(role==='TRAINEE')return {classification:'TRAINEE',source:'Trainee role'};

    const toLevel=()=>toLevelFor(settings?.toCommencementDate,target)||fallback;
    if(role==='TO'){
      if(!settings?.toCommencementDate)return {classification:fallback,source:'Missing TO commencement date'};
      return {classification:toLevel(),source:'TO commencement date'};
    }
    if(role==='FCO'){
      const appointment=parse(settings?.fcoAppointmentDate);
      if(appointment&&target>=appointment)return {classification:'FCO',source:'FCO appointment date'};
      if(!settings?.toCommencementDate)return {classification:fallback,source:'Missing employment dates'};
      return {classification:toLevel(),source:appointment?'Before FCO appointment':'Missing FCO appointment date'};
    }
    if(role==='STO'){
      const promotion=parse(settings?.stoPromotionDate);
      if(promotion&&target>=promotion)return {classification:stoLevelFor(settings.stoPromotionDate,target),source:'STO promotion date'};
      const previous=settings?.previousRoleBeforeSto||'FCO';
      if(previous==='FCO'){
        const fcoAppointment=parse(settings?.fcoAppointmentDate);
        if(fcoAppointment&&target>=fcoAppointment)return {classification:'FCO',source:'Previous FCO appointment'};
      }
      if(settings?.toCommencementDate)return {classification:toLevel(),source:promotion?'Before STO promotion':'Missing STO promotion date'};
      return {classification:fallback,source:'Missing employment dates'};
    }
    return {classification:fallback,source:'Classification fallback'};
  };

  const rateFor=(classification,date)=>{
    const table=tableFor(date),weekly=table.weekly[classification];
    return weekly==null?null:{weekly,hourly:weekly/40,effective:table.effective};
  };

  const resolve=(settings,date)=>{
    const manual=settings?.rateSource==='manual';
    const override=Boolean(settings?.classificationOverride);
    const profile=override
      ?{classification:settings?.classification||'STO3',source:'Manual classification override'}
      :profileClassification(settings,date);
    const classification=profile.classification;
    const agreementRate=rateFor(classification,date);
    const baseRate=manual?Number(settings?.manualBaseRate||settings?.baseRate||0):(agreementRate?.hourly||Number(settings?.manualBaseRate||settings?.baseRate||0));
    return {
      agreementId:id,title,expires,manual,override,classification,
      classificationLabel:labels[classification]||classification,
      roleLabel:roleLabels[settings?.employmentRole]||'',
      classificationSource:profile.source,
      baseRate,weeklyRate:agreementRate?.weekly||baseRate*40,
      wageEffective:agreementRate?.effective||'',
      rules:{weekday:1,saturday:1.5,sunday:2,weekdayOvertime:1.84,weekendOvertime:2,publicHolidayWorked:1.5,publicHolidayAdditionalMinimumHours:8,annualLeaveLoadingMinimum:0.20}
    };
  };

  return {id,title,expires,wageTables,labels,roleLabels,tableFor,rateFor,toLevelFor,stoLevelFor,profileClassification,resolve};
})();
