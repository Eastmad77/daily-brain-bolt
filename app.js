// LIVE = today's 12 questions
const LIVE_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS6725qpD0gRYajBJaOjxcSpTFxJtS2fBzrT1XAjp9t5SHnBJCrLFuHY4C51HFV0A4MK-4c6t7jTKGG/pub?output=csv&gid=1410250735";

// BANK = full question bank
const BANK_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS6725qpD0gRYajBJaOjxcSpTFxJtS2fBzrT1XAjp9t5SHnBJCrLFuHY4C51HFV0A4MK-4c6t7jTKGG/pub?output=csv&gid=2009978011";

const elQ=document.getElementById('question'),
      elOpts=document.getElementById('options'),
      elFB=document.getElementById('feedback'),
      elMetaText=document.getElementById('metaText'),
      elToday=document.getElementById('today'),
      elProgText=document.getElementById('progressText'),
      elProgFill=document.getElementById('progressFill'),
      elScore=document.getElementById('score'),
      elStart=document.getElementById('startBtn'),
      elShuffle=document.getElementById('shuffleBtn'),
      elShare=document.getElementById('shareBtn'),
      elAgain=document.getElementById('playAgainBtn');

let allRows=[],todays=[],idx=0,score=0,selected=null,started=false;
const now=new Date();
const todayKey=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
elToday.textContent=todayKey;

// Splash auto-hide
(function(){const s=document.getElementById('splash');if(!s)return;setTimeout(()=>{s.style.display='none';},3000);})();

function toCsvUrl(u){
  if(!u) return '';
  return u.replace(/\/pubhtml.*/, '/pub?output=csv')
          .replace(/\/edit\?.*$/, '/pub?output=csv')
          .replace(/output=tsv/g,'output=csv');
}

function loadCSV(url){
  return new Promise((resolve,reject)=>{
    const finalUrl=toCsvUrl(url);
    Papa.parse(finalUrl,{
      download:true,
      header:true,
      skipEmptyLines:true,
      complete:({data})=>resolve((data||[]).filter(r=>r&&r.Question)),
      error:(err)=>reject(err)
    });
  });
}

// --- fallback questions (12 items: General Knowledge, Logic, Trivia, Pop Culture)
const FALLBACK_ROWS = [
  {Date:"",Question:"What is the capital city of Canada?",OptionA:"Ottawa",OptionB:"Toronto",OptionC:"Vancouver",OptionD:"Montreal",Answer:"Ottawa",Explanation:"Ottawa is the federal capital of Canada.",Category:"General Knowledge",Difficulty:"Easy",ID:"GK-CA-CAP"},
  {Date:"",Question:"In logic, what does '∧' represent?",OptionA:"AND",OptionB:"OR",OptionC:"NOT",OptionD:"IF",Answer:"AND",Explanation:"∧ is logical conjunction.",Category:"Logic",Difficulty:"Medium",ID:"LG-AND"},
  {Date:"",Question:"Which artist painted 'The Starry Night'?",OptionA:"Vincent van Gogh",OptionB:"Claude Monet",OptionC:"Pablo Picasso",OptionD:"Paul Cézanne",Answer:"Vincent van Gogh",Explanation:"Painted in 1889 while at Saint-Rémy.",Category:"Trivia",Difficulty:"Easy",ID:"TR-STARRY"},
  {Date:"",Question:"What is the chemical symbol for potassium?",OptionA:"K",OptionB:"P",OptionC:"Pt",OptionD:"Po",Answer:"K",Explanation:"From Neo-Latin 'kalium'.",Category:"General Knowledge",Difficulty:"Easy",ID:"GK-K"},
  {Date:"",Question:"If all Bloops are Razzies and all Razzies are Lazzies, are all Bloops Lazzies?",OptionA:"Yes",OptionB:"No",OptionC:"Only some",OptionD:"Cannot be determined",Answer:"Yes",Explanation:"Syllogism: transitive inclusion.",Category:"Logic",Difficulty:"Medium",ID:"LG-BR"},
  {Date:"",Question:"Who directed the film 'Inception' (2010)?",OptionA:"Christopher Nolan",OptionB:"Steven Spielberg",OptionC:"Denis Villeneuve",OptionD:"James Cameron",Answer:"Christopher Nolan",Explanation:"Released in 2010.",Category:"Pop Culture",Difficulty:"Easy",ID:"PC-INCEPTION"},
  {Date:"",Question:"Which planet has the largest number of moons?",OptionA:"Saturn",OptionB:"Jupiter",OptionC:"Uranus",OptionD:"Neptune",Answer:"Saturn",Explanation:"As of recent counts, Saturn leads.",Category:"General Knowledge",Difficulty:"Medium",ID:"GK-SATURN"},
  {Date:"",Question:"In Boolean algebra, what is the identity element for OR?",OptionA:"0",OptionB:"1",OptionC:"x",OptionD:"-1",Answer:"0",Explanation:"x OR 0 = x.",Category:"Logic",Difficulty:"Medium",ID:"LG-OR-ID"},
  {Date:"",Question:"Which singer released the album '1989'?",OptionA:"Taylor Swift",OptionB:"Adele",OptionC:"Katy Perry",OptionD:"Lady Gaga",Answer:"Taylor Swift",Explanation:"Originally 2014, re-released as '1989 (Taylor’s Version)'.",Category:"Pop Culture",Difficulty:"Easy",ID:"PC-1989"},
  {Date:"",Question:"What is the largest bone in the human body?",OptionA:"Femur",OptionB:"Tibia",OptionC:"Humerus",OptionD:"Pelvis",Answer:"Femur",Explanation:"Thigh bone; strongest and longest.",Category:"General Knowledge",Difficulty:"Easy",ID:"GK-FEMUR"},
  {Date:"",Question:"If 5 workers finish a job in 12 days, how many days would 10 workers take (same rate)?",OptionA:"6",OptionB:"12",OptionC:"3",OptionD:"10",Answer:"6",Explanation:"Work ∝ workers × days.",Category:"Logic",Difficulty:"Easy",ID:"LG-WORK"},
  {Date:"",Question:"Which streaming platform first released 'The Mandalorian'?",OptionA:"Disney+",OptionB:"Netflix",OptionC:"HBO Max",OptionD:"Amazon Prime Video",Answer:"Disney+",Explanation:"Premiered in 2019.",Category:"Pop Culture",Difficulty:"Easy",ID:"PC-MANDALORIAN"}
];

