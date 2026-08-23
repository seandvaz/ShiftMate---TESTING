
window.AppStorage = (() => {
  const CURRENT='ptaV2Current';
  const CYCLES='ptaV2Cycles';
  const loadJSON=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||'')||fallback}catch{return fallback}};
  return {
    loadCurrent:()=>loadJSON(CURRENT,null),
    saveCurrent:data=>localStorage.setItem(CURRENT,JSON.stringify(data)),
    loadCycles:()=>loadJSON(CYCLES,[]),
    saveCycles:data=>localStorage.setItem(CYCLES,JSON.stringify(data)),
    clearAll:()=>{localStorage.removeItem(CURRENT);localStorage.removeItem(CYCLES)}
  };
})();
