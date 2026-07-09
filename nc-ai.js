/* nc-ai.js — AI-провайдеры (Gemini/OpenRouter/Ollama): классификация ссылок,
   выбор провайдера, стриминг, чтение статей. Общая глобальная область с
   neurocatch.js; загружается ПОСЛЕ nc-parsers.js и ПЕРЕД neurocatch.js.
   Зависит от: settings, lastRitualDebug, buildPrompt(), URL_RE (nc-parsers.js). */

const isYT=u=>/(?:youtube\.com\/(?:watch|shorts|live)|youtu\.be\/)/i.test(u);
function classifyLinks(items){const urls=[];items.forEach(c=>{(c.text.match(URL_RE)||[]).forEach(u=>urls.push(u));});return{yt:[...new Set(urls.filter(isYT))],web:[...new Set(urls.filter(u=>!isYT(u)))]};}
function providerName(){return {gemini:'Gemini',openrouter:'OpenRouter',ollama:'Ollama'}[settings.provider||'gemini'];}
function hasLLM(){const p=settings.provider||'gemini';if(p==='openrouter')return !!settings.orKey;if(p==='ollama')return !!settings.ollamaUrl;return !!settings.key;}
async function fetchReader(u){try{const r=await fetch('https://r.jina.ai/'+u,{headers:{'X-Return-Format':'markdown'}});if(!r.ok)return '';return await r.text();}catch(e){return '';}}
async function buildContextPrompt(items){
  let prompt=buildPrompt(items);
  const {web}=classifyLinks(items);const excl=new Set(settings.microExclude||[]);
  const urls=web.filter(u=>!excl.has(u)).slice(0,3);
  let ctx='';
  for(const u of urls){const t=await fetchReader(u);if(t)ctx+=`\n\n=== Текст страницы ${u} ===\n`+t.slice(0,6000);}
  if(ctx)prompt+='\n\nНиже реальный текст страниц по ссылкам — опирайся на него для конспектов, не выдумывай:'+ctx;
  return prompt;
}
async function streamLLM(items,onChunk,signal){
  const p=settings.provider||'gemini';
  if(p==='gemini')return streamGemini(items,onChunk,signal);
  const prompt=await buildContextPrompt(items);
  if(p==='openrouter')return streamOpenRouter(prompt,onChunk,signal);
  if(p==='ollama')return streamOllama(prompt,onChunk,signal);
  return streamGemini(items,onChunk,signal);
}
async function streamOpenRouter(prompt,onChunk,signal){
  lastRitualDebug={provider:'openrouter',model:settings.orModel||'meta-llama/llama-3.3-70b-instruct:free',chunks:0,finishReason:null,httpStatus:null,startedAt:Date.now()};
  const res=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',signal,headers:{'Content-Type':'application/json','Authorization':'Bearer '+settings.orKey,'HTTP-Referer':location.origin,'X-Title':'NeuroCatch'},body:JSON.stringify({model:settings.orModel||'meta-llama/llama-3.3-70b-instruct:free',stream:true,messages:[{role:'user',content:prompt}]})});
  lastRitualDebug.httpStatus=res.status;
  if(!res.ok||!res.body){let m='HTTP '+res.status;try{const e=await res.json();m=(e.error&&e.error.message)||m;lastRitualDebug.apiError=e.error||null;}catch(_){}throw new Error(m);}
  const reader=res.body.getReader(),dec=new TextDecoder();let buf='',full='';
  while(true){const {done,value}=await reader.read();if(done)break;buf+=dec.decode(value,{stream:true});let idx;while((idx=buf.indexOf('\n'))>=0){const line=buf.slice(0,idx).trim();buf=buf.slice(idx+1);if(!line.startsWith('data:'))continue;const js=line.slice(5).trim();if(js==='[DONE]')continue;try{const o=JSON.parse(js);lastRitualDebug.chunks++;const ch=o.choices&&o.choices[0];if(ch&&ch.finish_reason)lastRitualDebug.finishReason=ch.finish_reason;const t=(ch&&ch.delta&&ch.delta.content)||'';if(t){full+=t;onChunk(full);}}catch(_){}}}
  lastRitualDebug.finishedAt=Date.now();lastRitualDebug.outputLen=full.length;
  if(!full&&lastRitualDebug.finishReason&&lastRitualDebug.finishReason!=='stop')throw new Error('OpenRouter остановил генерацию: finish_reason='+lastRitualDebug.finishReason+'. Возможно, модель перегружена или превышен лимит контекста — попробуй другую модель.');
  return full;
}
async function streamOllama(prompt,onChunk,signal){
  lastRitualDebug={provider:'ollama',model:settings.ollamaModel||'llama3.1',chunks:0,httpStatus:null,startedAt:Date.now()};
  const base=(settings.ollamaUrl||'http://localhost:11434').replace(/\/$/,'');
  const res=await fetch(base+'/api/chat',{method:'POST',signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({model:settings.ollamaModel||'llama3.1',stream:true,messages:[{role:'user',content:prompt}]})});
  lastRitualDebug.httpStatus=res.status;
  if(!res.ok||!res.body)throw new Error('Ollama HTTP '+res.status);
  const reader=res.body.getReader(),dec=new TextDecoder();let buf='',full='';
  while(true){const {done,value}=await reader.read();if(done)break;buf+=dec.decode(value,{stream:true});let idx;while((idx=buf.indexOf('\n'))>=0){const line=buf.slice(0,idx).trim();buf=buf.slice(idx+1);if(!line)continue;try{const o=JSON.parse(line);lastRitualDebug.chunks++;const t=(o.message&&o.message.content)||'';if(t){full+=t;onChunk(full);}if(o.done){lastRitualDebug.finishReason=o.done_reason||'done';lastRitualDebug.finishedAt=Date.now();lastRitualDebug.outputLen=full.length;return full;}}catch(_){}}}
  lastRitualDebug.finishedAt=Date.now();lastRitualDebug.outputLen=full.length;
  return full;
}
async function streamGemini(items,onChunk,signal){
  const url=`https://generativelanguage.googleapis.com/v1beta/models/${settings.model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(settings.key)}`;
  const {yt,web}=classifyLinks(items);
  const parts=[{text:buildPrompt(items)}];
  yt.forEach(u=>parts.push({fileData:{fileUri:u}}));           // YouTube — как видео-вход
  const payload={contents:[{role:'user',parts}],generationConfig:{temperature:0.5,maxOutputTokens:8192}};
  if(web.length)payload.tools=[{url_context:{}}];               // статьи — чтение страниц
  lastRitualDebug={provider:'gemini',model:settings.model,chunks:0,finishReason:null,blockReason:null,safetyRatings:null,urlMeta:null,httpStatus:null,startedAt:Date.now()};
  const res=await fetch(url,{method:'POST',signal,headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  lastRitualDebug.httpStatus=res.status;
  if(!res.ok||!res.body){let m='HTTP '+res.status;try{const e=await res.json();m=e.error?.message||m;lastRitualDebug.apiError=e.error||null;}catch(_){}throw new Error(m);}
  const reader=res.body.getReader(),dec=new TextDecoder();let buf='',full='';
  while(true){const {done,value}=await reader.read();if(done)break;buf+=dec.decode(value,{stream:true});let idx;while((idx=buf.indexOf('\n'))>=0){const line=buf.slice(0,idx).trim();buf=buf.slice(idx+1);if(!line.startsWith('data:'))continue;const js=line.slice(5).trim();if(js==='[DONE]')continue;try{const o=JSON.parse(js);lastRitualDebug.chunks++;
    if(o.promptFeedback&&o.promptFeedback.blockReason)lastRitualDebug.blockReason=o.promptFeedback.blockReason;
    const cand=o.candidates&&o.candidates[0];
    if(cand){if(cand.finishReason&&cand.finishReason!=='STOP')lastRitualDebug.finishReason=cand.finishReason;if(cand.safetyRatings)lastRitualDebug.safetyRatings=cand.safetyRatings.filter(r=>r.probability&&r.probability!=='NEGLIGIBLE');if(cand.urlContextMetadata)lastRitualDebug.urlMeta=cand.urlContextMetadata;}
    const t=cand?.content?.parts?.[0]?.text||'';if(t){full+=t;onChunk(full);}}catch(_){}}}
  lastRitualDebug.finishedAt=Date.now();lastRitualDebug.outputLen=full.length;
  if(!full&&lastRitualDebug.blockReason)throw new Error('Запрос заблокирован Google: '+lastRitualDebug.blockReason+'. Обычно это связано с настройками безопасности или содержанием записей.');
  if(!full&&lastRitualDebug.finishReason==='MAX_TOKENS')throw new Error('Ответ обрезан по лимиту токенов (MAX_TOKENS) ещё до текста — редкий случай, попробуй короче улов.');
  if(!full&&lastRitualDebug.finishReason==='SAFETY')throw new Error('Ответ заблокирован фильтром безопасности Gemini (finishReason=SAFETY).');
  if(!full&&lastRitualDebug.finishReason==='RECITATION')throw new Error('Gemini отказался отвечать из-за похожести на защищённый контент (finishReason=RECITATION).');
  return full;
}