async function loadData(){
  try{const live=await loadCSV(LIVE_CSV_URL); if(live.length) return live;}catch(e){}
  try{const bank=await loadCSV(BANK_CSV_URL);
    if(bank.length){
      const today=bank.filter(r=>(r.Date||'').trim()===todayKey).slice(0,12);
      return today.length?today:bank.slice(0,12);
    }}catch(e){}
  try{const local=await loadCSV('/questions.csv'); if(local.length) return local.slice(0,12);}catch(e){}
  return FALLBACK_ROWS;
}

function norm(s){return String(s||'').trim();}
function updateMeta(){elProgText.textContent=`${idx}/${todays.length||0}`;const pct=(todays.length?(idx/todays.length):0)*100;elProgFill.style.inset=`0 ${100-pct}% 0 0`;elScore.textContent=String(score);}
function showQuestion(){
  const q=todays[idx];
  if(!q){elFB.innerHTML='';elQ.textContent='All done!';elAgain.classList.remove('hidden');return}
  selected=null;elAgain.classList.add('hidden');elFB.innerHTML='';
  elMetaText.textContent=`${q.Difficulty||'—'} • ${q.Category||'Quiz'}`;
  elQ.textContent=q.Question||'—';
  const opts=[q.OptionA,q.OptionB,q.OptionC,q.OptionD].filter(Boolean);
  elOpts.innerHTML='';
  opts.forEach((optText)=>{
    const btn=document.createElement('button');
    btn.className='choice';
    btn.textContent=optText;
    btn.onclick=()=>onSelect(btn,optText);
    elOpts.appendChild(btn);
  });
}
function onSelect(btn,val){
  if(!started)return;
  document.querySelectorAll('.choice').forEach(b=>{b.classList.add('disabled');b.disabled=true});
  selected=val;
  const q=todays[idx];
  const isCorrect=norm(selected).toLowerCase()===norm(q.Answer).toLowerCase();
  if(isCorrect){btn.classList.add('correct');elFB.textContent='Correct!';score++;idx++;}else{btn.classList.add('incorrect');elFB.textContent='Incorrect.';idx++;}
  updateMeta();setTimeout(showQuestion,700);
}
document.getElementById('startBtn')?.addEventListener('click',async()=>{
  if(!allRows.length){elQ.textContent='Loading…';
    try{allRows=await loadData();}catch(e){elQ.textContent='Couldn’t load CSV. Ensure sheet is Published to web.';return}}
  todays=(allRows||[]).filter(r=>norm(r.Date)===todayKey);
  if(!todays.length)todays=(allRows||[]).slice(0,12);
  idx=0;score=0;started=true;updateMeta();showQuestion();
});
document.getElementById('shuffleBtn')?.addEventListener('click',()=>{
  if(!todays.length)return;
  for(let i=todays.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[todays[i],todays[j]]=[todays[j],todays[i]]}
  idx=0;score=0;started=true;updateMeta();showQuestion();
});
document.getElementById('shareBtn')?.addEventListener('click',async()=>{
  const url=location.href;
  if(navigator.share){
    try{await navigator.share({title:'Brain Bolt',text:'Try today’s set!',url})}catch(e){}
  }else{
    try{await navigator.clipboard.writeText(url)}catch(e){}
  }
});
document.getElementById('playAgainBtn')?.addEventListener('click',()=>{
  if(!todays.length)return;idx=0;score=0;started=true;elFB.textContent='';updateMeta();showQuestion();
});
