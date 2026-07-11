/* matches-common.js — قاموس الفِرق/المسابقات + أدوات عرض المباريات (مشترك: index + matches) */
window.COMP_AR = {
  WC:'كأس العالم',CL:'دوري أبطال أوروبا',PL:'الدوري الإنجليزي',
  PD:'الدوري الإسباني',BL1:'الدوري الألماني',SA:'الدوري الإيطالي',
  FL1:'الدوري الفرنسي',EC:'بطولة أوروبا',CLI:'كوبا ليبرتادوريس',
  DED:'الدوري الهولندي',PPL:'الدوري البرتغالي',BSA:'الدوري البرازيلي',ELC:'دوري الدرجة الثانية'
};
window.STATUS_LIVE = {IN_PLAY:1,PAUSED:1,EXTRA_TIME:1,PENALTY_SHOOTOUT:1};
window.STATUS_DONE = {FINISHED:1};

/* ── Arabic team names ── */
window.TEAMS_AR = {
  /* Premier League */
  'Arsenal':'أرسنال','Chelsea':'تشيلسي','Liverpool':'ليفربول',
  'Man United':'مانشستر يونايتد','Manchester United':'مانشستر يونايتد','Man. United':'مانشستر يونايتد',
  'Man City':'مانشستر سيتي','Manchester City':'مانشستر سيتي','Man. City':'مانشستر سيتي',
  'Tottenham':'توتنهام','Tottenham Hotspur':'توتنهام',
  'Newcastle':'نيوكاسل','Newcastle United':'نيوكاسل يونايتد',
  'Aston Villa':'أستون فيلا','West Ham':'وست هام','West Ham United':'وست هام يونايتد',
  'Brighton':'برايتون','Everton':'إيفرتون','Brentford':'برينتفورد',
  'Fulham':'فولهام','Wolves':'وولفرهامبتون','Wolverhampton':'وولفرهامبتون',
  'Crystal Palace':'كريستال بالاس','Leicester':'ليستر سيتي','Leicester City':'ليستر سيتي',
  'Nottm Forest':'نوتينغهام فورست','Nottingham Forest':'نوتينغهام فورست',
  'Bournemouth':'بورنموث','Southampton':'ساوثهامبتون','Ipswich':'إبسويتش',
  'Luton':'لوتون','Burnley':'بيرنلي','Sheffield Utd':'شيفيلد يونايتد',
  'Sheffield United':'شيفيلد يونايتد','Sunderland':'سندرلاند','Coventry':'كوفنتري',
  'Middlesbrough':'ميدلزبره','Stoke':'ستوك','Millwall':'ميلوول',
  /* La Liga */
  'Real Madrid':'ريال مدريد','Barcelona':'برشلونة','Atletico Madrid':'أتلتيكو مدريد',
  'Sevilla':'إشبيلية','Valencia':'فالنسيا','Villarreal':'فياريال',
  'Real Sociedad':'ريال سوسيداد','Athletic Club':'أتلتيك بلباو',
  'Real Betis':'ريال بيتيس','Betis':'ريال بيتيس','Osasuna':'أوساسونا',
  'Getafe':'خيتافي','Celta Vigo':'سيلتا فيغو','Girona':'جيرونا',
  'Las Palmas':'لاس بالماس','Mallorca':'ماليوركا','Rayo Vallecano':'رايو فاليكانو',
  'Alaves':'ألافيس','Leganes':'ليغانيس','Valladolid':'بياداليد',
  'Espanyol':'إسبانيول','Cadiz':'قادس','Granada':'غرناطة','Almeria':'ألميريا',
  /* Bundesliga */
  'Bayern Munich':'بايرن ميونخ','Bayern':'بايرن ميونخ',
  'Dortmund':'بوروسيا دورتموند','Borussia Dortmund':'بوروسيا دورتموند',
  'RB Leipzig':'لايبزيغ','Leipzig':'لايبزيغ',
  'Leverkusen':'باير ليفركوزن','Bayer Leverkusen':'باير ليفركوزن',
  'Frankfurt':'فرانكفورت','Eintracht Frankfurt':'آينتراخت فرانكفورت',
  'Stuttgart':'شتوتغارت','Wolfsburg':'فولفسبورغ',
  'Gladbach':'مونشنغلادباخ','Mönchengladbach':'مونشنغلادباخ',
  'Union Berlin':'يونيون برلين','Werder Bremen':'فيردر بريمن',
  'Mainz':'ماينز','Augsburg':'أوغسبورغ','Hoffenheim':'هوفنهايم',
  'Freiburg':'فرايبورغ','Heidenheim':'هايدنهايم','Bochum':'بوخوم',
  'Holstein Kiel':'هولشتاين كيل','St. Pauli':'سانت باولي',
  /* Serie A */
  'Juventus':'يوفنتوس','Inter':'إنتر ميلان','Inter Milan':'إنتر ميلان',
  'Milan':'ميلان','AC Milan':'ميلان','Napoli':'نابولي','Roma':'روما',
  'Lazio':'لاتسيو','Atalanta':'أتالانتا','Fiorentina':'فيورنتينا',
  'Bologna':'بولونيا','Torino':'تورينو','Udinese':'أودينيزي',
  'Genoa':'جنوى','Verona':'فيرونا','Lecce':'ليتشي','Como':'كومو',
  'Parma':'بارما','Monza':'مونزا','Empoli':'إمبولي',
  'Venezia':'فينيسيا','Cagliari':'كالياري','Salernitana':'ساليرنيتانا',
  /* Ligue 1 */
  'Paris SG':'باريس سان جيرمان','PSG':'باريس سان جيرمان',
  'Paris Saint-Germain':'باريس سان جيرمان',
  'Marseille':'مارسيليا','Lyon':'أولمبيك ليون','Monaco':'موناكو',
  'Lens':'آر سي لانس','Lille':'ليل','Nice':'نيس','Rennes':'رين',
  'Strasbourg':'ستراسبورغ','Nantes':'نانت','Toulouse':'تولوز',
  'Reims':'ريمس','Montpellier':'مونبلييه','Brest':'بريست',
  'Le Havre':'لوهافر','Saint-Étienne':'سانت إتيان','Auxerre':'أوكسير','Angers':'أنجيه',
  /* Eredivisie */
  'Ajax':'أياكس','PSV':'بي إس في','Feyenoord':'فيينورد',
  'AZ':'إي زد ألكمار','Utrecht':'أوتريخت','Twente':'توينتي',
  'Vitesse':'فيتيسه','Groningen':'خرونينخن',
  /* Portugal */
  'Benfica':'بنفيكا','Porto':'بورتو','Sporting CP':'سبورتينغ',
  'Braga':'سبورتينغ براغا','Vitoria Guimaraes':'فيتوريا جيماريش',
  /* Champions League / Europa extras */
  'Celtic':'سيلتيك','Rangers':'رينجرز',
  'Galatasaray':'غلطة سراي','Fenerbahçe':'فنربهتشه','Besiktas':'بيشكتاش',
  'Shakhtar':'شاختار دونيتسك','Shakhtar Donetsk':'شاختار دونيتسك',
  'Dynamo Kyiv':'دينامو كييف',
  'Red Bull Salzburg':'سالزبورغ','Salzburg':'سالزبورغ',
  'Club Brugge':'كلوب بروج','Anderlecht':'أندرلخت',
  'Copenhagen':'كوبنهاغن','Midtjylland':'ميدتييلاند',
  'Young Boys':'يونغ بويز','Basel':'بازل',
  'Slavia Prague':'سلافيا براغ','Sparta Prague':'سبارتا براغ',
  'Viktoria Plzen':'فيكتوريا بلزن','Olympiacos':'أولمبياكوس',
  'Panathinaikos':'باناثينايكوس','PAOK':'باوك',
  'Red Star Belgrade':'النجم الأحمر','Partizan':'بارتيزان',
  'Legia Warsaw':'ليجيا وارسو','Lazio':'لاتسيو',
  /* Libertadores */
  'Flamengo':'فلامنجو','Palmeiras':'بالميراس','Fluminense':'فلومينينسي',
  'Boca Juniors':'بوكا جونيورز','River Plate':'ريفر بليت',
  'Atletico Mineiro':'أتلتيكو مينيرو','Gremio':'غريميو','Santos':'سانتوس',
  'Peñarol':'بينيارول','Nacional':'ناسيونال','LDU Quito':'إل دي يو كيتو',
  'Colo-Colo':'كولو كولو','Universidad de Chile':'جامعة تشيلي',
  /* Saudi Pro League */
  'Al Hilal':'الهلال','Al Nassr':'النصر','Al Ittihad':'الاتحاد',
  'Al Ahli':'الأهلي','Al Shabab':'الشباب','Al Qadsiah':'القادسية',
  'Al Faisaly':'الفيصلي','Al Ettifaq':'الاتفاق','Al Hazm':'الحزم',
  'Al Wehda':'الوحدة','Al Fateh':'الفتح','Damac':'ضمك',
  'Al Taawoun':'التعاون','Al Riyadh':'الرياض','Al Khaleej':'الخليج',
  'Al Okhdood':'الأخدود','Al Qadisiyah':'القادسية',
};
/* ── National teams ── */
(function(){var t=window.TEAMS_AR;
  /* Europe */
  t['England']='إنجلترا';t['France']='فرنسا';t['Spain']='إسبانيا';
  t['Germany']='ألمانيا';t['Italy']='إيطاليا';t['Portugal']='البرتغال';
  t['Netherlands']='هولندا';t['Belgium']='بلجيكا';t['Croatia']='كرواتيا';
  t['Denmark']='الدنمارك';t['Sweden']='السويد';t['Norway']='النرويج';
  t['Switzerland']='سويسرا';t['Austria']='النمسا';t['Poland']='بولندا';
  t['Czech Republic']='التشيك';t['Czechia']='التشيك';t['Hungary']='المجر';
  t['Slovakia']='سلوفاكيا';t['Romania']='رومانيا';t['Serbia']='صربيا';
  t['Turkey']='تركيا';t['Greece']='اليونان';t['Ukraine']='أوكرانيا';
  t['Russia']='روسيا';t['Scotland']='اسكتلندا';t['Wales']='ويلز';
  t['Ireland']='أيرلندا';t['Northern Ireland']='أيرلندا الشمالية';
  t['Finland']='فنلندا';t['Iceland']='آيسلندا';t['Albania']='ألبانيا';
  t['Slovenia']='سلوفينيا';t['Bosnia and Herzegovina']='البوسنة والهرسك';
  t['Kosovo']='كوسوفو';t['North Macedonia']='مقدونيا الشمالية';
  t['Montenegro']='الجبل الأسود';t['Bulgaria']='بلغاريا';
  t['Moldova']='مولدوفا';t['Belarus']='بيلاروسيا';
  t['Lithuania']='ليتوانيا';t['Latvia']='لاتفيا';t['Estonia']='إستونيا';
  t['Luxembourg']='لوكسمبورغ';t['Malta']='مالطا';t['Cyprus']='قبرص';
  t['Georgia']='جورجيا';t['Armenia']='أرمينيا';t['Azerbaijan']='أذربيجان';
  t['Kazakhstan']='كازاخستان';t['Gibraltar']='جبل طارق';
  /* Americas */
  t['Brazil']='البرازيل';t['Argentina']='الأرجنتين';t['Uruguay']='أوروغواي';
  t['Colombia']='كولومبيا';t['Chile']='تشيلي';t['Ecuador']='الإكوادور';
  t['Peru']='بيرو';t['Venezuela']='فنزويلا';t['Paraguay']='باراغواي';
  t['Bolivia']='بوليفيا';t['Mexico']='المكسيك';t['United States']='الولايات المتحدة';
  t['USA']='الولايات المتحدة';t['Canada']='كندا';t['Costa Rica']='كوستاريكا';
  t['Panama']='بنما';t['Honduras']='هندوراس';t['Jamaica']='جامايكا';
  t['Trinidad and Tobago']='ترينيداد وتوباغو';t['Haiti']='هايتي';
  t['El Salvador']='السلفادور';t['Guatemala']='غواتيمالا';
  /* Asia */
  t['Saudi Arabia']='السعودية';t['Japan']='اليابان';t['South Korea']='كوريا الجنوبية';
  t['Korea Republic']='كوريا الجنوبية';t['Australia']='أستراليا';
  t['Iran']='إيران';t['Iraq']='العراق';t['Qatar']='قطر';
  t['UAE']='الإمارات';t['United Arab Emirates']='الإمارات';
  t['Kuwait']='الكويت';t['Bahrain']='البحرين';t['Oman']='عُمان';
  t['Jordan']='الأردن';t['Syria']='سوريا';t['Lebanon']='لبنان';
  t['Palestine']='فلسطين';t['Yemen']='اليمن';t['Egypt']='مصر';
  t['China']='الصين';t['China PR']='الصين';t['India']='الهند';
  t['Thailand']='تايلاند';t['Vietnam']='فيتنام';t['Indonesia']='إندونيسيا';
  t['Philippines']='الفلبين';t['Malaysia']='ماليزيا';t['Uzbekistan']='أوزبكستان';
  t['Tajikistan']='طاجيكستان';t['Kyrgyzstan']='قيرغيزستان';
  t['Turkmenistan']='تركمانستان';t['North Korea']='كوريا الشمالية';
  t['DPR Korea']='كوريا الشمالية';t['Hong Kong']='هونغ كونغ';
  t['Macau']='ماكاو';t['Taiwan']='تايوان';t['Chinese Taipei']='تايبيه الصيني';
  t['Myanmar']='ميانمار';t['Cambodia']='كمبوديا';t['Nepal']='نيبال';
  t['Bangladesh']='بنغلاديش';t['Pakistan']='باكستان';t['Sri Lanka']='سريلانكا';
  t['Maldives']='المالديف';t['Mongolia']='منغوليا';
  /* Africa */
  t['Morocco']='المغرب';t['Nigeria']='نيجيريا';t['Senegal']='السنغال';
  t['Ghana']='غانا';t['Ivory Coast']='ساحل العاج';t["Côte d'Ivoire"]='ساحل العاج';
  t['Cameroon']='الكاميرون';t['Algeria']='الجزائر';t['Tunisia']='تونس';
  t['Libya']='ليبيا';t['Sudan']='السودان';t['South Africa']='جنوب أفريقيا';
  t['Zambia']='زامبيا';t['Mali']='مالي';t['Burkina Faso']='بوركينا فاسو';
  t['Tanzania']='تنزانيا';t['Kenya']='كينيا';t['Ethiopia']='إثيوبيا';
  t['Uganda']='أوغندا';t['Congo']='الكونغو';t['DR Congo']='الكونغو الديمقراطية';
  t['Angola']='أنغولا';t['Zimbabwe']='زيمبابوي';t['Mozambique']='موزمبيق';
  t['Gabon']='الغابون';t['Guinea']='غينيا';t['Benin']='بنين';
  t['Togo']='توغو';t['Cape Verde']='الرأس الأخضر';t['Gambia']='غامبيا';
  t['Mauritania']='موريتانيا';t['Somalia']='الصومال';t['Rwanda']='رواندا';
  /* Oceania */
  t['New Zealand']='نيوزيلندا';t['Fiji']='فيجي';
})();
/* تهريب دفاعي لبيانات API قبل حقنها في DOM (المصدر موثوق لكن دفاع متعمّق) */
window.escMatch = function(s){
  return String(s==null?'':s).replace(/[&<>"']/g,function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
};
window.teamAr = function(n){ return window.TEAMS_AR[n] || window.escMatch(n); };

window.saudiTime = function(utc){
  var d = new Date(new Date(utc).getTime()+3*3600000);
  var h = d.getUTCHours(), m = d.getUTCMinutes();
  var ap = h>=12?'م':'ص'; h = h%12||12;
  return h+':'+('0'+m).slice(-2)+' '+ap;
};
window.isTodaySaudi = function(utc){
  var now = new Date(Date.now()+3*3600000);
  var d   = new Date(new Date(utc).getTime()+3*3600000);
  return d.getUTCFullYear()===now.getUTCFullYear()&&d.getUTCMonth()===now.getUTCMonth()&&d.getUTCDate()===now.getUTCDate();
};
window.renderMatch = function(m){
  var s=m.status, live=STATUS_LIVE[s], done=STATUS_DONE[s], post=s==='POSTPONED'||s==='CANCELLED';
  var sc=m.score, hasScore=sc.home!==null&&sc.away!==null;
  var badge='';
  if(live)      badge='<span class="m-badge live">⚽ مباشر</span>';
  else if(done) badge='<span class="m-badge done">انتهت</span>';
  else if(post) badge='<span class="m-badge post">'+(s==='POSTPONED'?'مؤجلة':'ملغاة')+'</span>';
  else          badge='<span class="m-time"><span class="m-day-lbl">'+saudiDayName(m.utcDate)+'</span>'+saudiTime(m.utcDate)+'</span>';
  var score=(live||done)&&hasScore?'<div class="m-score">'+escMatch(sc.home)+' — '+escMatch(sc.away)+'</div>':'';
  var cntdn='';
  if(!live&&!done&&!post){
    var diff=new Date(m.utcDate).getTime()-Date.now();
    if(diff>0) cntdn='<div class="m-countdown" data-cntdn="'+escMatch(m.utcDate)+'">…</div>';
  }
  var hCrest=m.homeTeam.crest?'<img class="m-crest" src="'+escMatch(m.homeTeam.crest)+'" alt="" loading="lazy" onerror="this.style.display=\'none\'">':'';
  var aCrest=m.awayTeam.crest?'<img class="m-crest" src="'+escMatch(m.awayTeam.crest)+'" alt="" loading="lazy" onerror="this.style.display=\'none\'">':'';
  return '<div class="m-row'+(live?' m-live':'')+(done?' m-done':'')+'">'+
    '<div class="m-team m-home"><span class="m-tname">'+teamAr(m.homeTeam.shortName)+'</span>'+hCrest+'</div>'+
    '<div class="m-middle">'+badge+score+cntdn+'</div>'+
    '<div class="m-team m-away">'+aCrest+'<span class="m-tname">'+teamAr(m.awayTeam.shortName)+'</span></div>'+
  '</div>';
};
window.renderGroups = function(matches, listId, showDay){
  var list=document.getElementById(listId);
  if(!list) return;
  if(!matches||!matches.length){list.innerHTML='<div class="matches-empty">لا توجد مباريات</div>';return;}
  var groups={};
  matches.forEach(function(m){
    var key=m.competition.code;
    if(!groups[key]) groups[key]={comp:m.competition,items:[]};
    groups[key].items.push(m);
  });
  var html='';
  Object.keys(groups).forEach(function(code){
    var g=groups[code];
    var arName=COMP_AR[code]||escMatch(g.comp.name);
    var emblem=g.comp.emblem?'<img class="comp-emblem" src="'+escMatch(g.comp.emblem)+'" alt="" loading="lazy" onerror="this.style.display=\'none\'">':'';
    html+='<div class="comp-block"><div class="comp-header">'+emblem+'<span>'+arName+'</span></div>';
    g.items.forEach(function(m){html+=renderMatch(m);});
    html+='</div>';
  });
  list.innerHTML=html;
};

/* ── Saudi day/date helpers (used by matches.html tabs) ── */
window.saudiDateStr = function(utc){
  var d=new Date(new Date(utc).getTime()+3*3600000);
  return d.getUTCFullYear()+'-'+d.getUTCMonth()+'-'+d.getUTCDate();
};
window.nowSaudiDateStr = function(){
  var d=new Date(Date.now()+3*3600000);
  return d.getUTCFullYear()+'-'+d.getUTCMonth()+'-'+d.getUTCDate();
};
window.dayLabel = function(ds){
  var t=nowSaudiDateStr();
  if(ds===t) return 'اليوم';
  // استخرج اسم اليوم الحقيقي من التاريخ
  var parts=ds.split('-'); // year-month-date (0-based month)
  var d=new Date(Date.UTC(+parts[0],+parts[1],+parts[2]));
  var days=['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
  return days[d.getUTCDay()];
};
window.saudiDayName = function(utc){
  var d=new Date(new Date(utc).getTime()+3*3600000);
  var ds=d.getUTCFullYear()+'-'+d.getUTCMonth()+'-'+d.getUTCDate();
  var t=nowSaudiDateStr();
  if(ds===t) return 'اليوم';
  var days=['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
  return days[d.getUTCDay()];
};

/* ── Live match minute estimator ── */
window.getMatchMinute = function(m){
  var s=m.status;
  if(s==='PAUSED')           return 'ر.و';
  if(s==='PENALTY_SHOOTOUT') return 'ر.ج';
  if(!STATUS_LIVE[s])        return null;
  var elapsed=Math.floor((Date.now()-new Date(m.utcDate).getTime())/60000);
  if(elapsed<0) return null;
  if(s==='EXTRA_TIME') return Math.max(91,Math.min(elapsed-17+90,120))+"'";
  if(elapsed<=47) return Math.max(1,Math.min(elapsed,45))+"'";
  return Math.max(46,Math.min(elapsed-17,90))+"'";
};

/* ── Per-match countdown formatter ── */
window._fmtDiff = function(diff, utcDate){
  if(diff<=0) return null;
  var h=Math.floor(diff/3600000), m=Math.floor((diff%3600000)/60000), s=Math.floor((diff%60000)/1000);
  var clk = (h>0) ? '⏱ '+h+':'+('0'+m).slice(-2)+':'+('0'+s).slice(-2)
          : (m>0) ? '⏱ '+m+':'+('0'+s).slice(-2)
          :         '⏱ '+s+' ث';
  // حسب يوم المباراة بتوقيت السعودية
  if(utcDate){
    var SA=3*3600000;
    var dayIdx=function(t){ return Math.floor((t+SA)/86400000); };
    var d=dayIdx(new Date(utcDate).getTime()) - dayIdx(Date.now());
    if(d<=0) return clk;             // اليوم → عدّاد تنازلي دائماً
    if(diff<=7200000) return clk;    // قريبة جداً (ساعتان أو أقل) رغم أنها غداً
    if(d===1) return 'غداً';
    if(d===2) return 'بعد يومين';
    return 'بعد '+d+(d<=10?' أيام':' يوماً');
  }
  // fallback بدون تاريخ
  if(diff<=7200000) return clk;
  if(h>=24) return 'بعد '+Math.floor(h/24)+' يوم';
  return clk;
};
